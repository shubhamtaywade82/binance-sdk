import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { PortfolioMarginAccount } from '../../src/resources/PortfolioMarginAccount.js';
import { PortfolioMarginCm } from '../../src/resources/PortfolioMarginCm.js';
import { PortfolioMarginPortfolio } from '../../src/resources/PortfolioMarginPortfolio.js';
import { PortfolioMarginUm } from '../../src/resources/PortfolioMarginUm.js';
import { PortfolioMarginUserDataStream } from '../../src/resources/PortfolioMarginUserDataStream.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://papi.binance.com';
function http_(): HttpClient {
  return new HttpClient({ baseURL: BASE, apiKey: 'k', apiSecret: 's' });
}

describe('PortfolioMarginAccount', () => {
  it('fetches the PM account summary', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/account`, () =>
        HttpResponse.json({
          unifiedMarginAccount: true,
          marginLevel: '1.5',
          totalNetAssetOfBtc: '2.5',
          updateTime: 1,
        })),
    );
    const acc = await new PortfolioMarginAccount(http_()).account();
    expect(acc.unifiedMarginAccount).toBe(true);
    expect(acc.marginLevel).toBe(1.5);
  });

  it('fetches balances (per-asset)', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/balance`, () =>
        HttpResponse.json([
          { asset: 'BTC', walletBalance: '1.5', crossMarginFree: '0.5', umWalletBalance: '1.0' },
        ]),
      ),
    );
    const balances = await new PortfolioMarginAccount(http_()).balance();
    expect(balances[0]?.asset).toBe('BTC');
    expect(balances[0]?.walletBalance).toBe(1.5);
  });

  it('fetches order rate-limit usage', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/rateLimit/order`, () =>
        HttpResponse.json([
          { rateLimitType: 'ORDERS', interval: 'MINUTE', intervalNum: 1, limit: 1200 },
        ]),
      ),
    );
    const r = await new PortfolioMarginAccount(http_()).rateLimitOrder();
    expect(r[0]?.limit).toBe(1200);
  });
});

describe('PortfolioMarginUm', () => {
  it('fetches UM account', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/um/account`, () =>
        HttpResponse.json({
          feeTier: 1,
          canTrade: true,
          canDeposit: true,
          canWithdraw: true,
          updateTime: 1,
          assets: [{ asset: 'USDT', walletBalance: '1000', marginBalance: '1000', maintMargin: '0' }],
        })),
    );
    const acc = await new PortfolioMarginUm(http_()).account();
    expect(acc.canTrade).toBe(true);
    expect(acc.assets?.[0]?.asset).toBe('USDT');
  });

  it('parses positionRisk', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/um/positionRisk`, () =>
        HttpResponse.json([
          {
            symbol: 'BTCUSDT', positionAmt: '0.1', entryPrice: '50000', markPrice: '51000',
            unRealizedProfit: '100', positionSide: 'BOTH', updateTime: 1,
          },
        ]),
      ),
    );
    const risks = await new PortfolioMarginUm(http_()).positionRisk('BTCUSDT');
    expect(risks[0]?.positionAmt).toBe(0.1);
    expect(risks[0]?.unRealizedProfit).toBe(100);
  });

  it('parses position mode (dualSidePosition)', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/um/positionSide/dual`, () =>
        HttpResponse.json({ dualSidePosition: true })),
    );
    const mode = await new PortfolioMarginUm(http_()).positionMode();
    expect(mode.dualSidePosition).toBe(true);
  });

  it('parses funding rate history', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/um/fundingRate`, () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', fundingRate: '0.0001', fundingTime: 1_700_000_000 },
        ]),
      ),
    );
    const rates = await new PortfolioMarginUm(http_()).fundingRate({ symbol: 'BTCUSDT' });
    expect(rates[0]?.fundingRate).toBe(0.0001);
  });

  it('parses openInterest', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/um/openInterest`, () =>
        HttpResponse.json({ symbol: 'BTCUSDT', openInterest: '100.5', time: 1 })),
    );
    const oi = await new PortfolioMarginUm(http_()).openInterest('BTCUSDT');
    expect(oi.openInterest).toBe(100.5);
  });
});

describe('PortfolioMarginCm', () => {
  it('parses CM account', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/cm/account`, () =>
        HttpResponse.json({ feeTier: 1, canTrade: true, assets: [] })),
    );
    const acc = await new PortfolioMarginCm(http_()).account();
    expect(acc.canTrade).toBe(true);
  });

  it('parses CM position risk', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/cm/positionRisk`, () =>
        HttpResponse.json([
          {
            symbol: 'BTCUSD_PERP', pair: 'BTCUSD', positionAmt: '10', entryPrice: '50000',
            markPrice: '51000', unRealizedProfit: '1000', positionSide: 'BOTH',
          },
        ]),
      ),
    );
    const risks = await new PortfolioMarginCm(http_()).positionRisk();
    expect(risks[0]?.positionAmt).toBe(10);
  });
});

describe('PortfolioMarginPortfolio', () => {
  it('fetches PM portfolio account', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/portfolio/account`, () =>
        HttpResponse.json({
          unifiedMarginAccount: true,
          marginLevel: '2.5',
          totalNetAssetOfBtc: '1.0',
          totalNetAssetOfUsd: '50000',
          marginRatio: '0.4',
          updateTime: 1,
        })),
    );
    const acc = await new PortfolioMarginPortfolio(http_()).account();
    expect(acc.marginLevel).toBe(2.5);
  });

  it('parses collateral rate table', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/portfolio/collateralRate`, () =>
        HttpResponse.json([
          { asset: 'BTC', collateralRate: '0.95' },
          { asset: 'ETH', collateralRate: '0.85' },
        ]),
      ),
    );
    const r = await new PortfolioMarginPortfolio(http_()).collateralRate();
    expect(r[0]?.collateralRate).toBe(0.95);
  });

  it('parses interest history', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/portfolio/interest-history`, () =>
        HttpResponse.json([
          { asset: 'USDT', interest: '5.0', interestRate: '0.0001', time: 1_700_000_000 },
        ]),
      ),
    );
    const h = await new PortfolioMarginPortfolio(http_()).interestHistory();
    expect(h[0]?.interest).toBe(5.0);
  });

  it('parses margin call level', async () => {
    server.use(
      http.get(`${BASE}/papi/v1/portfolio/margin-call-level`, () =>
        HttpResponse.json({ marginCallLevel: '0.05', marginCallTriggered: false })),
    );
    const m = await new PortfolioMarginPortfolio(http_()).marginCallLevel();
    expect(m.marginCallLevel).toBe(0.05);
  });
});

describe('PortfolioMarginUserDataStream', () => {
  it('creates a listenKey', async () => {
    server.use(
      http.post(`${BASE}/papi/v1/listenKey`, () => HttpResponse.json({ listenKey: 'pm-key' })),
    );
    const { listenKey } = await new PortfolioMarginUserDataStream(http_()).createListenKey();
    expect(listenKey).toBe('pm-key');
  });
});
