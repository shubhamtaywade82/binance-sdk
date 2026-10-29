/**
 * Wave 8 — strict-schema acceptance for the Crypto Loan product (ladder
 * rung 3).
 *
 * Two layers, mirroring the convert pilot (test/resources/Wave8Convert.test.ts):
 *
 * 1. Golden fixtures (test/fixtures/cryptoLoan/*.json) parsed directly with
 *    the generated Wave 8 schemas — every documented wire shape must parse.
 *    The fixtures carry the REAL v2 wire shapes: every list endpoint is
 *    wrapped `{ rows, total }`. The pre-Wave-8 schemas parsed plain arrays
 *    (and three methods returned raw JSON) — shapes that only existed in
 *    this repo's own test mocks, never on the wire.
 *
 * 2. MSW harness tests through the resource: the wrapped shapes flow
 *    through typed returns, the SDK's numeric-amount convention is
 *    preserved, and the former raw returns (flexibleBorrow / flexibleRepay /
 *    flexibleAdjustLtv) now validate against the oracle shapes.
 *
 * The deprecated v1 fixed-term surface (borrowHistory, income,
 * ltvAdjustmentHistory, repayCollateralRate, repayHistory) stays on its
 * existing schemas — upstream removed it from the Postman collections and
 * the connector-js oracle does not model it (see the resource JSDoc).
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { CryptoLoan } from '../../src/resources/CryptoLoan.js';
import {
  checkCollateralRepayRateResponseSchema,
  flexibleLoanAdjustLtvResponseSchema,
  flexibleLoanBorrowResponseSchema,
  flexibleLoanRepayResponseSchema,
  getFlexibleLoanAssetsDataResponseSchema,
  getFlexibleLoanBorrowHistoryResponseSchema,
  getFlexibleLoanCollateralAssetsDataResponseSchema,
  getFlexibleLoanInterestRateHistoryResponseSchema,
  getFlexibleLoanLiquidationHistoryResponseSchema,
  getFlexibleLoanLtvAdjustmentHistoryResponseSchema,
  getFlexibleLoanOngoingOrdersResponseSchema,
  getFlexibleLoanRepaymentHistoryResponseSchema,
} from '../../src/types/cryptoLoan.wave8.types.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/cryptoLoan/', import.meta.url));
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://api.binance.com';
function http_(): HttpClient {
  return new HttpClient({ baseURL: BASE, apiKey: 'k', apiSecret: 's' });
}
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${name}`, 'utf8'));
}

describe('Wave 8 Crypto Loan fixtures — golden payloads parse with the oracle schemas', () => {
  it('flexibleBorrow parses (loan/collateral amounts transform to numbers)', () => {
    const r = flexibleLoanBorrowResponseSchema.parse(fixture('flexibleBorrow.json'));
    expect(r.loanCoin).toBe('USDT');
    expect(r.loanAmount).toBe(100.5); // numeric-string convention preserved
    expect(r.collateralAmount).toBe(100.1);
    expect(r.status).toBe('Succeed');
  });

  it('flexibleRepay parses', () => {
    const r = flexibleLoanRepayResponseSchema.parse(fixture('flexibleRepay.json'));
    expect(r.remainingDebt).toBe(10.1);
    expect(r.remainingCollateral).toBe(5.1);
    expect(r.fullRepayment).toBe(true);
    expect(r.currentLTV).toBe(0.55);
    expect(r.repayStatus).toBe('Repaid');
  });

  it('flexibleAdjustLtv parses', () => {
    const r = flexibleLoanAdjustLtvResponseSchema.parse(fixture('flexibleAdjustLtv.json'));
    expect(r.direction).toBe('ADDITIONAL');
    expect(r.adjustmentAmount).toBe(10.5);
    expect(r.currentLTV).toBe(0.55);
  });

  it('flexibleRepayRate parses the documented v2 shape', () => {
    const r = checkCollateralRepayRateResponseSchema.parse(fixture('flexibleRepayRate.json'));
    expect(r.loanCoin).toBe('USDT');
    expect(r.rate).toBe(0.9); // numeric-string convention preserved
  });

  it('flexibleLoanableData parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanAssetsDataResponseSchema.parse(fixture('flexibleLoanableData.json'));
    expect(r.total).toBe(1);
    expect(r.rows?.[0]?.loanCoin).toBe('BUSD');
    expect(r.rows?.[0]?.flexibleInterestRate).toBe(0.0075);
    expect(r.rows?.[0]?.flexibleMinLimit).toBe(100);
    expect(r.rows?.[0]?.flexibleMaxLimit).toBe(1000);
  });

  it('flexibleCollateralData parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanCollateralAssetsDataResponseSchema.parse(fixture('flexibleCollateralData.json'));
    expect(r.rows?.[0]?.collateralCoin).toBe('BNB');
    expect(r.rows?.[0]?.initialLTV).toBe(0.75);
    expect(r.rows?.[0]?.marginCallLTV).toBe(0.8);
    expect(r.rows?.[0]?.liquidationLTV).toBe(0.85);
    expect(r.rows?.[0]?.maxLimit).toBe(1000);
  });

  it('flexibleBorrowHistory parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanBorrowHistoryResponseSchema.parse(fixture('flexibleBorrowHistory.json'));
    expect(r.rows?.[0]?.initialLoanAmount).toBe(100.5);
    expect(r.rows?.[0]?.initialCollateralAmount).toBe(100.1);
    expect(r.rows?.[0]?.borrowTime).toBe(1645000000000);
  });

  it('flexibleRepayHistory parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanRepaymentHistoryResponseSchema.parse(fixture('flexibleRepayHistory.json'));
    expect(r.rows?.[0]?.repayAmount).toBe(100.5);
    expect(r.rows?.[0]?.collateralReturn).toBe(100.1);
    expect(r.rows?.[0]?.repayStatus).toBe('Repaid');
  });

  it('flexibleOngoingOrders parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanOngoingOrdersResponseSchema.parse(fixture('flexibleOngoingOrders.json'));
    expect(r.rows?.[0]?.totalDebt).toBe(100.5);
    expect(r.rows?.[0]?.currentLTV).toBe(0.55);
  });

  it('flexibleLtvAdjustmentHistory parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanLtvAdjustmentHistoryResponseSchema.parse(fixture('flexibleLtvAdjustmentHistory.json'));
    expect(r.rows?.[0]?.preLTV).toBe(0.5);
    expect(r.rows?.[0]?.afterLTV).toBe(0.55);
    expect(r.rows?.[0]?.adjustTime).toBe(1645000000000);
  });

  it('flexibleLiquidationHistory parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanLiquidationHistoryResponseSchema.parse(fixture('flexibleLiquidationHistory.json'));
    expect(r.rows?.[0]?.liquidationDebt).toBe(100.5);
    expect(r.rows?.[0]?.liquidationStartingPrice).toBe(19000.5);
    expect(r.rows?.[0]?.status).toBe('Liquidated');
  });

  it('interestRateHistory parses the wrapped { rows, total } wire shape', () => {
    const r = getFlexibleLoanInterestRateHistoryResponseSchema.parse(fixture('interestRateHistory.json'));
    expect(r.rows?.[0]?.coin).toBe('USDT');
    expect(r.rows?.[0]?.annualizedInterestRate).toBe(0.0075);
  });
});

describe('Wave 8 Crypto Loan resource — oracle shapes flow through the methods', () => {
  it('flexibleBorrow now validates the response (was raw Record<string, unknown>)', async () => {
    server.use(
      http.post(`${BASE}/sapi/v2/loan/flexible/borrow`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}flexibleBorrow.json`, 'utf8')))),
    );
    const r = await new CryptoLoan(http_()).flexibleBorrow({ loanCoin: 'USDT', collateralCoin: 'BUSD', loanAmount: '100.5' });
    expect(r.loanAmount).toBe(100.5);
    expect(r.status).toBe('Succeed');
  });

  it('flexibleRepay now validates the response (was raw Record<string, unknown>)', async () => {
    server.use(
      http.post(`${BASE}/sapi/v2/loan/flexible/repay`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}flexibleRepay.json`, 'utf8')))),
    );
    const r = await new CryptoLoan(http_()).flexibleRepay({ loanCoin: 'USDT', collateralCoin: 'BUSD', repayAmount: '100' });
    expect(r.fullRepayment).toBe(true);
    expect(r.remainingDebt).toBe(10.1);
  });

  it('flexibleAdjustLtv now validates the response (was raw Record<string, unknown>)', async () => {
    server.use(
      http.post(`${BASE}/sapi/v2/loan/flexible/adjust/ltv`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}flexibleAdjustLtv.json`, 'utf8')))),
    );
    const r = await new CryptoLoan(http_()).flexibleAdjustLtv({
      loanCoin: 'USDT',
      collateralCoin: 'BUSD',
      adjustmentAmount: '10.5',
      direction: 'ADDITIONAL',
    });
    expect(r.direction).toBe('ADDITIONAL');
    expect(r.currentLTV).toBe(0.55);
  });

  it('flexibleLoanableData returns the wrapped documented shape (the old array parse threw on the real wire)', async () => {
    server.use(
      http.get(`${BASE}/sapi/v2/loan/flexible/loanable/data`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}flexibleLoanableData.json`, 'utf8')))),
    );
    const r = await new CryptoLoan(http_()).flexibleLoanableData();
    expect(r.total).toBe(1);
    expect(r.rows?.[0]?.flexibleInterestRate).toBe(0.0075);
  });

  it('flexibleBorrowHistory returns the wrapped documented shape (was raw unknown[])', async () => {
    server.use(
      http.get(`${BASE}/sapi/v2/loan/flexible/borrow/history`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}flexibleBorrowHistory.json`, 'utf8')))),
    );
    const r = await new CryptoLoan(http_()).flexibleBorrowHistory();
    expect(r.total).toBe(1);
    expect(r.rows?.[0]?.initialLoanAmount).toBe(100.5);
  });

  it('interestRateHistory returns the wrapped documented shape (the old array parse threw on the real wire)', async () => {
    server.use(
      http.get(`${BASE}/sapi/v2/loan/interestRateHistory`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}interestRateHistory.json`, 'utf8')))),
    );
    const r = await new CryptoLoan(http_()).interestRateHistory();
    expect(r.rows?.[0]?.annualizedInterestRate).toBe(0.0075);
  });

  it('flexibleRepayRate returns the documented v2 shape (was validated against the deprecated v1 schema)', async () => {
    server.use(
      http.get(`${BASE}/sapi/v2/loan/flexible/repay/rate`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}flexibleRepayRate.json`, 'utf8')))),
    );
    const r = await new CryptoLoan(http_()).flexibleRepayRate({ loanCoin: 'USDT', collateralCoin: 'BUSD', repayAmount: '100' });
    expect(r.rate).toBe(0.9);
  });

  it('rejects payloads with oracle-invalid field types (strictness over passthrough)', async () => {
    // status is documented as string; a typed mismatch must fail the parse.
    server.use(
      http.post(`${BASE}/sapi/v2/loan/flexible/borrow`, () =>
        HttpResponse.json({ loanCoin: 'USDT', status: 123 })),
    );
    await expect(new CryptoLoan(http_()).flexibleBorrow({ loanCoin: 'USDT', collateralCoin: 'BUSD' })).rejects.toThrow();
  });
});
