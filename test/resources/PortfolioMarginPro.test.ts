import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { PortfolioMarginPro } from '../../src/resources/PortfolioMarginPro.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://api.binance.com';
function http_(): HttpClient {
  return new HttpClient({ baseURL: BASE, apiKey: 'k', apiSecret: 's' });
}

describe('PortfolioMarginPro', () => {
  it('fetches PM Pro account', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/portfolio/account`, () =>
        HttpResponse.json({
          unifiedMarginAccount: true,
          marginLevel: '2.0',
          totalNetAssetOfBtc: '5.0',
          totalNetAssetOfUsd: '300000',
          updateTime: 1,
        })),
    );
    const acc = await new PortfolioMarginPro(http_()).account();
    expect(acc.unifiedMarginAccount).toBe(true);
    expect(acc.marginLevel).toBe(2.0);
  });

  it('fetches v2 account', async () => {
    server.use(
      http.get(`${BASE}/sapi/v2/portfolio/account`, () =>
        HttpResponse.json({ unifiedMarginAccount: true, marginLevel: '1.5' })),
    );
    const acc = await new PortfolioMarginPro(http_()).accountV2();
    expect(acc.marginLevel).toBe(1.5);
  });

  it('fetches balance (v1)', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/portfolio/balance`, () =>
        HttpResponse.json([
          { asset: 'BTC', crossMarginAsset: '1.0', umWalletBalance: '0.5', cmWalletBalance: '0.2' },
        ]),
      ),
    );
    const b = await new PortfolioMarginPro(http_()).balance();
    expect(b[0]?.asset).toBe('BTC');
    expect(b[0]?.crossMarginAsset).toBe(1.0);
  });

  it('fetches collateral rate v1', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/portfolio/collateralRate`, () =>
        HttpResponse.json([
          { asset: 'BTC', collateralRate: '0.95' },
          { asset: 'ETH', collateralRate: '0.85' },
        ]),
      ),
    );
    const r = await new PortfolioMarginPro(http_()).collateralRate();
    expect(r[0]?.asset).toBe('BTC');
    expect(r[0]?.collateralRate).toBe(0.95);
  });

  it('fetches collateral rate v3', async () => {
    server.use(
      http.get(`${BASE}/sapi/v3/portfolio/collateralRate`, () =>
        HttpResponse.json([{ asset: 'BNB', collateralRate: '0.9' }])),
    );
    const r = await new PortfolioMarginPro(http_()).collateralRateV3();
    expect(r[0]?.asset).toBe('BNB');
  });

  it('fetches asset index price', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/portfolio/asset-index-price`, () =>
        HttpResponse.json([{ asset: 'BTC', indexPrice: '50000', time: 1 }])),
    );
    const r = await new PortfolioMarginPro(http_()).assetIndexPrice();
    expect(r[0]?.indexPrice).toBe(50000);
  });

  it('fetches interest history', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/portfolio/interest-history`, () =>
        HttpResponse.json([{ asset: 'USDT', interest: '1.0', interestRate: '0.0001', time: 1 }])),
    );
    const h = await new PortfolioMarginPro(http_()).interestHistory();
    expect(h[0]?.interest).toBe(1.0);
  });

  it('triggers repay-futures-switch', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/portfolio/repay-futures-switch`, () =>
        HttpResponse.json({ code: 200, msg: 'success' })),
    );
    const r = await new PortfolioMarginPro(http_()).repayFuturesSwitch({ open: true });
    expect((r as { code: number }).code).toBe(200);
  });
});
