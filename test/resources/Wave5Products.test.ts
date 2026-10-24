import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SAPI = 'https://api.binance.com';

describe('BinanceClient — contract-first generated product surfaces (Wave 5)', () => {
  it('exposes all 9 Wave-5 product surfaces via lazy getters', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(client.fiat).toBeDefined();
    expect(client.giftCard).toBeDefined();
    expect(client.mining).toBeDefined();
    expect(client.nft).toBeDefined();
    expect(client.pay).toBeDefined();
    expect(client.rebate).toBeDefined();
    expect(client.simpleEarn).toBeDefined();
    expect(client.staking).toBeDefined();
    expect(client.vipLoan).toBeDefined();
  });

  it('exposes them through the products{} getter too (identity stable)', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(client.products.fiat).toBe(client.fiat);
    expect(client.products.simpleEarn).toBe(client.simpleEarn);
    expect(client.products.staking).toBe(client.staking);
    expect(client.products.vipLoan).toBe(client.vipLoan);
  });

  it('fiat resource sends GET /sapi/v1/fiat/orders (signed)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/fiat/orders`, () =>
        HttpResponse.json({ code: '000000', message: 'success', data: [{ orderNo: '1', fiatCurrency: 'USD', amount: '100' }], total: 1, success: true })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // The generated method is `getFiatDepositWithdrawHistoryUserData` (lowerCamelCase
    // of the Postman request name "Get Fiat Deposit/Withdraw History (USER_DATA)").
    const r = await client.fiat.fiat.getFiatDepositWithdrawHistoryUserData({ transactionType: 0 });
    expect(r.data).toHaveLength(1);
  });

  it('staking resource sends GET /sapi/v1/onchain-yields/account (signed)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/onchain-yields/account`, () =>
        HttpResponse.json({ totalBtcStaked: '0.5' })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const r = await client.staking.staking.onChainYieldsAccountUserData();
    expect(r).toBeDefined();
  });

  it('vipLoan resource sends POST /sapi/v1/loan/vip/repay (signed)', async () => {
    server.use(
      http.post(`${SAPI}/sapi/v1/loan/vip/repay`, () =>
        HttpResponse.json({ orderId: 1 })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // Generated method `vipLoanRepayTrade` (lowerCamelCase of "VIP Loan Repay (TRADE)").
    const r = await client.vipLoan.vipLoan.vipLoanRepayTrade({ orderId: 1, amount: 100 });
    expect(r).toBeDefined();
  });
});
