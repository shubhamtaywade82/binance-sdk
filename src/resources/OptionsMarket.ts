import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Options market data — public market endpoints on the eapi host.
 * No auth required for any of these endpoints.
 */
export class OptionsMarket {
  constructor(private readonly http: HttpClient) {}

  /** Test connectivity to the Options host. `GET /eapi/v1/ping` (PUBLIC). */
  async ping(): Promise<Record<string, unknown>> {
    return this.http.get('/ping');
  }

  /** Options server time. `GET /eapi/v1/time` (PUBLIC). */
  async time(): Promise<{ serverTime: number }> {
    return this.http.get('/time');
  }

  /** Options trading rules (symbols, filters, limits). `GET /eapi/v1/exchangeInfo` (PUBLIC). */
  async exchangeInfo(): Promise<Record<string, unknown>> {
    return this.http.get('/exchangeInfo');
  }

  /** Order book depth for an options symbol. `GET /eapi/v1/depth` (PUBLIC). */
  async depth(symbol: string, limit?: number): Promise<Record<string, unknown>> {
    return this.http.get('/depth', { symbol, limit });
  }

  /** Recent trades for an options symbol. `GET /eapi/v1/trades` (PUBLIC). */
  async trades(symbol: string, limit?: number): Promise<unknown[]> {
    return this.http.get('/trades', { symbol, limit });
  }

  /** Historical klines for an options symbol. `GET /eapi/v1/klines` (PUBLIC). */
  async klines(options: {
    symbol: string;
    interval: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/klines', options);
  }

  /** Mark price for one or all options symbols. `GET /eapi/v1/mark` (PUBLIC). */
  async mark(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/mark', params);
  }

  /** Index price for an underlying asset. `GET /eapi/v1/index` (PUBLIC). */
  async index(underlying?: string): Promise<unknown[]> {
    const params = underlying ? { underlying } : undefined;
    return this.http.get('/index', params);
  }

  /** 24-hour ticker for one or all options symbols. `GET /eapi/v1/ticker` (PUBLIC). */
  async ticker(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/ticker', params);
  }

  /** Current open interest for an options symbol. `GET /eapi/v1/openInterest` (PUBLIC). */
  async openInterest(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/openInterest', params);
  }
}
