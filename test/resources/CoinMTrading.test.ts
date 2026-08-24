import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CoinMTrading } from '../../src/resources/CoinMTrading.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function trading(): CoinMTrading {
  return new CoinMTrading(new HttpClient({ baseURL: 'https://dapi.binance.com', apiKey: 'k', apiSecret: 's' }));
}

const orderPayload = {
  orderId: 1, symbol: 'BTCUSD_PERP', status: 'NEW', clientOrderId: 'c1', price: '60000', avgPrice: '0',
  origQty: '1', executedQty: '0', type: 'LIMIT', reduceOnly: false, side: 'BUY', positionSide: 'BOTH',
  time: 1, updateTime: 1,
};

describe('CoinMTrading', () => {
  it('creates an order', async () => {
    server.use(http.post('https://dapi.binance.com/dapi/v1/order', () => HttpResponse.json(orderPayload)));

    const order = await trading().createOrder({ symbol: 'BTCUSD_PERP', side: 'BUY', type: 'LIMIT', price: 60000, quantity: 1 });
    expect(order.orderId).toBe(1);
    expect(order.price).toBe(60000);
  });

  it('cancels an order', async () => {
    server.use(http.delete('https://dapi.binance.com/dapi/v1/order', () => HttpResponse.json({ ...orderPayload, status: 'CANCELED' })));

    const order = await trading().cancelOrder('BTCUSD_PERP', { orderId: 1 });
    expect(order.status).toBe('CANCELED');
  });

  it('sets leverage', async () => {
    server.use(
      http.post('https://dapi.binance.com/dapi/v1/leverage', () =>
        HttpResponse.json({ leverage: 20, maxQty: '1000', symbol: 'BTCUSD_PERP' }),
      ),
    );

    const res = await trading().setLeverage('BTCUSD_PERP', 20);
    expect(res.leverage).toBe(20);
    expect(res.maxQty).toBe(1000);
  });

  it('fetches open orders', async () => {
    server.use(http.get('https://dapi.binance.com/dapi/v1/openOrders', () => HttpResponse.json([orderPayload])));

    const orders = await trading().getOpenOrders('BTCUSD_PERP');
    expect(orders).toHaveLength(1);
  });
});
