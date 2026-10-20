import { HttpClient } from '../client/HttpClient.js';

/**
 * Portfolio Margin account / balance / asset-collection endpoints. These are
 * the top-level PM endpoints under `/papi/v1/*` that are not sub-namespaced
 * (`/um/`, `/cm/`, `/margin/`, `/portfolio/`).
 */
export class PortfolioMarginAccount {
  constructor(private readonly http: HttpClient) {}

  /** Get PM account summary. `GET /papi/v1/account` (SIGNED). */
  async account(): Promise<Record<string, unknown>> {
    return this.http.get('/account', undefined, 'signed');
  }

  /** Get PM balances (per-asset). `GET /papi/v1/balance` (SIGNED). */
  async balance(): Promise<unknown[]> {
    return this.http.get('/balance', undefined, 'signed');
  }

  /** Query asset-collection status. `GET /papi/v1/asset-collection` (SIGNED). */
  async assetCollection(): Promise<unknown[]> {
    return this.http.get('/asset-collection', undefined, 'signed');
  }

  /** Trigger auto-collection of assets into PM. `POST /papi/v1/auto-collection` (SIGNED). */
  async autoCollection(): Promise<Record<string, unknown>> {
    return this.http.post('/auto-collection', undefined, 'signed');
  }

  /** Transfer BNB between PM and spot. `POST /papi/v1/bnb-transfer` (SIGNED). */
  async bnbTransfer(params: { amount: number; transferSide: 'TO_UM' | 'FROM_UM' }): Promise<Record<string, unknown>> {
    return this.http.post('/bnb-transfer', params, 'signed');
  }

  /** Toggle auto-repay of futures negative balance. `POST /papi/v1/repay-futures-switch` (SIGNED). */
  async repayFuturesSwitch(params: { open: boolean }): Promise<Record<string, unknown>> {
    return this.http.post('/repay-futures-switch', params, 'signed');
  }

  /** Trigger repay of futures negative balance. `POST /papi/v1/repay-futures-negative-balance` (SIGNED). */
  async repayFuturesNegativeBalance(): Promise<Record<string, unknown>> {
    return this.http.post('/repay-futures-negative-balance', undefined, 'signed');
  }

  /** User's current order rate-limit usage. `GET /papi/v1/rateLimit/order` (SIGNED). */
  async rateLimitOrder(): Promise<unknown[]> {
    return this.http.get('/rateLimit/order', undefined, 'signed');
  }
}
