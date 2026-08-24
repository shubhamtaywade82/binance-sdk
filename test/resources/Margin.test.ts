import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MarginAccount, MarginTrading } from '../../src/resources/Margin.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function marginAccount(): MarginAccount {
  return new MarginAccount(new HttpClient({ baseURL: 'https://api.binance.com', apiKey: 'k', apiSecret: 's' }));
}

function marginTrading(): MarginTrading {
  return new MarginTrading(new HttpClient({ baseURL: 'https://api.binance.com', apiKey: 'k', apiSecret: 's' }));
}

describe('MarginAccount', () => {
  it('fetches the cross margin account', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/margin/account', () =>
        HttpResponse.json({
          borrowEnabled: true, marginLevel: '5', totalAssetOfBtc: '1', totalLiabilityOfBtc: '0.1',
          totalNetAssetOfBtc: '0.9', tradeEnabled: true, transferEnabled: true, userAssets: [],
        }),
      ),
    );

    const acc = await marginAccount().crossAccount();
    expect(acc.marginLevel).toBe(5);
  });

  it('borrows an asset via the unified endpoint', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/margin/borrow-repay', () => HttpResponse.json({ tranId: 42 })),
    );

    const res = await marginAccount().borrow('USDT', 100);
    expect(res.tranId).toBe(42);
  });

  it('fetches max borrowable amount', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/margin/maxBorrowable', () =>
        HttpResponse.json({ amount: '1000', borrowLimit: '5000' }),
      ),
    );

    const res = await marginAccount().maxBorrowable('USDT');
    expect(res.amount).toBe(1000);
  });

  it('transfers between spot and cross margin', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/margin/transfer', () => HttpResponse.json({ tranId: 7 })),
    );

    const res = await marginAccount().transfer('USDT', 50, 1);
    expect(res.tranId).toBe(7);
  });
});

describe('MarginTrading', () => {
  it('creates a margin order', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/margin/order', () =>
        HttpResponse.json({
          symbol: 'BTCUSDT', orderId: 1, clientOrderId: 'c1', price: '60000', origQty: '0.01',
          executedQty: '0', cummulativeQuoteQty: '0', status: 'NEW', type: 'LIMIT', side: 'BUY',
        }),
      ),
    );

    const order = await marginTrading().createOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: 60000, quantity: 0.01 });
    expect(order.orderId).toBe(1);
  });

  it('fetches open margin orders', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/margin/openOrders', () =>
        HttpResponse.json([
          {
            symbol: 'BTCUSDT', orderId: 1, clientOrderId: 'c1', price: '60000', origQty: '0.01',
            executedQty: '0', cummulativeQuoteQty: '0', status: 'NEW', type: 'LIMIT', side: 'BUY',
          },
        ]),
      ),
    );

    const orders = await marginTrading().getOpenOrders({ symbol: 'BTCUSDT' });
    expect(orders).toHaveLength(1);
  });
});
