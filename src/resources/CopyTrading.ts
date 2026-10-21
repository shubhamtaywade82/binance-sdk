import { HttpClient } from '../client/HttpClient.js';
import {
  CopyTradingLeadSymbol,
  CopyTradingLeadSymbolResponseSchema,
  CopyTradingUserStatus,
  CopyTradingUserStatusSchema,
} from '../types/extras.types.js';

/**
 * Binance Copy Trading — query whether the API key is configured as a lead
 * trader, and which symbols are eligible for copy-trading.
 */
export class CopyTrading {
  constructor(private readonly http: HttpClient) {}

  /** Eligible lead symbols for futures copy-trading. `GET /sapi/v1/copyTrading/futures/leadSymbol` (SIGNED). */
  async futuresLeadSymbol(options?: { pageSize?: number; pageIndex?: number }): Promise<CopyTradingLeadSymbol[]> {
    return CopyTradingLeadSymbolResponseSchema.parse(await this.http.get('/sapi/v1/copyTrading/futures/leadSymbol', options ?? {}, 'signed'));
  }

  /** User status (lead trader or not). `GET /sapi/v1/copyTrading/futures/userStatus` (SIGNED). */
  async futuresUserStatus(): Promise<CopyTradingUserStatus> {
    return CopyTradingUserStatusSchema.parse(await this.http.get('/sapi/v1/copyTrading/futures/userStatus', undefined, 'signed'));
  }
}
