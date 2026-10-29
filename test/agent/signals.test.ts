import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { scoreFromInputs, scoreSymbol, type SignalInputs } from '../../src/agent/signals.js';
import { BinanceClient } from '../../src/client/BinanceClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Geometry kept inside the 1.2-ATR stop guard on purpose. */
const base: SignalInputs = {
  regime: 'TREND_UP',
  close: 105,
  a5: 2,
  e20up: true,
  vwap: 100,
  imbalance: 1.8,
  taker: 1.3,
  oiRise: true,
  avgFunding: 0.0001,
  posPct: 0.05,
  lastLow: 104,
  lastHigh: 106,
};

describe('scoreFromInputs', () => {
  it('scores a full-confluence long', () => {
    const sig = scoreFromInputs(base)!;
    expect(sig).not.toBeNull();
    expect(sig.direction).toBe('LONG');
    expect(sig.setup).toBe('CONTINUATION');
    // 20 + 15 + 10 + 15 + 15 + 10 + 10 = 95
    expect(sig.score).toBe(95);
    expect(sig.vetoes).toEqual([]);
    expect(sig.stopHint).toBeCloseTo(104 - 0.2, 10); // lastLow - 0.1*ATR
  });

  it('direction follows the regime down for TREND_DOWN shorts', () => {
    const sig = scoreFromInputs({
      ...base,
      regime: 'TREND_DOWN',
      e20up: false,
      vwap: 110,
      imbalance: 0.5,
      taker: 0.8,
      posPct: 0.95,
      lastLow: 104,
      lastHigh: 106,
    })!;
    expect(sig.direction).toBe('SHORT');
    expect(sig.score).toBe(95);
    expect(sig.stopHint).toBeCloseTo(106 + 0.2, 10); // lastHigh + 0.1*ATR
  });

  it('RANGE regimes trade the sweep fade, direction from crowd extremes', () => {
    const long = scoreFromInputs({ ...base, regime: 'RANGE', posPct: 0.05 })!;
    expect(long.setup).toBe('SWEEP_FADE');
    expect(long.direction).toBe('LONG');
  });

  it('no direction without a trend or crowd extreme', () => {
    expect(scoreFromInputs({ ...base, regime: 'RANGE', posPct: 0.5 })).toBeNull();
  });

  it('BOOK_IMBALANCE_OPPOSITE is a hard veto that still scores', () => {
    const sig = scoreFromInputs({ ...base, imbalance: 0.5 })!;
    expect(sig.vetoes).toContain('BOOK_IMBALANCE_OPPOSITE');
    expect(sig.score).toBe(95 - 10); // imbalance factor scores zero
  });

  it('refuses stops wider than 1.2 ATR', () => {
    expect(scoreFromInputs({ ...base, lastLow: 95 })).toBeNull();
  });

  it('crowd-skew contrarian points only fire at the extremes', () => {
    const sig = scoreFromInputs({ ...base, posPct: 0.5 })!;
    expect(sig.score).toBe(95 - 10);
  });
});

describe('scoreSymbol', () => {
  it('fetches inputs through the SDK and delegates to the scorer', async () => {
    // Raw Binance kline: [openTime, open, high, low, close, volume, closeTime,
    // quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
    const kline = (openTime: number, close: number): unknown[] => [
      openTime, String(close - 1), String(close + 1), String(close - 1),
      String(close), '100', openTime + 1, '10000', 10, '60', '40', '0',
    ];
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/klines', ({ request }) => {
        const interval = new URL(request.url).searchParams.get('interval');
        const closes = interval === '5m' ? [100, 101, 102, 103, 105] : [100, 101, 102, 103, 104];
        return HttpResponse.json(closes.map((c, i) => kline(i + 1, c)));
      }),
      http.get('https://fapi.binance.com/fapi/v1/depth', () =>
        HttpResponse.json({
          lastUpdateId: 1,
          bids: [['100', '30'], ['99', '30']],
          asks: [['101', '20'], ['102', '20']],
        })),
      http.get('https://fapi.binance.com/futures/data/openInterestHist', () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', sumOpenInterest: '1000', sumOpenInterestValue: '105000', timestamp: 1 },
          { symbol: 'BTCUSDT', sumOpenInterest: '1100', sumOpenInterestValue: '115500', timestamp: 2 },
        ])),
      http.get('https://fapi.binance.com/futures/data/topLongShortPositionRatio', () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', longShortRatio: '1.1', longAccount: '0.52', shortAccount: '0.48', timestamp: 1 },
          { symbol: 'BTCUSDT', longShortRatio: '0.95', longAccount: '0.49', shortAccount: '0.51', timestamp: 2 },
        ])),
      http.get('https://fapi.binance.com/fapi/v1/fundingRate', () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', fundingTime: 1, fundingRate: '0.0001' },
        ])),
    );

    const client = new BinanceClient({ testnet: false });
    const sig = await scoreSymbol(client, 'BTCUSDT', 'TREND_UP', 0);
    expect(sig).not.toBeNull();
    expect(sig!.direction).toBe('LONG');
    expect(sig!.setup).toBe('CONTINUATION');
    expect(sig!.entryHint).toBe(105);
    // EMA +20, VWAP +15, imbalance 1.5 +10, taker 1.5 +15, OI rise +15,
    // funding +10, crowd neutral 0 -> 85.
    expect(sig!.score).toBe(85);
  });
});

describe('scoreSymbol closed-candle policy', () => {
  it('drops the still-forming candle — signals come from closed bars only', async () => {
    const kline = (openTime: number, close: number, closeTime: number): unknown[] => [
      openTime, String(close - 1), String(close + 1), String(close - 1),
      String(close), '100', closeTime, '10000', 10, '60', '40', '0',
    ];
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/klines', ({ request }) => {
        const interval = new URL(request.url).searchParams.get('interval');
        if (interval === '5m') {
          // Last bar closes far in the future -> forming, must be dropped.
          return HttpResponse.json([
            kline(1, 100, Date.now() - 10_000),
            kline(2, 101, Date.now() - 5_000),
            kline(3, 200, Date.now() + 300_000), // forming, close 200 is a fakeout
          ]);
        }
        return HttpResponse.json([kline(1, 100, 1), kline(2, 101, 2)]);
      }),
      http.get('https://fapi.binance.com/fapi/v1/depth', () =>
        HttpResponse.json({
          lastUpdateId: 1,
          bids: [['100', '30'], ['99', '30']],
          asks: [['101', '20'], ['102', '20']],
        })),
      http.get('https://fapi.binance.com/futures/data/openInterestHist', () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', sumOpenInterest: '1000', sumOpenInterestValue: '105000', timestamp: 1 },
          { symbol: 'BTCUSDT', sumOpenInterest: '1100', sumOpenInterestValue: '115500', timestamp: 2 },
        ])),
      http.get('https://fapi.binance.com/futures/data/topLongShortPositionRatio', () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', longShortRatio: '1.1', longAccount: '0.52', shortAccount: '0.48', timestamp: 1 },
        ])),
      http.get('https://fapi.binance.com/fapi/v1/fundingRate', () =>
        HttpResponse.json([{ symbol: 'BTCUSDT', fundingTime: 1, fundingRate: '0.0001' }])),
    );

    const client = new BinanceClient();
    const sig = await scoreSymbol(client, 'BTCUSDT', 'TREND_UP', 0);
    expect(sig).not.toBeNull();
    // Entry hint must be the last CLOSED close (101), never the forming 200.
    expect(sig!.entryHint).toBe(101);
  });
});
