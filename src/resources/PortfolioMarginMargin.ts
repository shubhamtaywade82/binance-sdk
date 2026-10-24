import { HttpClient } from '../client/HttpClient.js';

/**
 * Portfolio Margin Margin sub-surface — classic spot margin account
 * endpoints scoped to a Portfolio Margin user, under `/papi/v1/margin/*`.
 * Distinct from the standalone `/sapi/v1/margin/*` surface because PM
 * accounts route margin through the unified PM ledger.
 */
export class PortfolioMarginMargin {
  constructor(private readonly http: HttpClient) {}

  /**
   * PM margin account summary. `GET /papi/v1/margin/account` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `GET /papi/v1/account`. Removal planned for the next major version.
   */
  async account(): Promise<Record<string, unknown>> {
    return this.http.get('/papi/v1/margin/account', undefined, 'signed');
  }

  /**
   * PM margin balance (per-asset). `GET /papi/v1/margin/balance` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `GET /papi/v1/balance`. Removal planned for the next major version.
   */
  async balance(): Promise<Record<string, unknown>> {
    return this.http.get('/papi/v1/margin/balance', undefined, 'signed');
  }

  /**
   * Apply for a margin loan. `POST /papi/v1/margin/loan` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `POST /papi/v1/marginLoan`. Removal planned for the next major version.
   */
  async loan(params: { asset: string; amount: string; isolatedSymbol?: string }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/margin/loan', params, 'signed');
  }

  /**
   * Repay a margin loan. `POST /papi/v1/margin/repay` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `POST /papi/v1/repayLoan`. Removal planned for the next major version.
   */
  async repay(params: { asset: string; amount: string; isolatedSymbol?: string }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/margin/repay', params, 'signed');
  }

  /**
   * Margin loan records. `GET /papi/v1/margin/loan` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `GET /papi/v1/margin/marginLoan`. Removal planned for the next major version.
   */
  async loanRecord(options: { asset: string; txId?: number; startTime?: number; endTime?: number; current?: number; size?: number; archived?: boolean }): Promise<unknown[]> {
    return this.http.get('/papi/v1/margin/loan', options, 'signed');
  }

  /**
   * Margin repay records. `GET /papi/v1/margin/repay` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `GET /papi/v1/margin/repayLoan`. Removal planned for the next major version.
   */
  async repayRecord(options: { asset: string; txId?: number; startTime?: number; endTime?: number; current?: number; size?: number; archived?: boolean }): Promise<unknown[]> {
    return this.http.get('/papi/v1/margin/repay', options, 'signed');
  }

  /** Place a margin order. `POST /papi/v1/margin/order` (SIGNED). */
  async placeOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/margin/order', params, 'signed');
  }

  /** Cancel a margin order. `DELETE /papi/v1/margin/order` (SIGNED). */
  async cancelOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string; isNewOrder?: boolean }): Promise<Record<string, unknown>> {
    return this.http.delete('/papi/v1/margin/order', { symbol, ...options }, 'signed');
  }

  /** Currently open margin orders. `GET /papi/v1/margin/openOrders` (SIGNED). */
  async openOrders(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/papi/v1/margin/openOrders', params, 'signed');
  }

  /** All margin orders. `GET /papi/v1/margin/allOrders` (SIGNED). */
  async allOrders(options: { symbol: string; orderId?: number; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/papi/v1/margin/allOrders', options, 'signed');
  }

  /**
   * Query a single open margin order. `GET /papi/v1/margin/openOrder` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use `GET /papi/v1/margin/openOrders`. Removal planned for the next major version.
   */
  async openOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<Record<string, unknown>> {
    return this.http.get('/papi/v1/margin/openOrder', { symbol, ...options }, 'signed');
  }

  /** Margin user trades. `GET /papi/v1/margin/myTrades` (SIGNED). */
  async myTrades(options: { symbol: string; startTime?: number; endTime?: number; fromId?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/papi/v1/margin/myTrades', options, 'signed');
  }

  /**
   * Margin price index. `GET /papi/v1/margin/priceIndex` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use the Margin client (`/sapi/v1/margin/priceIndex`). Removal planned for the next major version.
   */
  async priceIndex(symbol: string): Promise<Record<string, unknown>> {
    return this.http.get('/papi/v1/margin/priceIndex', { symbol }, 'signed');
  }

  /**
   * All marginable assets. `GET /papi/v1/margin/allAssets` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use the Margin client (`/sapi/v1/margin/allAssets`). Removal planned for the next major version.
   */
  async allAssets(): Promise<unknown[]> {
    return this.http.get('/papi/v1/margin/allAssets', undefined, 'signed');
  }

  /**
   * All marginable pairs. `GET /papi/v1/margin/allPairs` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use the Margin client (`/sapi/v1/margin/allPairs`). Removal planned for the next major version.
   */
  async allPairs(): Promise<unknown[]> {
    return this.http.get('/papi/v1/margin/allPairs', undefined, 'signed');
  }

  /**
   * Cross-margin transfer. `POST /papi/v1/margin/transfer` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); use the universal transfer `POST /sapi/v1/asset/transfer`. Removal planned for the next major version.
   */
  async transfer(params: { asset: string; amount: string; type: 'ROLL_IN' | 'ROLL_OUT' }): Promise<Record<string, unknown>> {
    return this.http.post('/papi/v1/margin/transfer', params, 'signed');
  }
}
