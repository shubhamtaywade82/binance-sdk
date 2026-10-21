import { HttpClient } from '../client/HttpClient.js';
import {
  PmProAccount,
  PmProAccountSchema,
  PmProAssetIndexPrice,
  PmProAssetIndexPriceResponseSchema,
  PmProBalance,
  PmProBalanceResponseSchema,
  PmProCollateralRate,
  PmProCollateralRateResponseSchema,
  PmProInterestHistory,
  PmProInterestHistoryResponseSchema,
  PmProMarginAssetLeverage,
  PmProMarginAssetLeverageResponseSchema,
} from '../types/extras.types.js';

/**
 * Binance Portfolio Margin Pro — account/balance/repay endpoints under
 * `/sapi/v1/portfolio/*` and `/sapi/v2/portfolio/*` (and a v3 collateral
 * rate). PM Pro is distinct from the legacy /papi/v1 PM surface.
 */
export class PortfolioMarginPro {
  constructor(private readonly http: HttpClient) {}

  /** PM Pro account summary (v1). `GET /sapi/v1/portfolio/account` (SIGNED). */
  async account(): Promise<PmProAccount> {
    return PmProAccountSchema.parse(await this.http.get('/sapi/v1/portfolio/account', undefined, 'signed'));
  }

  /** PM Pro account summary (v2). `GET /sapi/v2/portfolio/account` (SIGNED). */
  async accountV2(): Promise<PmProAccount> {
    return PmProAccountSchema.parse(await this.http.get('/sapi/v2/portfolio/account', undefined, 'signed'));
  }

  /** PM Pro balance (v1). `GET /sapi/v1/portfolio/balance` (SIGNED). */
  async balance(): Promise<PmProBalance[]> {
    return PmProBalanceResponseSchema.parse(await this.http.get('/sapi/v1/portfolio/balance', undefined, 'signed'));
  }

  /** PM Pro balance (v2). `GET /sapi/v2/portfolio/balance` (SIGNED). */
  async balanceV2(): Promise<PmProBalance[]> {
    return PmProBalanceResponseSchema.parse(await this.http.get('/sapi/v2/portfolio/balance', undefined, 'signed'));
  }

  /** PM Pro asset-collection status. `GET /sapi/v1/portfolio/asset-collection` (SIGNED). */
  async assetCollection(): Promise<unknown[]> {
    return this.http.get('/sapi/v1/portfolio/asset-collection', undefined, 'signed');
  }

