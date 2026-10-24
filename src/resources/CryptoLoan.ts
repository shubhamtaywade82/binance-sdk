import { HttpClient } from '../client/HttpClient.js';
import {
  CryptoLoanBorrowHistory,
  CryptoLoanBorrowHistoryResponseSchema,
  CryptoLoanFlexibleCollateral,
  CryptoLoanFlexibleCollateralResponseSchema,
  CryptoLoanFlexibleLoanable,
  CryptoLoanFlexibleLoanableResponseSchema,
  CryptoLoanIncome,
  CryptoLoanIncomeResponseSchema,
  CryptoLoanInterestRateHistory,
  CryptoLoanInterestRateHistoryResponseSchema,
  CryptoLoanLtvAdjustmentHistory,
  CryptoLoanLtvAdjustmentHistoryResponseSchema,
  CryptoLoanRepayCollateralRate,
  CryptoLoanRepayCollateralRateSchema,
  CryptoLoanRepayHistory,
  CryptoLoanRepayHistoryResponseSchema,
} from '../types/extras.types.js';

/**
 * Binance Crypto Loan — fixed-term (v1) and flexible (v2) loan products.
 * Borrow against collateral, repay, adjust LTV, and query history.
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

  /** Repay collateral rate. `GET /sapi/v1/loan/repay/collateral/rate` (SIGNED). */
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

  /** Adjust flexible loan LTV. `POST /sapi/v2/loan/flexible/adjust/ltv` (SIGNED). */
  async flexibleAdjustLtv(params: {
    loanCoin: string;
    collateralCoin: string;
    adjustmentAmount: string;
    direction: 'ADDITIONAL' | 'REDUCED';
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v2/loan/flexible/adjust/ltv', params, 'signed');
  }

  /** Borrow a flexible loan. `POST /sapi/v2/loan/flexible/borrow` (SIGNED). */
  async flexibleBorrow(params: {
    loanCoin: string;
    collateralCoin: string;
    loanAmount?: string;
    collateralAmount?: string;
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v2/loan/flexible/borrow', params, 'signed');
  }

  /** Flexible borrow history. `GET /sapi/v2/loan/flexible/borrow/history` (SIGNED). */
  async flexibleBorrowHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/sapi/v2/loan/flexible/borrow/history', options ?? {}, 'signed');
  }

  /** Flexible collateral data. `GET /sapi/v2/loan/flexible/collateral/data` (SIGNED). */
  async flexibleCollateralData(options?: {
    collateralCoin?: string;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanFlexibleCollateral[]> {
    return CryptoLoanFlexibleCollateralResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/collateral/data', options ?? {}, 'signed'));
  }

  /** Flexible liquidation history. `GET /sapi/v2/loan/flexible/liquidation/history` (SIGNED). */
  async flexibleLiquidationHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/sapi/v2/loan/flexible/liquidation/history', options ?? {}, 'signed');
  }

  /** Flexible loanable data. `GET /sapi/v2/loan/flexible/loanable/data` (SIGNED). */
  async flexibleLoanableData(options?: {
    loanCoin?: string;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanFlexibleLoanable[]> {
    return CryptoLoanFlexibleLoanableResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/loanable/data', options ?? {}, 'signed'));
  }

  /** Flexible LTV adjustment history. `GET /sapi/v2/loan/flexible/ltv/adjustment/history` (SIGNED). */
  async flexibleLtvAdjustmentHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanLtvAdjustmentHistory[]> {
    return CryptoLoanLtvAdjustmentHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/ltv/adjustment/history', options ?? {}, 'signed'));
  }

  /** Ongoing flexible orders. `GET /sapi/v2/loan/flexible/ongoing/orders` (SIGNED). */
  async flexibleOngoingOrders(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    current?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/sapi/v2/loan/flexible/ongoing/orders', options ?? {}, 'signed');
  }

  /** Repay a flexible loan. `POST /sapi/v2/loan/flexible/repay` (SIGNED). */
  async flexibleRepay(params: {
    loanCoin: string;
    collateralCoin: string;
    repayAmount: string;
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v2/loan/flexible/repay', params, 'signed');
  }

  /** Flexible repay history. `GET /sapi/v2/loan/flexible/repay/history` (SIGNED). */
  async flexibleRepayHistory(options?: {
    loanCoin?: string;
    collateralCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanRepayHistory[]> {
    return CryptoLoanRepayHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/flexible/repay/history', options ?? {}, 'signed'));
  }

  /** Flexible repay rate. `GET /sapi/v2/loan/flexible/repay/rate` (SIGNED). */
  async flexibleRepayRate(params: { loanCoin: string; collateralCoin: string; repayAmount: string }): Promise<CryptoLoanRepayCollateralRate> {
    return CryptoLoanRepayCollateralRateSchema.parse(await this.http.get('/sapi/v2/loan/flexible/repay/rate', params, 'signed'));
  }

  /** Interest rate history (v2). `GET /sapi/v2/loan/interestRateHistory` (SIGNED). */
  async interestRateHistory(options?: {
    loanCoin?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    limit?: number;
  }): Promise<CryptoLoanInterestRateHistory[]> {
    return CryptoLoanInterestRateHistoryResponseSchema.parse(await this.http.get('/sapi/v2/loan/interestRateHistory', options ?? {}, 'signed'));
  }
}
