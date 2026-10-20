import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Copy Trading — query whether the API key is configured as a lead
 * trader, and which symbols are eligible for copy-trading.
 *
 * Endpoint surface (2 total).
 */
export class CopyTrading {
  constructor(private readonly http: HttpClient) {}

  /** Eligible lead symbols for futures copy-trading. `GET /sapi/v1/copyTrading/futures/leadSymbol` (SIGNED). */
  async futuresLeadSymbol(options?: { pageSize?: number; pageIndex?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/copyTrading/futures/leadSymbol', options ?? {}, 'signed');
  }

  /** User status (lead trader or not). `GET /sapi/v1/copyTrading/futures/userStatus` (SIGNED). */
  async futuresUserStatus(): Promise<Record<string, unknown>> {
    return this.http.get('/sapi/v1/copyTrading/futures/userStatus', undefined, 'signed');
  }
}
