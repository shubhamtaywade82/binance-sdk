import { HttpClient } from '../client/HttpClient.js';

/**
 * COIN-M Futures analytics — endpoints under `/futures/data` (served from the
 * USDⓈ-M futures-data host) plus a few COIN-M-specific signed endpoints under
 * `/dapi/v1`. Mirrors the {@link FuturesData} surface for USDⓈ-M, adapted to
 * the COIN-M convention of using `pair` rather than `symbol` for several
 * analytics calls.
 *
 * Used as a standalone resource (and via the standalone `CoinMClient`) — the
 * multi-product facade exposes it through `client.coinm.data`.
 */
export class CoinMData {
  /**
   * Two HttpClient instances, mirroring {@link FuturesData}:
   *
   * - `http` for signed COIN-M endpoints under `/dapi/v1` (e.g. `adlQuantile`).
   * - `dataHttp` for public analytics under `/futures/data` (basis, long/short
   *   ratios, taker buy/sell volumes).
   */
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
    return this.dataHttp.get('/basis', { pair, contractType, period, ...options });
  }

  /**
   * Global long/short account ratio. Endpoint: `GET /futures/data/globalLongShortAccountRatio` (PUBLIC).
   */
  async globalLongShortAccountRatio(
    symbol: string,
    period: string,
    limit = 30,
  ): Promise<unknown[]> {
    return this.dataHttp.get('/globalLongShortAccountRatio', { symbol, period, limit });
  }

  /**
   * Taker buy/sell volume. Endpoint: `GET /futures/data/takerBuySellVol` (PUBLIC).
   */
  async takerBuySellVol(
    symbol: string,
    period: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<unknown[]> {
    return this.dataHttp.get('/takerBuySellVol', { symbol, period, ...options });
  }

  /**
   * Top trader long/short account ratio. Endpoint: `GET /futures/data/topLongShortAccountRatio` (PUBLIC).
   */
  async topLongShortAccountRatio(
    symbol: string,
    period: string,
    limit = 30,
  ): Promise<unknown[]> {
    return this.dataHttp.get('/topLongShortAccountRatio', { symbol, period, limit });
  }

  /**
   * Top trader long/short position ratio. Endpoint: `GET /futures/data/topLongShortPositionRatio` (PUBLIC).
   */
  async topLongShortPositionRatio(
    symbol: string,
    period: string,
    limit = 30,
  ): Promise<unknown[]> {
    return this.dataHttp.get('/topLongShortPositionRatio', { symbol, period, limit });
  }
}
