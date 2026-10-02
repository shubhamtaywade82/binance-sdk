import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FuturesMarket } from '../../src/resources/FuturesMarket.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('FuturesMarket', () => {
  it('fetches and parses klines from the fapi base URL', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/klines', () =>
        HttpResponse.json([
          [1, '1', '2', '0.5', '1.5', '10', 2, '15', 3, '5', '7.5', '0'],
        ]),
      ),
    );

    const market = new FuturesMarket();
    const klines = await market.klines('SOLUSDT', '15m');
    expect(klines[0]?.close).toBe(1.5);
  });

  it('fetches ticker24hr', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/ticker/24hr', () =>
        HttpResponse.json({
          symbol: 'SOLUSDT', priceChange: '1', priceChangePercent: '1',
          weightedAvgPrice: '100', lastPrice: '101', lastQty: '1',
          openPrice: '100', highPrice: '102', lowPrice: '99',
          volume: '1000', quoteVolume: '100000', openTime: 1, closeTime: 2,
          firstId: 1, lastId: 2, count: 2,
        }),
      ),
    );

    const market = new FuturesMarket();
    const ticker = await market.ticker24hr('SOLUSDT');
    expect(ticker.lastPrice).toBe(101);
  });

  it('fetches continuous klines', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/continuousKlines', () =>
        HttpResponse.json([[1, '1', '2', '0.5', '1.5', '10', 2, '15', 3, '5', '7.5', '0']]),
      ),
    );

    const market = new FuturesMarket();
    const klines = await market.continuousKlines('BTCUSDT', 'perpetual', '1h');
    expect(klines[0]?.close).toBe(1.5);
  });

  it('fetches trading day ticker', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/tradingDayTicker', () =>
        HttpResponse.json([{ symbol: 'BTCUSDT', priceChange: '100' }]),
      ),
    );

    const market = new FuturesMarket();
    const ticker = await market.tradingDayTicker('BTCUSDT');
    expect((ticker[0] as { symbol: string }).symbol).toBe('BTCUSDT');
  });

  it('fetches the trading schedule from /fapi/v1/tradingSchedule (public, no params)', async () => {
    let url: URL | undefined;
    let apiKey: string | null = null;
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/tradingSchedule', ({ request }) => {
        url = new URL(request.url);
        apiKey = request.headers.get('X-MBX-APIKEY');
        return HttpResponse.json({ updateTime: 1, marketSchedules: { EQUITY: { sessions: [] } } });
      }),
    );

    const market = new FuturesMarket();
    const schedule = (await market.tradingSchedule()) as { updateTime: number };
    expect(schedule.updateTime).toBe(1);
    expect(url?.search).toBe('');
    expect(apiKey).toBeNull();
  });

  it('fetches v2 ticker price', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v2/ticker/price', () =>
        HttpResponse.json({ symbol: 'BTCUSDT', price: '60000' }),
      ),
    );

    const market = new FuturesMarket();
    const ticker = await market.tickerPriceV2('BTCUSDT');
    expect((ticker as { price: number }).price).toBe(60000);
  });

  it('resolves instrument details from exchangeInfo', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/exchangeInfo', () =>
        HttpResponse.json({
          timezone: 'UTC', serverTime: 1,
          symbols: [{ symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT' }],
        }),
      ),
    );

    const market = new FuturesMarket();
    const details = await market.instrumentDetails('BTCUSDT');
    expect(details.baseAsset).toBe('BTC');
  });

  it('fetches premium index klines', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/premiumIndexKlines', () =>
        HttpResponse.json([[1, '1', '2', '0.5', '1.5', '10', 2, '15', 3, '5', '7.5', '0']]),
      ),
    );

    const market = new FuturesMarket();
    const klines = await market.premiumIndexKlines('BTCUSDT', '1h');
    expect(klines[0]?.close).toBe(1.5);
  });

  it('fetches RPI order book depth', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/rpiDepth', () =>
        HttpResponse.json({ lastUpdateId: 1, bids: [['60000', '1']], asks: [['60001', '1']] }),
      ),
    );

    const market = new FuturesMarket();
    const depth = await market.rpiDepth('BTCUSDT');
    expect(depth.bids[0]?.price).toBe(60000);
  });

  it('throws when instrument is not found', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/exchangeInfo', () =>
        HttpResponse.json({
          timezone: 'UTC', serverTime: 1,
          symbols: [{ symbol: 'ETHUSDT', status: 'TRADING', baseAsset: 'ETH', quoteAsset: 'USDT' }],
        }),
      ),
    );

    const market = new FuturesMarket();
    await expect(market.instrumentDetails('BTCUSDT')).rejects.toThrow('not found');
  });
});
