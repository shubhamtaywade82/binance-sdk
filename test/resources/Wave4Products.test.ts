import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { Alpha } from '../../src/resources/Alpha.js';
import { CopyTrading } from '../../src/resources/CopyTrading.js';
import { C2C } from '../../src/resources/C2C.js';
import { CryptoLoan } from '../../src/resources/CryptoLoan.js';
import { DualInvestment } from '../../src/resources/DualInvestment.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SAPI = 'https://api.binance.com';
// Alpha host is the bare www.binance.com; paths under /bapi/* (matches restBapi).
const BAPI = 'https://www.binance.com';
function http_(base: string): HttpClient {
  return new HttpClient({ baseURL: base, apiKey: 'k', apiSecret: 's' });
}

describe('CryptoLoan', () => {
  // v1 fixed-term methods (deprecated upstream) keep their Wave 1 schemas;
  // the v2 flexible methods migrated to Wave 8 oracle schemas — their real
  // wire shape is wrapped { rows, total } (test/resources/Wave8CryptoLoan.test.ts
  // carries the full acceptance suite).
  it('parses borrow history (deprecated v1 surface, plain array wire)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/loan/borrow/history`, () =>
        HttpResponse.json([
          { loanCoin: 'USDT', collateralCoin: 'BTC', loanAmount: '1000', collateralAmount: '0.02', borrowTime: 1, status: 'REPAID', orderId: 1 },
        ]),
      ),
    );
    const r = await new CryptoLoan(http_(SAPI)).borrowHistory();
    expect(r[0]?.loanCoin).toBe('USDT');
    expect(r[0]?.loanAmount).toBe(1000);
  });

  it('parses repay collateral rate (deprecated v1 surface)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/loan/repay/collateral/rate`, () =>
        HttpResponse.json({
          loanCoin: 'USDT',
          collateralCoin: 'BTC',
          repayAmount: '100',
          collateralReturnAmount: '0.002',
        })),
    );
    const r = await new CryptoLoan(http_(SAPI)).repayCollateralRate({ loanCoin: 'USDT', collateralCoin: 'BTC', repayAmount: '100' });
    expect(r.repayAmount).toBe(100);
    expect(r.collateralReturnAmount).toBe(0.002);
  });

  it('parses flexible loanable data (Wave 8: wrapped { rows, total } wire)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v2/loan/flexible/loanable/data`, () =>
        HttpResponse.json({
          rows: [
            { loanCoin: 'USDT', flexibleInterestRate: '0.0001', flexibleMinLimit: '10', flexibleMaxLimit: '1000000' },
          ],
          total: 1,
        }),
      ),
    );
    const r = await new CryptoLoan(http_(SAPI)).flexibleLoanableData();
    expect(r.total).toBe(1);
    expect(r.rows?.[0]?.loanCoin).toBe('USDT');
    expect(r.rows?.[0]?.flexibleInterestRate).toBe(0.0001);
  });

  it('parses interest rate history (Wave 8: wrapped { rows, total } wire)', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v2/loan/interestRateHistory`, () =>
        HttpResponse.json({
          rows: [
            { coin: 'USDT', annualizedInterestRate: '0.0001', time: 1 },
          ],
          total: 1,
        }),
      ),
    );
    const r = await new CryptoLoan(http_(SAPI)).interestRateHistory();
    expect(r.rows?.[0]?.annualizedInterestRate).toBe(0.0001);
  });
});

describe('DualInvestment', () => {
  it('parses positions', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/dci/product/positions`, () =>
        HttpResponse.json([
          { id: '1', asset: 'BTC', investAmount: '1', status: 'SETTLED', purchaseTime: 1, settleTime: 2, settleAsset: 'USDT', settleAmount: '50000' },
        ]),
      ),
    );
    const r = await new DualInvestment(http_(SAPI)).positions();
    expect(r[0]?.id).toBe('1');
    expect(r[0]?.investAmount).toBe(1);
  });

  it('parses accounts', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/dci/product/accounts`, () =>
        HttpResponse.json([{ positionId: 1, asset: 'BTC', autoCompoundPlan: 'STANDARD', status: 'ONGOING', settledAmount: '0' }])),
    );
    const r = await new DualInvestment(http_(SAPI)).accounts();
    expect(r[0]?.positionId).toBe(1);
    expect(r[0]?.asset).toBe('BTC');
  });

  it('parses product list', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/dci/product/list`, () =>
        HttpResponse.json([
          { id: '1', investCoin: 'BTC', settledCoin: 'USDT', strike: '50000', settlePrice: '0', subscribeStartTime: 1, subscribeEndTime: 2, settleDate: 3, expiredType: '1_D' },
        ]),
      ),
    );
    const r = await new DualInvestment(http_(SAPI)).list();
    expect(r[0]?.id).toBe('1');
    expect(r[0]?.strike).toBe(50000);
  });

  it('parses subscribe response', async () => {
    server.use(
      http.post(`${SAPI}/sapi/v1/dci/product/subscribe`, () =>
        HttpResponse.json({ positionId: 1, investCoin: 'BTC', settledCoin: 'USDT', investAmount: '1', status: 'SUCCESS' })),
    );
    const r = await new DualInvestment(http_(SAPI)).subscribe({ id: '1', investAmount: '1' });
    expect(r.positionId).toBe(1);
    expect(r.status).toBe('SUCCESS');
  });
});

