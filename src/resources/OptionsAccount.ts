import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Options account / history — signed endpoints on the eapi host.
 * Covers the account/bill, position, user trades, commission, exercise
 * record, and exercise history endpoints.
 */
export class OptionsAccount {
  constructor(private readonly http: HttpClient) {}

  /** Account margin details for the Options product. `GET /eapi/v1/marginAccount` (SIGNED). */
  async marginAccount(underlying?: string): Promise<unknown> {
    const params = underlying ? { underlying } : undefined;
    return this.http.get('/marginAccount', params, 'signed');
  }

  /** Account funding-asset bill (transaction history). `GET /eapi/v1/bill` (SIGNED). */
  async bill(options: {
    currency?: string;
    recordId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/bill', options, 'signed');
  }

  /** Current options positions. `GET /eapi/v1/position` (SIGNED). */
  async position(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/position', params, 'signed');
  }

  /** User trade history for options. `GET /eapi/v1/userTrades` (SIGNED). */
  async userTrades(options: {
    symbol: string;
    fromId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/userTrades', options, 'signed');
  }

  /** User commission rate for an options symbol. `GET /eapi/v1/commission` (SIGNED). */
  async commission(symbol: string): Promise<Record<string, unknown>> {
    return this.http.get('/commission', { symbol }, 'signed');
  }

  /** Exercise record (latest settle records per symbol). `GET /eapi/v1/exerciseRecord` (SIGNED). */
  async exerciseRecord(options: {
    symbol?: string;
    expDate?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/exerciseRecord', options, 'signed');
  }

  /** Exercise history (longer-range settle records). `GET /eapi/v1/exerciseHistory` (SIGNED). */
  async exerciseHistory(options: {
    underlying?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/exerciseHistory', options, 'signed');
  }
}
