import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { CoinMData } from '../../src/resources/CoinMData.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const DAPI = 'https://dapi.binance.com';
const FUTURES_DATA = 'https://fapi.binance.com';

describe('CoinMData', () => {
  it('fetches basis from /futures/data host', async () => {
    server.use(
      http.get(`${FUTURES_DATA}/futures/data/basis`, () =>
        HttpResponse.json([
          {
            pair: 'BTCUSD',
            contractType: 'CURRENT_QUARTER',
            basis: '0.5',
            basisRate: '0.001',
            futuresPrice: '50000',
            indexPrice: '49950',
            timestamp: 1_700_000_000,
          },
        ]),
      ),
    );
    const data = new CoinMData(
      new HttpClient({ baseURL: DAPI, apiKey: 'k', apiSecret: 's' }),
      new HttpClient({ baseURL: FUTURES_DATA, apiKey: 'k', apiSecret: 's' }),
    );
    const basis = await data.basis('BTCUSD', 'CURRENT_QUARTER', '5m');
    expect(basis.length).toBe(1);
    expect((basis[0] as { pair: string }).pair).toBe('BTCUSD');
  });

  it('fetches globalLongShortAccountRatio', async () => {
    server.use(
      http.get(`${FUTURES_DATA}/futures/data/globalLongShortAccountRatio`, () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', longShortRatio: '1.5', longAccount: '0.6', shortAccount: '0.4', timestamp: 1 },
        ]),
      ),
    );
    const data = new CoinMData(
      new HttpClient({ baseURL: DAPI, apiKey: 'k', apiSecret: 's' }),
      new HttpClient({ baseURL: FUTURES_DATA, apiKey: 'k', apiSecret: 's' }),
    );
    const r = await data.globalLongShortAccountRatio('BTCUSDT', '5m');
    expect(r.length).toBe(1);
    expect((r[0] as { longShortRatio: string }).longShortRatio).toBe('1.5');
  });

  it('fetches takerBuySellVol', async () => {
    server.use(
      http.get(`${FUTURES_DATA}/futures/data/takerBuySellVol`, () =>
        HttpResponse.json([
          { buySellRatio: '1.2', buyVol: '100', sellVol: '83.3', timestamp: 1 },
        ]),
      ),
    );
    const data = new CoinMData(
      new HttpClient({ baseURL: DAPI, apiKey: 'k', apiSecret: 's' }),
      new HttpClient({ baseURL: FUTURES_DATA, apiKey: 'k', apiSecret: 's' }),
    );
    const r = await data.takerBuySellVol('BTCUSDT', '5m');
    expect(r.length).toBe(1);
  });
});
