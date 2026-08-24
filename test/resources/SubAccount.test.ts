import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SubAccount } from '../../src/resources/SubAccount.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function subAccount(): SubAccount {
  return new SubAccount(new HttpClient({ baseURL: 'https://api.binance.com', apiKey: 'k', apiSecret: 's' }));
}

describe('SubAccount', () => {
  it('lists sub-accounts', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/sub-account/list', () =>
        HttpResponse.json({ subAccounts: [{ email: 'sub1@test.com', isFreeze: false, createTime: 1 }] }),
      ),
    );

    const list = await subAccount().list();
    expect(list[0]?.email).toBe('sub1@test.com');
  });

  it('performs a universal transfer', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/sub-account/universalTransfer', () =>
        HttpResponse.json({ tranId: 99 }),
      ),
    );

    const res = await subAccount().universalTransfer({
      fromEmail: 'a@test.com',
      toEmail: 'b@test.com',
      fromAccountType: 'SPOT',
      toAccountType: 'USDT_FUTURE',
      asset: 'USDT',
      amount: 10,
    });
    expect(res.tranId).toBe(99);
  });

  it('fetches futures account summary', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v2/sub-account/futures/accountSummary', () =>
        HttpResponse.json({ totalCount: 2, totalMarginBalanceOfBTC: '1', totalUnrealizedProfitOfBTC: '0', totalWalletBalanceOfBTC: '1' }),
      ),
    );

    const res = await subAccount().futuresAccountSummary(1);
    expect(res.totalCount).toBe(2);
  });

  it('creates a virtual sub-account', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/sub-account/virtualSubAccount', () =>
        HttpResponse.json({ email: 'virtual@test.com' }),
      ),
    );

    const res = await subAccount().createVirtualSubAccount('virtual');
    expect(res.email).toBe('virtual@test.com');
  });
});
