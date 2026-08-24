import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CoinMMarket } from '../../src/resources/CoinMMarket.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function market(): CoinMMarket {
  return new CoinMMarket(new HttpClient({ baseURL: 'https://dapi.binance.com/dapi/v1' }));
}

describe('CoinMMarket', () => {
  it('fetches klines', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/klines', () =>
        HttpResponse.json([[1, '60000', '61000', '59000', '60500', '10', 2, '600000', 3, '5', '300000', '0']]),
      ),
    );

    const klines = await market().klines('BTCUSD_PERP', '1h');
    expect(klines[0]?.close).toBe(60500);
  });

  it('fetches funding rate history', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/fundingRate', () =>
        HttpResponse.json([{ symbol: 'BTCUSD_PERP', fundingTime: 1, fundingRate: '0.0001' }]),
      ),
    );

    const rates = await market().fundingRateHistory('BTCUSD_PERP');
    expect(rates[0]?.fundingRate).toBe(0.0001);
  });

  it('fetches open interest', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/openInterest', () =>
        HttpResponse.json({ symbol: 'BTCUSD_PERP', pair: 'BTCUSD', openInterest: '100', contractType: 'PERPETUAL', time: 1 }),
      ),
    );

    const oi = await market().openInterest('BTCUSD_PERP');
    expect(oi.openInterest).toBe(100);
  });

  it('fetches open interest history with pair-based schema', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/openInterestHist', () =>
        HttpResponse.json([{ pair: 'BTCUSD', contractType: 'PERPETUAL', sumOpenInterest: '10', sumOpenInterestValue: '600000', timestamp: 1 }]),
      ),
    );

    const hist = await market().openInterestHist('BTCUSD', 'PERPETUAL', '5m');
    expect(hist[0]?.sumOpenInterest).toBe(10);
  });
});
