import { z } from 'zod';
import { HttpClient } from '../client/HttpClient.js';
import {
  PmAccount,
  PmAccountSchema,
  PmAsset,
  PmAssetSchema,
  PmBalance,
  PmBalanceResponseSchema,
  PmRateLimitOrder,
  PmRateLimitOrderResponseSchema,
} from '../types/portfolio.types.js';

/**
 * Portfolio Margin account / balance / asset-collection endpoints. These are
 * the top-level PM endpoints under `/papi/v1/*` that are not sub-namespaced
 * (`/um/`, `/cm/`, `/margin/`, `/portfolio/`).
 */
export class PortfolioMarginAccount {
  constructor(private readonly http: HttpClient) {}

  /** Get PM account summary. `GET /papi/v1/account` (SIGNED). */
  async account(): Promise<PmAccount> {
    return PmAccountSchema.parse(await this.http.get('/papi/v1/account', undefined, 'signed'));
  }

  /** Get PM balances (per-asset). `GET /papi/v1/balance` (SIGNED). */
  async balance(): Promise<PmBalance[]> {
    return PmBalanceResponseSchema.parse(await this.http.get('/papi/v1/balance', undefined, 'signed'));
  }

  /**
   * Query asset-collection status. `GET /papi/v1/asset-collection` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); the endpoint is `POST /papi/v1/asset-collection`. Removal planned for the next major version.
   */
  async assetCollection(): Promise<PmAsset[]> {
    return z.array(PmAssetSchema).parse(await this.http.get('/papi/v1/asset-collection', undefined, 'signed'));
  }

  /** Trigger auto-collection of assets into PM. `POST /papi/v1/auto-collection` (SIGNED). */
  async autoCollection(): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/auto-collection', undefined, 'signed');
  }

  /** Transfer BNB between PM and spot. `POST /papi/v1/bnb-transfer` (SIGNED). */
  async bnbTransfer(params: { amount: number; transferSide: 'TO_UM' | 'FROM_UM' }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/bnb-transfer', params, 'signed');
  }

  /** Toggle auto-repay of futures negative balance. `POST /papi/v1/repay-futures-switch` (SIGNED). */
  async repayFuturesSwitch(params: { open: boolean }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/repay-futures-switch', params, 'signed');
  }

  /** Trigger repay of futures negative balance. `POST /papi/v1/repay-futures-negative-balance` (SIGNED). */
  async repayFuturesNegativeBalance(): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/repay-futures-negative-balance', undefined, 'signed');
  }

  /** User's current order rate-limit usage. `GET /papi/v1/rateLimit/order` (SIGNED). */
  async rateLimitOrder(): Promise<PmRateLimitOrder[]> {
    return PmRateLimitOrderResponseSchema.parse(await this.http.get('/papi/v1/rateLimit/order', undefined, 'signed'));
  }
}
