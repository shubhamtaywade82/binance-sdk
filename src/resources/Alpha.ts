import { HttpClient } from '../client/HttpClient.js';
import {
  AlphaAggTrade,
  AlphaAggTradesResponseSchema,
  AlphaExchangeInfo,
  AlphaExchangeInfoSchema,
  AlphaKline,
  AlphaKlinesResponseSchema,
  AlphaTicker,
  AlphaTickerResponseSchema,
  AlphaToken,
  AlphaTokenListResponseSchema,
} from '../types/extras.types.js';

/**
 * Binance Alpha — public market-data endpoints under `/bapi/defi/v1/public/*`.
 *
 * Note: the BAPI host is `https://www.binance.com` (no version path on the
 * host) and the `/bapi` prefix is included in each path, matching the
 * canonical registry entries.
 */
export class Alpha {
  constructor(private readonly http: HttpClient) {}

  /** Aggregated trades. `GET /bapi/defi/v1/public/alpha-trade/agg-trades` (PUBLIC). */
  async aggTrades(options: { symbol: string; limit?: number }): Promise<AlphaAggTrade[]> {
    return AlphaAggTradesResponseSchema.parse(await this.http.get('/bapi/defi/v1/public/alpha-trade/agg-trades', options));
  }

  /** Exchange info for the Alpha product. `GET /bapi/defi/v1/public/alpha-trade/get-exchange-info` (PUBLIC). */
  async exchangeInfo(): Promise<AlphaExchangeInfo> {
    return AlphaExchangeInfoSchema.parse(await this.http.get('/bapi/defi/v1/public/alpha-trade/get-exchange-info'));
  }

  /** Klines. `GET /bapi/defi/v1/public/alpha-trade/klines` (PUBLIC). */
  async klines(options: {
    symbol: string;
    interval: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<AlphaKline[]> {
    return AlphaKlinesResponseSchema.parse(await this.http.get('/bapi/defi/v1/public/alpha-trade/klines', options));
  }

  /** 24-hour ticker. `GET /bapi/defi/v1/public/alpha-trade/ticker` (PUBLIC). */
  async ticker(symbol?: string): Promise<AlphaTicker[]> {
    const params = symbol ? { symbol } : undefined;
    return AlphaTickerResponseSchema.parse(await this.http.get('/bapi/defi/v1/public/alpha-trade/ticker', params));
  }

  /** Alpha token list (wallet-direct). `GET /bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list` (PUBLIC). */
  async tokenList(): Promise<AlphaToken[]> {
    return AlphaTokenListResponseSchema.parse(await this.http.get('/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list'));
  }

  /** Full depth order book for an Alpha token. `GET /bapi/defi/v1/public/alpha-trade/fullDepth` (PUBLIC). */
  async fullDepth(options: { symbol: string; limit?: number }): Promise<unknown> {
    return this.http.get('/bapi/defi/v1/public/alpha-trade/fullDepth', options);
  }
}
