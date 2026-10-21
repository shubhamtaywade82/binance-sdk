import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { SpotTrading, SpotAccount } from '../../src/resources/SpotTrading.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SPOT = 'https://api.binance.com/api/v3';

function client(): HttpClient {
  return new HttpClient({ baseURL: SPOT, apiKey: 'k', apiSecret: 's' });
}

describe('SpotTrading', () => {
  it('places a spot order', async () => {
    server.use(
      http.post(`${SPOT}/order`, () =>
        HttpResponse.json({
          symbol: 'BTCUSDT', orderId: 1, clientOrderId: 'c1', status: 'NEW', side: 'BUY',
          type: 'LIMIT', timeInForce: 'GTC', price: '60000', origQty: '0.01',
          executedQty: '0', cummulativeQuoteQty: '0', transactTime: 1,
        }),
      ),
    );

    const trading = new SpotTrading(client());
    const order = await trading.createOrder({
      symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.01', price: '60000', timeInForce: 'GTC',
    });
    expect(order.orderId).toBe(1);
    expect(order.status).toBe('NEW');
    expect(order.price).toBe(60000);
  });

  it('cancels all open orders for a symbol', async () => {
    server.use(
      http.delete(`${SPOT}/openOrders`, () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', orderId: 9, clientOrderId: 'c9', status: 'CANCELED', side: 'SELL', type: 'LIMIT' },
        ]),
      ),
    );

    const trading = new SpotTrading(client());
    const orders = await trading.cancelOpenOrders('BTCUSDT');
    expect(orders[0]?.status).toBe('CANCELED');
  });

  it('creates an OCO order list', async () => {
    server.use(
      http.post(`${SPOT}/orderList`, () =>
        HttpResponse.json({
          orderListId: 5, contingencyType: 'OCO', listStatusType: 'EXEC_STARTED',
          listOrderStatus: 'EXECUTING', listClientOrderId: 'l1', transactionTime: 1,
          symbol: 'BTCUSDT',
          orders: [
            { symbol: 'BTCUSDT', orderId: 6, clientOrderId: 'c6', status: 'NEW', side: 'SELL', type: 'STOP_LOSS_LIMIT' },
            { symbol: 'BTCUSDT', orderId: 7, clientOrderId: 'c7', status: 'NEW', side: 'SELL', type: 'LIMIT_MAKER' },
          ],
        }),
      ),
    );

    const trading = new SpotTrading(client());
    const oco = await trading.createOCOOrder({
      symbol: 'BTCUSDT', side: 'SELL', quantity: '0.01', price: '61000', stopPrice: '59000', stopLimitPrice: '58900', stopLimitTimeInForce: 'GTC',
    });
    expect(oco.orderListId).toBe(5);
    expect(oco.orders).toHaveLength(2);
  });
});

describe('SpotAccount', () => {
  it('fetches account balances', async () => {
    server.use(
      http.get(`${SPOT}/account`, () =>
        HttpResponse.json({
          makerCommission: 10, takerCommission: 10, buyerCommission: 0, sellerCommission: 0,
          canTrade: true, canWithdraw: true, canDeposit: true, updateTime: 1, accountType: 'SPOT',
          balances: [
            { asset: 'BTC', free: '1.5', locked: '0' },
            { asset: 'USDT', free: '10000', locked: '0' },
          ],
          permissions: ['SPOT'],
        }),
      ),
    );

    const account = new SpotAccount(client());
    const info = await account.account();
    expect(info.balances.find((b) => b.asset === 'BTC')?.free).toBe(1.5);
  });

  it('fetches my trades', async () => {
    server.use(
      http.get(`${SPOT}/myTrades`, () =>
        HttpResponse.json([
          {
            symbol: 'BTCUSDT', id: 1, orderId: 2, price: '60000', qty: '0.01', quoteQty: '600',
            commission: '0.06', commissionAsset: 'USDT', time: 1, isBuyer: true, isMaker: false, isBestMatch: true,
          },
        ]),
      ),
    );

    const account = new SpotAccount(client());
    const trades = await account.myTrades('BTCUSDT');
    expect(trades[0]?.quoteQty).toBe(600);
  });
});
