import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FuturesTrading } from '../../src/resources/FuturesTrading.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function trading(): FuturesTrading {
  return new FuturesTrading(new HttpClient({ baseURL: 'https://fapi.binance.com', apiKey: 'k', apiSecret: 's' }));
}

const ACK_ORDER = {
  orderId: 123, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'c1', price: '60000', avgPrice: '0',
  origQty: '0.01', executedQty: '0', cumQuote: '0', type: 'LIMIT', reduceOnly: false, side: 'BUY',
  positionSide: 'BOTH', timeInForce: 'GTC', time: 1, updateTime: 1, workingType: 'CONTRACT_PRICE', origType: 'LIMIT',
};

describe('FuturesTrading', () => {
  it('places a limit order', async () => {
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', () => HttpResponse.json(ACK_ORDER)),
    );

    const order = await trading().createOrder({
      symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.01, price: 60000, timeInForce: 'GTC',
    });
    expect(order.orderId).toBe(123);
    expect(order.status).toBe('NEW');
  });

  it('creates a test order', async () => {
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order/test', () => HttpResponse.json({})),
    );

    const res = await trading().createTestOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01 });
    expect(res).toEqual({});
  });

  it('queries an order', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/order', () => HttpResponse.json({ ...ACK_ORDER, status: 'FILLED' })),
    );

    const order = await trading().getOrder('BTCUSDT', { orderId: 123 });
    expect(order.status).toBe('FILLED');
  });

  it('cancels an order via DELETE', async () => {
    let method = '';
    server.use(
      http.delete('https://fapi.binance.com/fapi/v1/order', ({ request }) => {
        method = request.method;
        return HttpResponse.json({ ...ACK_ORDER, status: 'CANCELED' });
      }),
    );

    const order = await trading().cancelOrder('BTCUSDT', { orderId: 123 });
    expect(method).toBe('DELETE');
    expect(order.status).toBe('CANCELED');
  });

  it('sets leverage', async () => {
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/leverage', () =>
        HttpResponse.json({ leverage: 20, maxNotionalValue: '100000', symbol: 'BTCUSDT' }),
      ),
    );

    const res = await trading().setLeverage('BTCUSDT', 20);
    expect(res.leverage).toBe(20);
  });

  it('creates batch orders with JSON-stringified batchOrders param', async () => {
    let batchParam = '';
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/batchOrders', ({ request }) => {
        batchParam = request.url;
        return HttpResponse.json([ACK_ORDER]);
      }),
    );

    const res = await trading().createBatchOrders([
      { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 0.01, price: 60000 },
    ]);
    expect(res[0]?.orderId).toBe(123);
    expect(batchParam).toContain('batchOrders=%5B%7B');
  });

  it('cancels all open orders', async () => {
    server.use(
      http.delete('https://fapi.binance.com/fapi/v1/allOpenOrders', () => HttpResponse.json({ code: 200, msg: 'ok' })),
    );

    const res = await trading().cancelAllOpenOrders('BTCUSDT');
    expect(res.code).toBe(200);
  });

  it('sets margin type', async () => {
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/marginType', () => HttpResponse.json({ code: 200, msg: 'ok' })),
    );

    const res = await trading().setMarginType('BTCUSDT', 'isolated');
    expect(res.msg).toBe('ok');
  });

  it('fetches convert exchange info (public)', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/convert/exchangeInfo', () =>
        HttpResponse.json([{ fromAsset: 'BTC', toAsset: 'USDT' }]),
      ),
    );

    const res = await trading().convertExchangeInfo({ fromAsset: 'BTC' });
    expect((res[0] as { fromAsset: string }).fromAsset).toBe('BTC');
  });

  it('gets a convert quote and accepts it', async () => {
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/convert/getQuote', () =>
        HttpResponse.json({ quoteId: 'q1', ratio: '60000' }),
      ),
      http.post('https://fapi.binance.com/fapi/v1/convert/acceptQuote', () =>
        HttpResponse.json({ orderId: 'o1', createTime: 1, orderStatus: 'PROCESS' }),
      ),
    );

    const quote = await trading().convertGetQuote({ fromAsset: 'BTC', toAsset: 'USDT', fromAmount: 0.01 });
    expect(quote.quoteId).toBe('q1');

    const accepted = await trading().convertAcceptQuote('q1');
    expect(accepted.orderId).toBe('o1');
  });
});

// ---------------------------------------------------------------------------
// v3.5.1: endpoint-specific response contracts
// ---------------------------------------------------------------------------

describe('FuturesTrading (v3.5.1 ACK / cancel response contracts)', () => {
  it('parses a true ACK response — no avgPrice, executedQty, cumQuote or reduceOnly', async () => {
    // Binance's documented ACK payload: order identity only. v3.5.0's schema
    // required the RESULT-only fields and would reject this response.
    const TRUE_ACK = {
      symbol: 'BTCUSDT',
      orderId: 987654321,
      clientOrderId: 'nbsdk-ack',
      price: '0',
      origQty: '0.001',
      type: 'STOP_MARKET',
      side: 'SELL',
      positionSide: 'SHORT',
      status: 'NEW',
      stopPrice: '9300',
      workingType: 'CONTRACT_PRICE',
      origType: 'TRAILING_STOP_MARKET',
      time: 1566816477111,
      updateTime: 1566816477118,
    };
    server.use(http.post('https://fapi.binance.com/fapi/v1/order', () => HttpResponse.json(TRUE_ACK)));

    const ack = await trading().createOrder({
      symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET',
      quantity: 0.001, stopPrice: 9300, newOrderRespType: 'ACK',
    });
    expect(ack.orderId).toBe(987654321);
    expect(ack.status).toBe('NEW');
  });

  it('parses a real cancel payload (cumQty present, no avgPrice/origQty/reduceOnly)', async () => {
    // The documented DELETE /fapi/v1/order response. v3.5.0 parsed this with
    // the full query-order schema and rejected it.
    const CANCEL_RESULT = {
      clientOrderId: 'myOrder1',
      cumQty: '0',
      cumQuote: '0',
      executedQty: '0',
      orderId: 22542179,
      origClientOrderId: 'myOrder1',
      price: '9300',
      side: 'SELL',
      status: 'CANCELED',
      stopPrice: '9300',
      symbol: 'BTCUSDT',
      timeInForce: 'GTC',
      type: 'TRAILING_STOP_MARKET',
      updateTime: 1566816545898,
      workingType: 'CONTRACT_PRICE',
    };
    server.use(http.delete('https://fapi.binance.com/fapi/v1/order', () => HttpResponse.json(CANCEL_RESULT)));

    const canceled = await trading().cancelOrder('BTCUSDT', { orderId: 22542179 });
    expect(canceled.status).toBe('CANCELED');
    expect(canceled.cumQty).toBe('0');
    expect(canceled.orderId).toBe(22542179);
  });
});
