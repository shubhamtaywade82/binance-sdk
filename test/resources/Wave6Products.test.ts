import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { SubAccountWave6 } from '../../src/resources/SubAccountWave6.js';
import { MarginWave6 } from '../../src/resources/MarginWave6.js';
import { OptionsWave6 } from '../../src/resources/OptionsWave6.js';
import { PortfolioMarginWave6 } from '../../src/resources/PortfolioMarginWave6.js';
import { PortfolioMarginProWave6 } from '../../src/resources/PortfolioMarginProWave6.js';
import { SpotWave6 } from '../../src/resources/SpotWave6.js';
import { WalletWave6 } from '../../src/resources/WalletWave6.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SAPI = 'https://api.binance.com';
const EAPI = 'https://eapi.binance.com';
const PAPI = 'https://papi.binance.com';

describe('BinanceClient — Wave 6 gap closure (188 endpoints across 7 products)', () => {
  it('exposes a wave6 resource on every laggard product surface', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(client.spot.wave6).toBeInstanceOf(SpotWave6);
    expect(client.options.wave6).toBeInstanceOf(OptionsWave6);
    expect(client.portfolioMargin.wave6).toBeInstanceOf(PortfolioMarginWave6);
    expect(client.portfolioMarginPro.wave6).toBeInstanceOf(PortfolioMarginProWave6);
    expect(client.margin.wave6).toBeInstanceOf(MarginWave6);
    expect(client.walletWave6).toBeInstanceOf(WalletWave6);
    expect(client.subaccountWave6).toBeInstanceOf(SubAccountWave6);
  });

  it('Wave 6 closed the Wallet system-status gap (GET /sapi/v1/system/status)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/system/status`, () =>
        HttpResponse.json({ status: 'normal', msg: '' })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const r = await client.walletWave6.systemStatusSystem();
    expect(r).toEqual({ status: 'normal', msg: '' });
  });

  it('Wave 6 closed the Portfolio Margin ping gap (GET /papi/v1/ping)', async () => {
    server.use(
      http.get(`${PAPI}/papi/v1/ping`, () => HttpResponse.json({})),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const r = await client.portfolioMargin.wave6.testConnectivity();
    expect(r).toBeDefined();
  });

  it('Wave 6 closed the Portfolio Margin Pro fund-collection gap (POST /sapi/v1/portfolio/asset-collection)', async () => {
    server.use(
      http.post(`${SAPI}/sapi/v1/portfolio/asset-collection`, () =>
        HttpResponse.json({ asset: 'BTC', amount: '1.0' })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // Generated method name `fundCollectionByAssetUserData` (from Postman
    // request "Fund Collection by Asset").
    const r = await client.portfolioMarginPro.wave6.fundCollectionByAssetUserData({ asset: 'BTC' });
    expect(r).toBeDefined();
  });

  it('Wave 6 closed the Options allOpenOrdersByUnderlying gap (DELETE /eapi/v1/allOpenOrdersByUnderlying)', async () => {
    server.use(
      http.delete(`${EAPI}/eapi/v1/allOpenOrdersByUnderlying`, () =>
        HttpResponse.json({ code: 200, msg: 'OK' })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // Generated method `cancelAllOptionOrdersByUnderlyingTrade`.
    const r = await client.options.wave6.cancelAllOptionOrdersByUnderlyingTrade({ underlying: 'BTC' });
    expect(r).toBeDefined();
  });

  it('Wave 6 closed the Margin interestRateHistory gap (GET /sapi/v1/margin/interestRateHistory)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/margin/interestRateHistory`, () =>
        HttpResponse.json([{ asset: 'BTC', interestRate: '0.0001', time: 1 }])),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // Generated method `queryMarginInterestRateHistoryUserData`.
    const r = await client.margin.wave6.queryMarginInterestRateHistoryUserData({ asset: 'BTC' });
    expect(r).toBeDefined();
  });

  it('Wave 6 closed the Sub-Account managed-subaccount/info gap (GET /sapi/v1/managed-subaccount/info)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/managed-subaccount/info`, () =>
        HttpResponse.json({ email: 'sub@example.com' })),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // Generated method `queryManagedSubAccountListForInvestorUserData`.
    const r = await client.subaccountWave6.queryManagedSubAccountListForInvestorUserData({ email: 'sub@example.com' });
    expect(r).toBeDefined();
  });

  it('Wave 6 closed the Spot allOrderList gap (GET /api/v3/allOrderList)', async () => {
    server.use(
      http.get(`${SAPI}/api/v3/allOrderList`, () =>
        HttpResponse.json([{ orderListId: 1, status: 'NEW' }])),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // Generated method `queryAllOrderLists`.
    const r = await client.spot.wave6.queryAllOrderLists(undefined);
    expect(r).toBeDefined();
  });
});
