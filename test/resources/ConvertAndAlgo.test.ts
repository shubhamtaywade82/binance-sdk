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
    // Wave 8 transition union: the legacy pair-limits shape must keep parsing
    // ('fromAsset' in info narrows out the per-asset-precision array branch).
    expect('fromAsset' in info ? info.fromAsset : undefined).toBe('USDT');
  });
});

describe('Algo', () => {
  // Wave 8: the mocks carry the documented (and live) wire shapes. The
  // pre-Wave-8 mocks below asserted plain arrays / full order echoes —
  // shapes that never existed on the wire; the old schemas threw on every
  // real response. See test/resources/Wave8Algo.test.ts for the full
  // oracle-schema acceptance suite.
  it('parses spot historicalOrders (wrapped { total, orders })', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/algo/spot/historicalOrders`, () =>
        HttpResponse.json({
          total: 1,
          orders: [
            { algoId: 1, symbol: 'BTCUSDT', side: 'BUY', totalQty: '1', executedQty: '1', executedAmt: '50000', avgPrice: '50000', algoType: 'TWAP', algoStatus: 'COMPLETED', bookTime: 1, endTime: 2, duration: 60 },
          ],
        })),
    );
    const r = await new Algo(http_()).spot.historicalOrders();
    expect(r.total).toBe(1);
    expect(r.orders?.[0]?.algoId).toBe(1);
    expect(r.orders?.[0]?.totalQty).toBe(1);
  });

  it('parses spot TWAP new-order ack ({ clientAlgoId, success, code, msg })', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/algo/spot/newOrderTwap`, () =>
        HttpResponse.json({
          clientAlgoId: 'c1',
          success: true,
          code: 0,
          msg: 'success',
        })),
    );
    const ack = await new Algo(http_()).spot.newOrderTwap({
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: '1',
      duration: 60,
    });
    expect(ack.clientAlgoId).toBe('c1');
    expect(ack.success).toBe(true);
  });

  it('parses futures subOrders (wrapped { total, executedQty, executedAmt, subOrders })', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/algo/futures/subOrders`, () =>
        HttpResponse.json({
          total: 1,
          executedQty: '0.1',
          executedAmt: '5000',
          subOrders: [
            { subId: 1, algoId: 42, symbol: 'BTCUSDT', side: 'BUY', avgPrice: '50000', executedQty: '0.1', executedAmt: '5000', orderStatus: 'FILLED', bookTime: 1 },
          ],
        })),
    );
    const r = await new Algo(http_()).futures.subOrders({ algoId: '42' });
    expect(r.subOrders?.[0]?.subId).toBe(1);
    expect(r.subOrders?.[0]?.avgPrice).toBe(50000);
  });
});
