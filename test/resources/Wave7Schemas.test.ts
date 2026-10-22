import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SAPI = 'https://api.binance.com';

describe('Wave 7 — Zod response schemas applied to Wave 5 + Wave 6 resources', () => {
  it('Wallet wave6 systemStatusSystem returns a typed object (not unknown)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/system/status`, () =>
        HttpResponse.json({ status: 'normal', msg: '' })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const r = await client.walletWave6.systemStatusSystem();
    // Wave 7 wraps the response in a Zod schema; r is now a typed object
    // rather than `unknown`. The schema includes optional `status` and
    // `msg` fields, so they should be accessible without `as any`.
    expect(r).toEqual({ status: 'normal', msg: '' });
    expect(typeof r).toBe('object');
  });

  it('SubAccount wave6 returns a typed object for managed-subaccount info', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/managed-subaccount/info`, () =>
        HttpResponse.json({ email: 'sub@example.com', subAccountId: 1 })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const r = await client.subaccountWave6.queryManagedSubAccountListForInvestorUserData({ email: 'sub@example.com' });
    expect(typeof r).toBe('object');
    expect((r as { email?: string }).email).toBe('sub@example.com');
  });

  it('Staking wave6 returns a typed array for onchain yields rewards history', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/onchain-yields/locked/history/rewardsRecord`, () =>
        HttpResponse.json([{ positionId: 1, asset: 'ETH', amount: '0.5', time: 1 }])),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const r = await client.staking.staking.getOnChainYieldsLockedRewardsHistoryUserData({ positionId: 1 });
    expect(Array.isArray(r)).toBe(true);
    expect((r as Array<{ asset?: string }>)[0]?.asset).toBe('ETH');
  });
});
