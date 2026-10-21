import { HttpClient } from '../client/HttpClient.js';
import {
  PmAssetIndexPrice,
  PmAssetIndexPriceResponseSchema,
  PmCollateralRate,
  PmCollateralRateResponseSchema,
  PmEarnAssetBalance,
  PmEarnAssetBalanceSchema,
  PmInterestHistory,
  PmInterestHistoryResponseSchema,
  PmMarginAssetLeverage,
  PmMarginAssetLeverageResponseSchema,
  PmMarginCallLevel,
  PmMarginCallLevelSchema,
  PmPortfolioAccount,
  PmPortfolioAccountSchema,
  PmPortfolioBalance,
  PmPortfolioBalanceResponseSchema,
} from '../types/portfolio.types.js';

/**
 * Portfolio Margin `/portfolio/*` sub-surface — PM-mode portfolio account,
 * collateral rates, PM loans, interest history, margin-call level, delta
 * mode, and earn-asset transfers. Lives under `/papi/v1/portfolio/*`.
 */
export class PortfolioMarginPortfolio {
  constructor(private readonly http: HttpClient) {}

  /** PM portfolio account summary. `GET /papi/v1/portfolio/account` (SIGNED). */
  async account(): Promise<PmPortfolioAccount> {
    return PmPortfolioAccountSchema.parse(await this.http.get('/papi/v1/portfolio/account', undefined, 'signed'));
  }

  /** PM portfolio balance. `GET /papi/v1/portfolio/balance` (SIGNED). */
  async balance(): Promise<PmPortfolioBalance[]> {
    return PmPortfolioBalanceResponseSchema.parse(await this.http.get('/papi/v1/portfolio/balance', undefined, 'signed'));
  }

  /** Collateral rate table. `GET /papi/v1/portfolio/collateralRate` (SIGNED). */
  async collateralRate(): Promise<PmCollateralRate[]> {
    return PmCollateralRateResponseSchema.parse(await this.http.get('/papi/v1/portfolio/collateralRate', undefined, 'signed'));
  }

  /** Asset index price. `GET /papi/v1/portfolio/asset-index-price` (SIGNED). */
  async assetIndexPrice(asset?: string): Promise<PmAssetIndexPrice[]> {
    const params = asset ? { asset } : undefined;
    return PmAssetIndexPriceResponseSchema.parse(await this.http.get('/papi/v1/portfolio/asset-index-price', params, 'signed'));
  }

  /** Margin asset leverage. `GET /papi/v1/portfolio/margin-asset-leverage` (SIGNED). */
  async marginAssetLeverage(): Promise<PmMarginAssetLeverage[]> {
    return PmMarginAssetLeverageResponseSchema.parse(await this.http.get('/papi/v1/portfolio/margin-asset-leverage', undefined, 'signed'));
  }

  /** Apply for a PM loan. `POST /papi/v1/portfolio/pmLoan` (SIGNED). */
  async pmLoan(params: { asset: string; amount: string }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/portfolio/pmLoan', params, 'signed');
  }

  /** PM loan history. `GET /papi/v1/portfolio/pmLoan-history` (SIGNED). */
  async pmLoanHistory(options?: { asset?: string; startTime?: number; endTime?: number; current?: number; size?: number }): Promise<unknown[]> {
    return this.http.get('/papi/v1/portfolio/pmLoan-history', options ?? {}, 'signed');
  }

  /** Repay a PM loan. `POST /papi/v1/portfolio/repay` (SIGNED). */
  async repay(params: { asset: string; amount: string }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/portfolio/repay', params, 'signed');
  }

  /** PM interest history. `GET /papi/v1/portfolio/interest-history` (SIGNED). */
  async interestHistory(options?: { asset?: string; startTime?: number; endTime?: number; current?: number; size?: number }): Promise<PmInterestHistory[]> {
    return PmInterestHistoryResponseSchema.parse(await this.http.get('/papi/v1/portfolio/interest-history', options ?? {}, 'signed'));
  }

  /** PM margin call level. `GET /papi/v1/portfolio/margin-call-level` (SIGNED). */
  async marginCallLevel(): Promise<PmMarginCallLevel> {
    return PmMarginCallLevelSchema.parse(await this.http.get('/papi/v1/portfolio/margin-call-level', undefined, 'signed'));
  }

  /** PM delta mode. `GET /papi/v1/portfolio/delta-mode` (SIGNED). */
  async deltaMode(): Promise<Record<string, unknown>> {
    return this.http.get('/papi/v1/portfolio/delta-mode', undefined, 'signed');
  }

  /** Earn-asset balance. `GET /papi/v1/portfolio/earn-asset-balance` (SIGNED). */
  async earnAssetBalance(asset?: string): Promise<PmEarnAssetBalance> {
    const params = asset ? { asset } : undefined;
    return PmEarnAssetBalanceSchema.parse(await this.http.get('/papi/v1/portfolio/earn-asset-balance', params, 'signed'));
  }

  /** Earn-asset transfer. `POST /papi/v1/portfolio/earn-asset-transfer` (SIGNED). */
  async earnAssetTransfer(params: { asset: string; amount: string; type: 'ROLL_IN' | 'ROLL_OUT' }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/portfolio/earn-asset-transfer', params, 'signed');
  }
}
