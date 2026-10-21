import { HttpClient } from '../client/HttpClient.js';

/**
 * COIN-M Futures analytics — endpoints under `/futures/data` (served from the
 * USDⓈ-M futures-data host) plus a few COIN-M-specific signed endpoints under
 * `/dapi/v1`. Mirrors the {@link FuturesData} surface for USDⓈ-M, adapted to
 * the COIN-M convention of using `pair` rather than `symbol` for several
 * analytics calls.
 *
 * Paths are canonical (`/futures/data/*` for analytics, `/dapi/v1/*` for
 * signed COIN-M endpoints). When constructed via `buildCoinmSurface`, the
 * `dataHttp` HttpClient uses the host-only `fapiRoot` baseURL
 * (`https://fapi.binance.com`), so canonical paths combine correctly.
 *
 * Responses are intentionally returned as `unknown[]` because Binance does not
 * publish formal schemas for the `/futures/data/*` endpoints and the fields
 * vary by `period` / `contractType` parameter. Callers wishing to validate
 * the shape can wrap the result in their own Zod schema.
 */
export class CoinMData {
  private readonly http: HttpClient;
  private readonly dataHttp: HttpClient;

  constructor(http: HttpClient, dataHttp: HttpClient) {
    this.http = http;
    this.dataHttp = dataHttp;
  }

  /**
   * COIN-M basis history. Endpoint: `GET /futures/data/basis` (PUBLIC).
   */
  async basis(
    pair: string,
    contractType: string,
    period: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<unknown[]> {
    return this.dataHttp.get('/futures/data/basis', { pair, contractType, period, ...options });
  }

  /**
   * Global long/short account ratio. Endpoint: `GET /futures/data/globalLongShortAccountRatio` (PUBLIC).
   */
  async globalLongShortAccountRatio(
    symbol: string,
    period: string,
    limit = 30,
  ): Promise<unknown[]> {
    return this.dataHttp.get('/futures/data/globalLongShortAccountRatio', { symbol, period, limit });
  }

  /**
   * Taker buy/sell volume. Endpoint: `GET /futures/data/takerBuySellVol` (PUBLIC).
   */
  async takerBuySellVol(
    symbol: string,
    period: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<unknown[]> {
    return this.dataHttp.get('/futures/data/takerBuySellVol', { symbol, period, ...options });
  }

  /**
   * Top trader long/short account ratio. Endpoint: `GET /futures/data/topLongShortAccountRatio` (PUBLIC).
   */
  async topLongShortAccountRatio(
    symbol: string,
    period: string,
    limit = 30,
  ): Promise<unknown[]> {
    return this.dataHttp.get('/futures/data/topLongShortAccountRatio', { symbol, period, limit });
  }

  /**
   * Top trader long/short position ratio. Endpoint: `GET /futures/data/topLongShortPositionRatio` (PUBLIC).
   */
  async topLongShortPositionRatio(
    symbol: string,
    period: string,
    limit = 30,
  ): Promise<unknown[]> {
    return this.dataHttp.get('/futures/data/topLongShortPositionRatio', { symbol, period, limit });
  }
}
