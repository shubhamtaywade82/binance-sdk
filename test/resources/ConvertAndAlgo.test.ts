import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { Algo } from '../../src/resources/Algo.js';
import { Convert } from '../../src/resources/Convert.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://api.binance.com';
function http_(): HttpClient {
  return new HttpClient({ baseURL: BASE, apiKey: 'k', apiSecret: 's' });
}

describe('Convert', () => {
  it('parses getQuote response', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/convert/getQuote`, () =>
        HttpResponse.json({
          quoteId: 'q1',
          ratio: '0.0001',
          inverseRatio: '10000',
          validTimestamp: 1_700_000_000,
          toAmount: '0.0001',
          fromAmount: '1',
        })),
    );
    const q = await new Convert(http_()).getQuote({ fromAsset: 'USDT', toAsset: 'BTC', fromAmount: '1' });
    expect(q.quoteId).toBe('q1');
    expect(q.ratio).toBe(0.0001);
  });

  it('parses acceptQuote response', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/convert/acceptQuote`, () =>
        HttpResponse.json({
          orderId: 'o1',
          orderStatus: 'PROCESS',
          fromAsset: 'USDT',
          fromAmount: '1',
          toAsset: 'BTC',
          toAmount: '0.0001',
          ratio: '0.0001',
          createTime: 1,
        })),
    );
    const r = await new Convert(http_()).acceptQuote('q1');
    expect(r.orderId).toBe('o1');
    expect(r.fromAmount).toBe(1);
  });

  it('parses orderStatus', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/orderStatus`, () =>
        HttpResponse.json({ orderId: 'o1', orderStatus: 'SUCCESS', fromAsset: 'USDT', toAsset: 'BTC', ratio: '0.0001' })),
    );
    const r = await new Convert(http_()).orderStatus({ orderId: 'o1' });
    expect(r.orderStatus).toBe('SUCCESS');
  });

  it('parses tradeFlow', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/tradeFlow`, () =>
        HttpResponse.json([
          { orderId: '1', fromAsset: 'USDT', fromAmount: '100', toAsset: 'BTC', toAmount: '0.001', ratio: '0.00001', createTime: 1, status: 'SUCCESS' },
        ]),
      ),
    );
    const flow = await new Convert(http_()).tradeFlow();
    expect(flow[0]?.orderId).toBe('1');
    expect(flow[0]?.fromAmount).toBe(100);
  });

  it('parses exchangeInfo', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/exchangeInfo`, () =>
        HttpResponse.json([
          { fromAsset: 'USDT', toAsset: 'BTC', fromAssetMinAmount: '10', fromAssetMaxAmount: '100000' },
        ]),
      ),
    );
    const pairs = await new Convert(http_()).exchangeInfo();
    expect(pairs[0]?.fromAsset).toBe('USDT');
  });

  it('parses assetInfo', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/assetInfo`, () =>
        HttpResponse.json({ fromAsset: 'USDT', toAsset: 'BTC', fromAssetMinAmount: '10', fromAssetMaxAmount: '100000' })),
    );
    const info = await new Convert(http_()).assetInfo({ fromAsset: 'USDT', toAsset: 'BTC' });
    expect(info.fromAsset).toBe('USDT');
  });
});

describe('Algo', () => {
  it('parses spot historicalOrders', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/algo/spot/historicalOrders`, () =>
        HttpResponse.json([
          { algoId: 1, symbol: 'BTCUSDT', side: 'BUY', type: 'TWAP', quantity: '1', duration: 60, status: 'COMPLETED', createTime: 1 },
        ]),
      ),
    );
    const orders = await new Algo(http_()).spot.historicalOrders();
    expect(orders[0]?.algoId).toBe(1);
    expect(orders[0]?.quantity).toBe(1);
  });

  it('parses spot TWAP new-order response', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/algo/spot/newOrderTwap`, () =>
        HttpResponse.json({
          algoId: 42,
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'TWAP',
          quantity: '1',
          duration: 60,
          status: 'NEW',
          createTime: 1,
        })),
    );
    const order = await new Algo(http_()).spot.newOrderTwap({
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: '1',
      duration: 60,
    });
    expect(order.algoId).toBe(42);
    expect(order.status).toBe('NEW');
  });

  it('parses futures subOrders', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/algo/futures/subOrders`, () =>
        HttpResponse.json([
          { subId: 1, algoId: 42, symbol: 'BTCUSDT', side: 'BUY', price: '50000', quantity: '0.1', executedQty: '0.1', status: 'FILLED', time: 1 },
        ]),
      ),
    );
    const subs = await new Algo(http_()).futures.subOrders({ algoId: '42' });
    expect(subs[0]?.subId).toBe(1);
    expect(subs[0]?.price).toBe(50000);
  });
});
