import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Alpha — public market-data endpoints under `/bapi/defi/v1/public/*`.
 * Returns trade, exchangeInfo, klines, ticker, and the wallet-direct token
 * list. Alpha is a separate bapi-routed product family.
 *
 * Endpoint surface (5 total).
 */
export class Alpha {
  constructor(private readonly http: HttpClient) {}

  /** Aggregated trades. `GET /bapi/defi/v1/public/alpha-trade/agg-trades` (PUBLIC). */
  async aggTrades(options: { symbol: string; limit?: number }): Promise<unknown[]> {
    return this.http.get('/defi/v1/public/alpha-trade/agg-trades', options);
  }

  /** Exchange info for the Alpha product. `GET /bapi/defi/v1/public/alpha-trade/get-exchange-info` (PUBLIC). */
  async exchangeInfo(): Promise<Record<string, unknown>> {
    return this.http.get('/defi/v1/public/alpha-trade/get-exchange-info');
  }

  /** Klines. `GET /bapi/defi/v1/public/alpha-trade/klines` (PUBLIC). */
  async klines(options: {
    symbol: string;
    interval: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/defi/v1/public/alpha-trade/klines', options);
  }

  /** 24-hour ticker. `GET /bapi/defi/v1/public/alpha-trade/ticker` (PUBLIC). */
  async ticker(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/defi/v1/public/alpha-trade/ticker', params);
  }

  /** Alpha token list (wallet-direct). `GET /bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list` (PUBLIC). */
  async tokenList(): Promise<unknown[]> {
    return this.http.get('/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list');
  }
}
