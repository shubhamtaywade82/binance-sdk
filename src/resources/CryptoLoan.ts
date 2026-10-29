import { HttpClient } from '../client/HttpClient.js';
import {
  CryptoLoanBorrowHistory,
  CryptoLoanBorrowHistoryResponseSchema,
  CryptoLoanIncome,
  CryptoLoanIncomeResponseSchema,
  CryptoLoanLtvAdjustmentHistory,
  CryptoLoanLtvAdjustmentHistoryResponseSchema,
  CryptoLoanRepayCollateralRate,
  CryptoLoanRepayCollateralRateSchema,
  CryptoLoanRepayHistory,
  CryptoLoanRepayHistoryResponseSchema,
} from '../types/extras.types.js';
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
} from '../types/cryptoLoan.wave8.types.js';
import type {
  CheckCollateralRepayRateResponse,
  FlexibleLoanAdjustLtvResponse,
  FlexibleLoanBorrowResponse,
  FlexibleLoanRepayResponse,
  GetFlexibleLoanAssetsDataResponse,
  GetFlexibleLoanBorrowHistoryResponse,
  GetFlexibleLoanCollateralAssetsDataResponse,
  GetFlexibleLoanInterestRateHistoryResponse,
  GetFlexibleLoanLiquidationHistoryResponse,
  GetFlexibleLoanLtvAdjustmentHistoryResponse,
  GetFlexibleLoanOngoingOrdersResponse,
  GetFlexibleLoanRepaymentHistoryResponse,
} from '../types/cryptoLoan.wave8.types.js';

/**
 * Binance Crypto Loan — fixed-term (v1) and flexible (v2) loan products.
 * Borrow against collateral, repay, adjust LTV, and query history.
 *
 * Wave 8: the flexible (v2) surface parses with oracle-derived strict
 * schemas (src/types/cryptoLoan.wave8.types.ts). The migration fixed real
 * wire-shape bugs — the previous Wave 1 schemas parsed the v2 list endpoints
 * as plain arrays (and three methods returned raw JSON), but the documented
 * (and live) wire is wrapped (`{ rows, total }`); the old parses threw on
 * every real response. The deprecated v1 fixed-term methods keep their
 * existing schemas (upstream removed them from the Postman collections;
 * the connector-js oracle does not model them).
 */
export class CryptoLoan {
  constructor(private readonly http: HttpClient) {}

  // ---- v1 fixed-term ----

