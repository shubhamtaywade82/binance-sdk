import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WatchlistScanner } from '../../src/agent/scanner.js';
import { BinanceClient } from '../../src/client/BinanceClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockGates(): void {
  server.use(
    http.get('https://fapi.binance.com/fapi/v1/exchangeInfo', () =>
      HttpResponse.json({
        timezone: 'UTC', serverTime: 1,
        symbols: [
          { symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'PERPETUAL' },
          { symbol: 'ETHUSDT', status: 'TRADING', baseAsset: 'ETH', quoteAsset: 'USDT', contractType: 'PERPETUAL' },
          { symbol: 'SOLUSDT', status: 'TRADING', baseAsset: 'SOL', quoteAsset: 'USDT', contractType: 'PERPETUAL' },
          { symbol: 'BTCUSDT_260626', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT', contractType: 'CURRENT_QUARTER' },
          { symbol: 'HALTEDUSDT', status: 'SETTLING', baseAsset: 'X', quoteAsset: 'USDT', contractType: 'PERPETUAL' },
        ],
      })),
    http.get('https://fapi.binance.com/fapi/v1/ticker/bookTicker', ({ request }) => {
      const symbol = new URL(request.url).searchParams.get('symbol');
      if (symbol === 'SOLUSDT') {
        return HttpResponse.json({ symbol, bidPrice: '100.00', bidQty: '1', askPrice: '100.50', askQty: '1' });
      }
      return HttpResponse.json({ symbol, bidPrice: '100.00', bidQty: '1', askPrice: '100.01', askQty: '1' });
    }),
    http.get('https://fapi.binance.com/fapi/v1/openInterest', ({ request }) => {
      const symbol = new URL(request.url).searchParams.get('symbol');
      const oi = symbol === 'ETHUSDT' ? '50' : '5000'; // ETH fails the OI floor
      return HttpResponse.json({ symbol, openInterest: oi, time: 1 });
    }),
  );
}

describe('WatchlistScanner', () => {
  it('gates the volume-ranked watchlist: perpetuals only, spread + volume + OI floors', async () => {
    mockGates();
    const client = new BinanceClient({ testnet: false, maxRetries: 0 });
    const scanner = new WatchlistScanner(client, {
      profile: {
        scanIntervalMs: 1, cycleIntervalMs: 1, watchlistSize: 10,
        minQuoteVolume24h: 100_000_000, minOpenInterestUsd: 200_000, maxSpreadBps: 5,
        confluenceEntry: 70, confluenceSwing: 80, riskPerTradePct: 2.5,
        riskPerTradePctHighConviction: 3, maxLeverage: 20, maxIntradayPositions: 4,
        maxSwingPositions: 2, maxPerCluster: 2, deadmanMs: 300_000,
        trailCallbackPct: 1, trailCallbackWidePct: 1.5, timeStopHours: 4,
      },
    });
    scanner.ingestTickers([
      { symbol: 'BTCUSDT', quoteVolume: 500_000_000 },   // passes everything
      { symbol: 'ETHUSDT', quoteVolume: 400_000_000 },   // OI floor fails
      { symbol: 'SOLUSDT', quoteVolume: 300_000_000 },   // spread fails (50 bps)
      { symbol: 'BTCUSDT_260626', quoteVolume: 200_000_000 }, // not a perpetual
      { symbol: 'HALTEDUSDT', quoteVolume: 150_000_000 },      // not TRADING
      { symbol: 'TINYUSDT', quoteVolume: 1000 },          // below top-N contention anyway
    ]);

    const watch = await scanner.eligibleWatchlist();
    expect(watch.map((w) => w.symbol)).toEqual(['BTCUSDT']);
    expect(watch[0]!.cluster).toBe('BTC-BETA');
    expect(watch[0]!.spreadBps).toBeCloseTo(1, 3);   // (0.01/100.005)*10000
    expect(watch[0]!.oiUsd).toBeCloseTo(5000 * 100.005, 5);
  });

  it('skips symbols whose gate calls error instead of failing the scan', async () => {
    mockGates();
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/ticker/bookTicker', () =>
        new HttpResponse(null, { status: 500 })),
    );
    const client = new BinanceClient({ testnet: false, maxRetries: 0 });
    const scanner = new WatchlistScanner(client);
    scanner.ingestTickers([{ symbol: 'BTCUSDT', quoteVolume: 500_000_000 }]);

    const watch = await scanner.eligibleWatchlist();
    expect(watch).toEqual([]); // errored symbol skipped, scan survived
  });

  it('topByVolume ranks by quote volume within the watchlist size', async () => {
    mockGates();
    const client = new BinanceClient({ testnet: false, maxRetries: 0 });
    const scanner = new WatchlistScanner(client);
    scanner.ingestTickers([
      { symbol: 'BTCUSDT', quoteVolume: 100 },
      { symbol: 'ETHUSDT', quoteVolume: 300 },
      { symbol: 'SOLUSDT', quoteVolume: 200 },
    ]);
    const top = await scanner.topByVolume();
    expect(top.map((t) => t.symbol)).toEqual(['ETHUSDT', 'SOLUSDT', 'BTCUSDT']);
  });
});
