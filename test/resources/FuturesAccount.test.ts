import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FuturesAccount } from '../../src/resources/FuturesAccount.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function account(apiKey = 'k', apiSecret = 's'): FuturesAccount {
  return new FuturesAccount(new HttpClient({ baseURL: 'https://fapi.binance.com', apiKey, apiSecret }));
}

describe('FuturesAccount', () => {
  it('fetches balance', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v2/balance', () =>
        HttpResponse.json([
          {
            accountAlias: 'a', asset: 'USDT', balance: '100', crossWalletBalance: '90',
            crossUnPnl: '1', availableBalance: '91', maxWithdrawAmount: '90', marginAvailable: true, updateTime: 1,
          },
        ]),
      ),
    );

    const balances = await account().balance();
    expect(balances[0]?.balance).toBe(100);
    expect(balances[0]?.asset).toBe('USDT');
  });

  it('fetches position risk', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v2/positionRisk', () =>
        HttpResponse.json([
          {
            symbol: 'BTCUSDT', positionAmt: '0.5', entryPrice: '60000', markPrice: '61000',
            unRealizedProfit: '500', liquidationPrice: '0', leverage: '10', marginType: 'isolated',
            positionSide: 'BOTH', notional: '30500', updateTime: 1,
          },
        ]),
      ),
    );

    const risks = await account().positionRisk('BTCUSDT');
    expect(risks[0]?.unRealizedProfit).toBe(500);
  });

  it('fetches income history', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/income', () =>
        HttpResponse.json([{ incomeType: 'FUNDING_FEE', income: '0.5', asset: 'USDT', time: 1, tranId: 1 }]),
      ),
    );

    const history = await account().incomeHistory({ symbol: 'BTCUSDT' });
    expect(history[0]?.income).toBe(0.5);
  });

  it('fetches commission rate', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/commissionRate', () =>
        HttpResponse.json({ symbol: 'BTCUSDT', makerCommissionRate: '0.0002', takerCommissionRate: '0.0004' }),
      ),
    );

    const rate = await account().commissionRate('BTCUSDT');
    expect(rate.takerCommissionRate).toBe(0.0004);
  });

  it('fetches position mode', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/positionSide/dual', () =>
        HttpResponse.json({ dualSidePosition: true }),
      ),
    );

    const mode = await account().positionMode();
    expect(mode.dualSidePosition).toBe(true);
  });

  it('requests order download', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/order/asyn', () =>
        HttpResponse.json({ downloadId: 'd1' }),
      ),
    );

    const res = await account().requestOrderDownload({ symbol: 'BTCUSDT' });
    expect(res.downloadId).toBe('d1');
  });

  it('fetches account config', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/accountConfig', () =>
        HttpResponse.json({ feeTier: 0, canTrade: true, dualSidePosition: false }),
      ),
    );

    const res = await account().accountConfig();
    expect(res.canTrade).toBe(true);
  });

  it('fetches portfolio margin account info', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/pmAccountInfo', () =>
        HttpResponse.json({ asset: 'USDT', crossMarginAsset: '100' }),
      ),
    );

    const res = await account().pmAccountInfo('USDT');
    expect(res.asset).toBe('USDT');
  });

  it('requests income download and checks status', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/income/asyn', () => HttpResponse.json({ downloadId: 'd2' })),
      http.get('https://fapi.binance.com/fapi/v1/income/asyn/id', () =>
        HttpResponse.json({ downloadId: 'd2', status: 'completed', url: 'https://example.com/d2' }),
      ),
    );

    const req = await account().requestIncomeDownload({ startTime: 1, endTime: 2 });
    expect(req.downloadId).toBe('d2');

    const status = await account().getIncomeDownloadStatus('d2');
    expect(status.status).toBe('completed');
  });
});
