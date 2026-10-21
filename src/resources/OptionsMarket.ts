import { HttpClient } from '../client/HttpClient.js';
import {
  OptionsDepthSchema,
  OptionsDepth,
  OptionsExchangeInfo,
  OptionsExchangeInfoSchema,
  OptionsIndex,
  OptionsIndexResponseSchema,
  OptionsKlinesResponseSchema,
  OptionsKline,
  OptionsMark,
  OptionsMarkResponseSchema,
  OptionsOpenInterest,
  OptionsOpenInterestResponseSchema,
  OptionsServerTimeSchema,
  OptionsTicker,
  OptionsTickerResponseSchema,
  OptionsTrade,
  OptionsTradesResponseSchema,
} from '../types/options.types.js';

/**
 * Binance Options market data — public market endpoints on the eapi host.
 * Paths are canonical (`/eapi/v1/*`) so they can be served from either
 * `https://eapi.binance.com` (host-only baseURL) or
 * `https://eapi.binance.com/eapi/v1` (host+version baseURL) — both produce
 * the same final URL.
 *
 * No auth required for any of these endpoints.
 */
export class OptionsMarket {
  constructor(private readonly http: HttpClient) {}

  /** Test connectivity to the Options host. `GET /eapi/v1/ping` (PUBLIC). */
  async ping(): Promise<Record<string, unknown>> {
    return this.http.get('/eapi/v1/ping');
  }

  /** Options server time. `GET /eapi/v1/time` (PUBLIC). */
  async time(): Promise<{ serverTime: number; timezone?: string }> {
    return OptionsServerTimeSchema.parse(await this.http.get('/eapi/v1/time'));
  }

  /** Options trading rules (symbols, filters, limits). `GET /eapi/v1/exchangeInfo` (PUBLIC). */
  async exchangeInfo(): Promise<OptionsExchangeInfo> {
    return OptionsExchangeInfoSchema.parse(await this.http.get('/eapi/v1/exchangeInfo'));
  }

  /** Order book depth for an options symbol. `GET /eapi/v1/depth` (PUBLIC). */
  async depth(symbol: string, limit?: number): Promise<OptionsDepth> {
    return OptionsDepthSchema.parse(await this.http.get('/eapi/v1/depth', { symbol, limit }));
  }

  /** Recent trades for an options symbol. `GET /eapi/v1/trades` (PUBLIC). */
  async trades(symbol: string, limit?: number): Promise<OptionsTrade[]> {
    return OptionsTradesResponseSchema.parse(await this.http.get('/eapi/v1/trades', { symbol, limit }));
  }

  /** Historical klines for an options symbol. `GET /eapi/v1/klines` (PUBLIC). */
  async klines(options: {
    symbol: string;
    interval: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsKline[]> {
    return OptionsKlinesResponseSchema.parse(await this.http.get('/eapi/v1/klines', options));
  }

  /** Mark price for one or all options symbols. `GET /eapi/v1/mark` (PUBLIC). */
  async mark(symbol?: string): Promise<OptionsMark[]> {
    const params = symbol ? { symbol } : undefined;
    return OptionsMarkResponseSchema.parse(await this.http.get('/eapi/v1/mark', params));
  }

  /** Index price for an underlying asset. `GET /eapi/v1/index` (PUBLIC). */
  async index(underlying?: string): Promise<OptionsIndex[]> {
    const params = underlying ? { underlying } : undefined;
    return OptionsIndexResponseSchema.parse(await this.http.get('/eapi/v1/index', params));
  }

  /** 24-hour ticker for one or all options symbols. `GET /eapi/v1/ticker` (PUBLIC). */
  async ticker(symbol?: string): Promise<OptionsTicker[]> {
    const params = symbol ? { symbol } : undefined;
    return OptionsTickerResponseSchema.parse(await this.http.get('/eapi/v1/ticker', params));
  }

  /** Current open interest for an options symbol. `GET /eapi/v1/openInterest` (PUBLIC). */
  async openInterest(symbol?: string): Promise<OptionsOpenInterest[]> {
    const params = symbol ? { symbol } : undefined;
    return OptionsOpenInterestResponseSchema.parse(await this.http.get('/eapi/v1/openInterest', params));
  }
}