  /**
   * Fixed-term borrow history. `GET /sapi/v1/loan/borrow/history` (SIGNED).
   * @deprecated Removed from the official Binance Postman collections in binance-api-postman a6dbbbb (2026-10-22); use {@link CryptoLoan.flexibleBorrowHistory}.
   */
  async borrowHistory(options?: {
    orderId?: number;
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanBorrowHistory[]> {
    return CryptoLoanBorrowHistoryResponseSchema.parse(await this.http.get('/sapi/v1/loan/borrow/history', options ?? {}, 'signed'));
  }

  /**
   * Income (interest) records. `GET /sapi/v1/loan/income` (SIGNED).
   * @deprecated Removed from the official Binance Postman collections in binance-api-postman a6dbbbb (2026-10-22); no flexible-loan equivalent is documented.
   */
  async income(options?: {
    asset?: string;
    type?: 'borrowIn' | 'collateralSpent' | 'repayAmount' | 'collateralReturn' | 'addCollateral' | 'reduceCollateral';
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<CryptoLoanIncome[]> {
    return CryptoLoanIncomeResponseSchema.parse(await this.http.get('/sapi/v1/loan/income', options ?? {}, 'signed'));
  }

  /**
   * LTV adjustment history. `GET /sapi/v1/loan/ltv/adjustment/history` (SIGNED).
   * @deprecated Removed from the official Binance Postman collections in binance-api-postman a6dbbbb (2026-10-22); use {@link CryptoLoan.flexibleLtvAdjustmentHistory}.
   */
  async ltvAdjustmentHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanLtvAdjustmentHistory[]> {
    return CryptoLoanLtvAdjustmentHistoryResponseSchema.parse(await this.http.get('/sapi/v1/loan/ltv/adjustment/history', options ?? {}, 'signed'));
  }

  /**
   * Repay collateral rate. `GET /sapi/v1/loan/repay/collateral/rate` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `GET /sapi/v2/loan/flexible/repay/rate`. Removal planned for the next major version.
   */
  async repayCollateralRate(params: { loanCoin: string; collateralCoin: string; repayAmount: string }): Promise<CryptoLoanRepayCollateralRate> {
    return CryptoLoanRepayCollateralRateSchema.parse(await this.http.get('/sapi/v1/loan/repay/collateral/rate', params, 'signed'));
  }

  /**
   * Repay history. `GET /sapi/v1/loan/repay/history` (SIGNED).
   * @deprecated Removed from the official Binance Postman collections in binance-api-postman a6dbbbb (2026-10-22); use {@link CryptoLoan.flexibleRepayHistory}.
   */
  async repayHistory(options?: {
    orderId?: number;
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanRepayHistory[]> {
    return CryptoLoanRepayHistoryResponseSchema.parse(await this.http.get('/sapi/v1/loan/repay/history', options ?? {}, 'signed'));
  }

  // ---- v2 flexible ----

  /**
   * Adjust flexible loan LTV. `POST /sapi/v2/loan/flexible/adjust/ltv` (SIGNED).
   * Wave 8: was a raw `Record<string, unknown>`; now validated against the
   * oracle shape.
   */
  async flexibleAdjustLtv(params: {
    loanCoin: string;
    collateralCoin: string;
    adjustmentAmount: string;
    direction: 'ADDITIONAL' | 'REDUCED';
  }): Promise<FlexibleLoanAdjustLtvResponse> {
    return flexibleLoanAdjustLtvResponseSchema.parse(await this.http.post('/sapi/v2/loan/flexible/adjust/ltv', params, 'signed'));
  }

  /**
   * Borrow a flexible loan. `POST /sapi/v2/loan/flexible/borrow` (SIGNED).
   * Wave 8: was a raw `Record<string, unknown>`; now validated against the
   * oracle shape.
   */
  async flexibleBorrow(params: {
    loanCoin: string;
    collateralCoin: string;
    loanAmount?: string;
    collateralAmount?: string;
  }): Promise<FlexibleLoanBorrowResponse> {
    return flexibleLoanBorrowResponseSchema.parse(await this.http.post('/sapi/v2/loan/flexible/borrow', params, 'signed'));
  }

  /**
   * Flexible borrow history. `GET /sapi/v2/loan/flexible/borrow/history` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (was a raw
   * `unknown[]` parsed against the wrong shape).
   */
  async flexibleBorrowHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanBorrowHistoryResponse> {
    return getFlexibleLoanBorrowHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/borrow/history', options ?? {}, 'signed'));
  }

  /**
   * Flexible collateral data. `GET /sapi/v2/loan/flexible/collateral/data` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (the old array
   * parse threw on the real wire).
   */
  async flexibleCollateralData(options?: {
    collateralCoin?: string;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanCollateralAssetsDataResponse> {
    return getFlexibleLoanCollateralAssetsDataResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/collateral/data', options ?? {}, 'signed'));
  }

  /**
   * Flexible liquidation history. `GET /sapi/v2/loan/flexible/liquidation/history` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (was a raw
   * `unknown[]` parsed against the wrong shape).
   */
  async flexibleLiquidationHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanLiquidationHistoryResponse> {
    return getFlexibleLoanLiquidationHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/liquidation/history', options ?? {}, 'signed'));
  }

  /**
   * Flexible loanable data. `GET /sapi/v2/loan/flexible/loanable/data` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (the old array
   * parse threw on the real wire).
   */
  async flexibleLoanableData(options?: {
    loanCoin?: string;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanAssetsDataResponse> {
    return getFlexibleLoanAssetsDataResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/loanable/data', options ?? {}, 'signed'));
  }

  /**
   * Flexible LTV adjustment history. `GET /sapi/v2/loan/flexible/ltv/adjustment/history` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (the old array
   * parse threw on the real wire).
   */
  async flexibleLtvAdjustmentHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanLtvAdjustmentHistoryResponse> {
    return getFlexibleLoanLtvAdjustmentHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/ltv/adjustment/history', options ?? {}, 'signed'));
  }

  /**
   * Ongoing flexible orders. `GET /sapi/v2/loan/flexible/ongoing/orders` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (was a raw
   * `unknown[]` parsed against the wrong shape).
   */
  async flexibleOngoingOrders(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanOngoingOrdersResponse> {
    return getFlexibleLoanOngoingOrdersResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/ongoing/orders', options ?? {}, 'signed'));
  }

  /**
   * Repay a flexible loan. `POST /sapi/v2/loan/flexible/repay` (SIGNED).
   * Wave 8: was a raw `Record<string, unknown>`; now validated against the
   * oracle shape.
   */
  async flexibleRepay(params: {
    loanCoin: string;
    collateralCoin: string;
    repayAmount: string;
  }): Promise<FlexibleLoanRepayResponse> {
    return flexibleLoanRepayResponseSchema.parse(await this.http.post('/sapi/v2/loan/flexible/repay', params, 'signed'));
  }

  /**
   * Flexible repay history. `GET /sapi/v2/loan/flexible/repay/history` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (the old array
   * parse threw on the real wire).
   */
  async flexibleRepayHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanRepaymentHistoryResponse> {
    return getFlexibleLoanRepaymentHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/repay/history', options ?? {}, 'signed'));
  }

  /**
   * Flexible repay rate. `GET /sapi/v2/loan/flexible/repay/rate` (SIGNED).
   * Wave 8: was validated against the deprecated v1 repay-collateral-rate
   * shape; now typed as the documented v2 `{ loanCoin, collateralCoin, rate }`.
   */
  async flexibleRepayRate(params: { loanCoin: string; collateralCoin: string; repayAmount: string }): Promise<CheckCollateralRepayRateResponse> {
    return checkCollateralRepayRateResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/repay/rate', params, 'signed'));
  }

  /**
   * Interest rate history (v2). `GET /sapi/v2/loan/interestRateHistory` (SIGNED).
   * Returns the documented wrapped shape `{ rows, total }` (the old array
   * parse threw on the real wire).
   */
  async interestRateHistory(options?: {
    loanCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<GetFlexibleLoanInterestRateHistoryResponse> {
    return getFlexibleLoanInterestRateHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/interestRateHistory', options ?? {}, 'signed'));
  }
}
