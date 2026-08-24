import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Wallet } from '../../src/resources/Wallet.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wallet(): Wallet {
  return new Wallet(new HttpClient({ baseURL: 'https://api.binance.com', apiKey: 'k', apiSecret: 's' }));
}

describe('Wallet', () => {
  it('performs a universal transfer', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/asset/transfer', () => HttpResponse.json({ tranId: 123 })),
    );

    const res = await wallet().universalTransfer({ type: 'MAIN_UMFUTURE', asset: 'USDT', amount: 10 });
    expect(res.tranId).toBe(123);
  });

  it('fetches universal transfer history', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/asset/transfer', () =>
        HttpResponse.json({ total: 1, rows: [{ asset: 'USDT', amount: '10', type: 'MAIN_UMFUTURE', status: 'CONFIRMED', tranId: 1, timestamp: 1 }] }),
      ),
    );

    const res = await wallet().universalTransferHistory({ type: 'MAIN_UMFUTURE' });
    expect(res.total).toBe(1);
    expect(res.rows[0]?.amount).toBe(10);
  });

  it('fetches funding wallet assets', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/asset/get-funding-asset', () =>
        HttpResponse.json([{ asset: 'BNB', free: '1', locked: '0', freeze: '0', withdrawing: '0', btcValuation: '0.01' }]),
      ),
    );

    const res = await wallet().fundingWallet();
    expect(res[0]?.asset).toBe('BNB');
    expect(res[0]?.free).toBe(1);
  });

  it('fetches deposit history', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/capital/deposit/hisrec', () =>
        HttpResponse.json([
          { id: '1', amount: '1.5', coin: 'BTC', network: 'BTC', status: 1, address: 'addr', txId: 'tx1', insertTime: 1, transferType: 0 },
        ]),
      ),
    );

    const res = await wallet().depositHistory({ coin: 'BTC' });
    expect(res[0]?.amount).toBe(1.5);
  });

  it('fetches withdraw history', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/capital/withdraw/history', () =>
        HttpResponse.json([
          { id: '1', amount: '2', transactionFee: '0.001', coin: 'ETH', status: 6, address: 'addr', applyTime: '2024-01-01 00:00:00', network: 'ETH', transferType: 0 },
        ]),
      ),
    );

    const res = await wallet().withdrawHistory();
    expect(res[0]?.amount).toBe(2);
  });

  it('submits a withdraw request', async () => {
    server.use(
      http.post('https://api.binance.com/sapi/v1/capital/withdraw/apply', () => HttpResponse.json({ id: 'w1' })),
    );

    const res = await wallet().withdraw({ coin: 'BTC', address: 'addr', amount: 0.1 });
    expect(res.id).toBe('w1');
  });

  it('fetches deposit address', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/capital/deposit/address', () =>
        HttpResponse.json({ address: 'addr', coin: 'BTC', tag: '' }),
      ),
    );

    const res = await wallet().depositAddress('BTC');
    expect(res.address).toBe('addr');
  });

  it('fetches api key permissions', async () => {
    server.use(
      http.get('https://api.binance.com/sapi/v1/account/apiRestrictions', () =>
        HttpResponse.json({
          ipRestrict: false, createTime: 1, enableWithdrawals: false, enableInternalTransfer: true,
          enableFutures: true, enableMargin: false, enableSpotAndMarginTrading: true,
        }),
      ),
    );

    const res = await wallet().apiKeyPermissions();
    expect(res.enableFutures).toBe(true);
  });
});
