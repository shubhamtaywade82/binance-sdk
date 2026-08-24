import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CoinMAccount } from '../../src/resources/CoinMAccount.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function account(): CoinMAccount {
  return new CoinMAccount(new HttpClient({ baseURL: 'https://dapi.binance.com', apiKey: 'k', apiSecret: 's' }));
}

describe('CoinMAccount', () => {
  it('fetches balance', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/balance', () =>
        HttpResponse.json([
          {
            accountAlias: 'a', asset: 'BTC', balance: '1', withdrawAvailable: '1',
            crossWalletBalance: '1', crossUnPnl: '0', availableBalance: '1', updateTime: 1,
          },
        ]),
      ),
    );

    const balances = await account().balance();
    expect(balances[0]?.asset).toBe('BTC');
    expect(balances[0]?.balance).toBe(1);
  });

  it('fetches position risk', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/positionRisk', () =>
        HttpResponse.json([
          {
            symbol: 'BTCUSD_PERP', pair: 'BTCUSD', positionAmt: '10', entryPrice: '60000', markPrice: '61000',
            unRealizedProfit: '0.1', liquidationPrice: '0', leverage: '10', marginType: 'cross', positionSide: 'BOTH',
          },
        ]),
      ),
    );

    const risks = await account().positionRisk({ symbol: 'BTCUSD_PERP' });
    expect(risks[0]?.unRealizedProfit).toBe(0.1);
  });

  it('fetches account info', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/account', () =>
        HttpResponse.json({
          canDeposit: true, canTrade: true, canWithdraw: true, feeTier: 0, updateTime: 1,
          assets: [], positions: [],
        }),
      ),
    );

    const acc = await account().account();
    expect(acc.canTrade).toBe(true);
  });

  it('sets position mode', async () => {
    server.use(
      http.post('https://dapi.binance.com/dapi/v1/positionSide/dual', () => HttpResponse.json({ code: 200, msg: 'success' })),
    );

    const res = await account().setPositionMode(true);
    expect(res.code).toBe(200);
  });
});