  /** Trigger PM Pro auto-collection. `POST /sapi/v1/portfolio/auto-collection` (SIGNED). */
  async autoCollection(): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/portfolio/auto-collection', undefined, 'signed');
  }

  /** PM Pro BNB transfer. `POST /sapi/v1/portfolio/bnb-transfer` (SIGNED). */
  async bnbTransfer(params: { amount: string; transferSide: 'TO_UM' | 'FROM_UM' }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/portfolio/bnb-transfer', params, 'signed');
  }

  /** PM Pro delta mode. `GET /sapi/v1/portfolio/delta-mode` (SIGNED). */
  async deltaMode(): Promise<Record<string, unknown>> {
    return this.http.get('/sapi/v1/portfolio/delta-mode', undefined, 'signed');
  }

  /** PM Pro earn-asset balance. `GET /sapi/v1/portfolio/earn-asset-balance` (SIGNED). */
  async earnAssetBalance(asset?: string): Promise<Record<string, unknown>> {
    const params = asset ? { asset } : undefined;
    return this.http.get('/sapi/v1/portfolio/earn-asset-balance', params, 'signed');
  }

  /** PM Pro earn-asset transfer. `POST /sapi/v1/portfolio/earn-asset-transfer` (SIGNED). */
  async earnAssetTransfer(params: { asset: string; amount: string; type: 'ROLL_IN' | 'ROLL_OUT' }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/portfolio/earn-asset-transfer', params, 'signed');
  }

  /** PM Pro interest history. `GET /sapi/v1/portfolio/interest-history` (SIGNED). */
  async interestHistory(options?: { asset?: string; startTime?: number; endTime?: number; current?: number; size?: number }): Promise<PmProInterestHistory[]> {
    return PmProInterestHistoryResponseSchema.parse(await this.http.get('/sapi/v1/portfolio/interest-history', options ?? {}, 'signed'));
  }

  /** PM Pro margin-call level. `GET /sapi/v1/portfolio/margin-call-level` (SIGNED). */
  async marginCallLevel(): Promise<Record<string, unknown>> {
    return this.http.get('/sapi/v1/portfolio/margin-call-level', undefined, 'signed');
  }

  /** Apply for a PM Pro loan. `POST /sapi/v1/portfolio/pmLoan` (SIGNED). */
  async pmLoan(params: { asset: string; amount: string }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/portfolio/pmLoan', params, 'signed');
  }

  /** PM Pro loan history. `GET /sapi/v1/portfolio/pmloan-history` (SIGNED). */
  async pmLoanHistory(options?: { asset?: string; startTime?: number; endTime?: number; current?: number; size?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/portfolio/pmloan-history', options ?? {}, 'signed');
  }

  /** Repay a PM Pro loan. `POST /sapi/v1/portfolio/repay` (SIGNED). */
  async repay(params: { asset: string; amount: string }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/portfolio/repay', params, 'signed');
  }

  /** Trigger repay of futures negative balance (PM Pro). `POST /sapi/v1/portfolio/repay-futures-negative-balance` (SIGNED). */
  async repayFuturesNegativeBalance(): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/portfolio/repay-futures-negative-balance', undefined, 'signed');
  }

  /** Toggle auto-repay of futures negative balance (PM Pro). `POST /sapi/v1/portfolio/repay-futures-switch` (SIGNED). */
  async repayFuturesSwitch(params: { open: boolean }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/portfolio/repay-futures-switch', params, 'signed');
  }

  /** Asset index price (PM Pro v1). `GET /sapi/v1/portfolio/asset-index-price` (SIGNED). */
  async assetIndexPrice(asset?: string): Promise<PmProAssetIndexPrice[]> {
    const params = asset ? { asset } : undefined;
    return PmProAssetIndexPriceResponseSchema.parse(await this.http.get('/sapi/v1/portfolio/asset-index-price', params, 'signed'));
  }

  /** Asset index price (PM Pro v2). `GET /sapi/v2/portfolio/asset-index-price` (SIGNED). */
  async assetIndexPriceV2(asset?: string): Promise<PmProAssetIndexPrice[]> {
    const params = asset ? { asset } : undefined;
    return PmProAssetIndexPriceResponseSchema.parse(await this.http.get('/sapi/v2/portfolio/asset-index-price', params, 'signed'));
  }

  /** Collateral rate (v1). `GET /sapi/v1/portfolio/collateralRate` (SIGNED). */
  async collateralRate(): Promise<PmProCollateralRate[]> {
    return PmProCollateralRateResponseSchema.parse(await this.http.get('/sapi/v1/portfolio/collateralRate', undefined, 'signed'));
  }

  /** Collateral rate (v2). `GET /sapi/v2/portfolio/collateralRate` (SIGNED). */
  async collateralRateV2(): Promise<PmProCollateralRate[]> {
    return PmProCollateralRateResponseSchema.parse(await this.http.get('/sapi/v2/portfolio/collateralRate', undefined, 'signed'));
  }

  /** Collateral rate (v3). `GET /sapi/v3/portfolio/collateralRate` (SIGNED). */
  async collateralRateV3(): Promise<PmProCollateralRate[]> {
    return PmProCollateralRateResponseSchema.parse(await this.http.get('/sapi/v3/portfolio/collateralRate', undefined, 'signed'));
  }

  /** Margin asset leverage (v1). `GET /sapi/v1/portfolio/margin-asset-leverage` (SIGNED). */
  async marginAssetLeverage(): Promise<PmProMarginAssetLeverage[]> {
    return PmProMarginAssetLeverageResponseSchema.parse(await this.http.get('/sapi/v1/portfolio/margin-asset-leverage', undefined, 'signed'));
  }

  /** Margin asset leverage (v2). `GET /sapi/v2/portfolio/margin-asset-leverage` (SIGNED). */
  async marginAssetLeverageV2(): Promise<PmProMarginAssetLeverage[]> {
    return PmProMarginAssetLeverageResponseSchema.parse(await this.http.get('/sapi/v2/portfolio/margin-asset-leverage', undefined, 'signed'));
  }
}
