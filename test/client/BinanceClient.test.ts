import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('BinanceClient', () => {
  it('fetches spot klines through client.spot.market', async () => {
    server.use(
      http.get('https://api.binance.com/api/v3/klines', () =>
        HttpResponse.json([[1, '1', '2', '0.5', '1.5', '10', 2, '15', 3, '5', '7.5', '0']]),
      ),
    );

    const client = new BinanceClient();
    const klines = await client.spot.market.klines('SOLUSDT', '15m');
    expect(klines[0]?.close).toBe(1.5);
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('fetches futures funding rate through client.futures.data', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/fundingRate', () =>
        HttpResponse.json([{ symbol: 'XRPUSDT', fundingTime: 1, fundingRate: '0.0002' }]),
      ),
    );

    const client = new BinanceClient();
    const history = await client.futures.data.fundingRateHistory('XRPUSDT');
    expect(history[0]?.fundingRate).toBe(0.0002);
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('fetches COIN-M balance through client.coinm.account', async () => {
    server.use(
      http.get('https://dapi.binance.com/dapi/v1/balance', () =>
        HttpResponse.json([
          { accountAlias: 'a', asset: 'BTC', balance: '1', withdrawAvailable: '1', crossWalletBalance: '1', crossUnPnl: '0', availableBalance: '1', updateTime: 1 },
        ]),
      ),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const balances = await client.coinm.account.balance();
    expect(balances[0]?.asset).toBe('BTC');
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('performs a wallet universal transfer through client.wallet', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/asset/transfer', () => HttpResponse.json({ tranId: 1 })),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const res = await client.wallet.universalTransfer({ type: 'MAIN_UMFUTURE', asset: 'USDT', amount: 5 });
    expect(res.tranId).toBe(1);
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('fetches the cross margin account through client.margin.account', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/margin/account', () =>
        HttpResponse.json({
          borrowEnabled: true, marginLevel: '5', totalAssetOfBtc: '1', totalLiabilityOfBtc: '0.1',
          totalNetAssetOfBtc: '0.9', tradeEnabled: true, transferEnabled: true, userAssets: [],
        }),
      ),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const acc = await client.margin.account.crossAccount();
    expect(acc.marginLevel).toBe(5);
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('lists sub-accounts through client.subaccount', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/sub-account/list', () =>
        HttpResponse.json({ subAccounts: [{ email: 'sub@test.com', isFreeze: false, createTime: 1 }] }),
      ),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const list = await client.subaccount.list();
    expect(list[0]?.email).toBe('sub@test.com');
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('syncs server time across all REST hosts via syncTime()', async () => {
    const serverTime = Date.now() + 3000;
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/time', () => HttpResponse.json({ serverTime })),
      http.get('https://dapi.binance.com/dapi/v1/time', () => HttpResponse.json({ serverTime })),
      http.get('https://api.binance.com/api/v3/time', () => HttpResponse.json({ serverTime })),
    );

    const client = new BinanceClient();
    await expect(client.syncTime()).resolves.toBeUndefined();
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('reports per-host rate-limit usage via getRateLimitUsage()', async () => {
    server.use(
      http.get('https://api.binance.com/api/v3/klines', () =>
        HttpResponse.json([], { headers: { 'X-MBX-USED-WEIGHT-1M': '7' } }),
      ),
    );

    const client = new BinanceClient();
    await client.spot.market.klines('BTCUSDT', '1m');

    const usage = client.getRateLimitUsage();
    expect(usage.spot.usedWeightByInterval['1m']).toBe(7);
    expect(usage.futures.usedWeightByInterval).toEqual({});

    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('resolves COIN-M host to testnet.binancefuture.com when testnet is enabled', async () => {
    server.use(
      http.get('https://testnet.binancefuture.com/dapi/v1/balance', () => HttpResponse.json([])),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', testnet: true });
    await expect(client.coinm.account.balance()).resolves.toEqual([]);
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('creates a COIN-M listenKey through client.coinm.userStream', async () => {
    server.use(
      http.post('https://dapi.binance.com/dapi/v1/listenKey', () => HttpResponse.json({ listenKey: 'coinm-lk' })),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const { listenKey } = await client.coinm.userStream.createListenKey();
    expect(listenKey).toBe('coinm-lk');
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('builds COIN-M market stream names via client.coinm.ws', () => {
    const client = new BinanceClient();
    expect(client.coinm.ws.kline('BTCUSD_PERP', '1m')).toBe('btcusd_perp@kline_1m');
    client.futures.ws.close();
    client.spot.ws.close();
    client.coinm.ws.close();
  });
});