describe('Alpha', () => {
  it('parses agg-trades', async () => {
    server.use(
      http.get(`${BAPI}/bapi/defi/v1/public/alpha-trade/agg-trades`, () =>
        HttpResponse.json([{ a: 1, p: '50000', q: '0.5', T: 1, m: true }])),
    );
    const r = await new Alpha(http_(BAPI)).aggTrades({ symbol: 'BTC' });
    expect(r[0]?.a).toBe(1);
    expect(r[0]?.p).toBe(50000);
  });

  it('parses exchange-info', async () => {
    server.use(
      http.get(`${BAPI}/bapi/defi/v1/public/alpha-trade/get-exchange-info`, () =>
        HttpResponse.json({
          timezone: 'UTC',
          serverTime: 1,
          symbols: [{ symbol: 'BTC', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING' }],
        })),
    );
    const info = await new Alpha(http_(BAPI)).exchangeInfo();
    expect(info.symbols?.[0]?.symbol).toBe('BTC');
  });

  it('parses klines as tuples', async () => {
    server.use(
      http.get(`${BAPI}/bapi/defi/v1/public/alpha-trade/klines`, () =>
        HttpResponse.json([[1, '50000', '50100', '49900', '50050', '0.5', 2]])),
    );
    const klines = await new Alpha(http_(BAPI)).klines({ symbol: 'BTC', interval: '1m' });
    expect(klines[0][0]).toBe(1);
    expect(klines[0][1]).toBe('50000');
  });

  it('parses token list', async () => {
    server.use(
      http.get(`${BAPI}/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list`, () =>
        HttpResponse.json([{ symbol: 'BTC', asset: 'BTC', name: 'Bitcoin', chain: 'BTC', decimals: 8 }])),
    );
    const tokens = await new Alpha(http_(BAPI)).tokenList();
    expect(tokens[0]?.symbol).toBe('BTC');
  });
});

describe('CopyTrading', () => {
  it('parses lead symbols', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/copyTrading/futures/leadSymbol`, () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', maxLeadTradeQty: '100', minLeadTradeQty: '0.001', status: 'ENABLED' },
        ]),
      ),
    );
    const r = await new CopyTrading(http_(SAPI)).futuresLeadSymbol();
    expect(r[0]?.symbol).toBe('BTCUSDT');
    expect(r[0]?.maxLeadTradeQty).toBe(100);
  });

  it('parses user status', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/copyTrading/futures/userStatus`, () =>
        HttpResponse.json({ isLeadTrader: false, copyTradingStatus: 'NONE' })),
    );
    const s = await new CopyTrading(http_(SAPI)).futuresUserStatus();
    expect(s.isLeadTrader).toBe(false);
  });
});

describe('C2C', () => {
  it('parses order-match history', async () => {
    server.use(
      http.get(`${SAPI}/sapi/v1/c2c/orderMatch/listUserOrderHistory`, () =>
        HttpResponse.json([
          { orderNumber: '123', tradeType: 'BUY', asset: 'BTC', amount: '0.5', orderStatus: 'COMPLETED', createTime: 1 },
        ]),
      ),
    );
    const r = await new C2C(http_(SAPI)).orderMatchListUserOrderHistory({ tradeType: 'BUY' });
    expect(r[0]?.orderNumber).toBe('123');
    expect(r[0]?.amount).toBe(0.5);
  });
});
