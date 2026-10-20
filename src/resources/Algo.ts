import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Algo SAPI — TWAP/VP algo orders for spot and futures. Distinct from
 * the Futures-hosted `/fapi/v1/algoOrder` surface: these SAPI-routed algo
 * orders run through the broker/spot algo engine.
 *
 * Endpoint surface (11 total): 6 futures + 5 spot.
 */
export class AlgoSpot {
  constructor(private readonly http: HttpClient) {}

  /** Historical spot algo orders. `GET /sapi/v1/algo/spot/historicalOrders` (SIGNED). */
  async historicalOrders(options?: { symbol?: string; side?: 'BUY' | 'SELL'; startTime?: number; endTime?: number; page?: number; pageSize?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/algo/spot/historicalOrders', options ?? {}, 'signed');
  }

  /** Place a new spot TWAP order. `POST /sapi/v1/algo/spot/newOrderTwap` (SIGNED). */
  async newOrderTwap(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    duration: number;
    clientOrderId?: string;
    limitPrice?: string;
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/algo/spot/newOrderTwap', params, 'signed');
  }

  /** Currently open spot algo orders. `GET /sapi/v1/algo/spot/openOrders` (SIGNED). */
  async openOrders(options?: { symbol?: string; page?: number; pageSize?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/algo/spot/openOrders', options ?? {}, 'signed');
  }

  /** Cancel a spot algo order. `DELETE /sapi/v1/algo/spot/order` (SIGNED). */
  async cancelOrder(algoId: string): Promise<Record<string, unknown>> {
    return this.http.delete('/sapi/v1/algo/spot/order', { algoId }, 'signed');
  }

  /** Sub-orders of a spot algo order (per-slice execution). `GET /sapi/v1/algo/spot/subOrders` (SIGNED). */
  async subOrders(options: { algoId: string; page?: number; pageSize?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/algo/spot/subOrders', options, 'signed');
  }
}

/** Futures algo orders (TWAR/VP). Same surface as AlgoSpot, different paths. */
export class AlgoFutures {
  constructor(private readonly http: HttpClient) {}

  /** Historical futures algo orders. `GET /sapi/v1/algo/futures/historicalOrders` (SIGNED). */
  async historicalOrders(options?: { symbol?: string; side?: 'BUY' | 'SELL'; startTime?: number; endTime?: number; page?: number; pageSize?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/algo/futures/historicalOrders', options ?? {}, 'signed');
  }

  /** Place a new futures TWAP order. `POST /sapi/v1/algo/futures/newOrderTwap` (SIGNED). */
  async newOrderTwap(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    duration: number;
    clientOrderId?: string;
    limitPrice?: string;
    positionSide?: 'BOTH' | 'LONG' | 'SHORT';
    reduceOnly?: boolean;
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/algo/futures/newOrderTwap', params, 'signed');
  }

  /** Place a new futures VP (Volume Participation) order. `POST /sapi/v1/algo/futures/newOrderVp` (SIGNED). */
  async newOrderVp(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    participationRate: number;
    clientOrderId?: string;
    limitPrice?: string;
    positionSide?: 'BOTH' | 'LONG' | 'SHORT';
    reduceOnly?: boolean;
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/algo/futures/newOrderVp', params, 'signed');
  }

  /** Currently open futures algo orders. `GET /sapi/v1/algo/futures/openOrders` (SIGNED). */
  async openOrders(options?: { symbol?: string; page?: number; pageSize?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/algo/futures/openOrders', options ?? {}, 'signed');
  }

  /** Cancel a futures algo order. `DELETE /sapi/v1/algo/futures/order` (SIGNED). */
  async cancelOrder(algoId: string): Promise<Record<string, unknown>> {
    return this.http.delete('/sapi/v1/algo/futures/order', { algoId }, 'signed');
  }

  /** Sub-orders of a futures algo order. `GET /sapi/v1/algo/futures/subOrders` (SIGNED). */
  async subOrders(options: { algoId: string; page?: number; pageSize?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/algo/futures/subOrders', options, 'signed');
  }
}

/** Algo namespace — exposes `algo.spot` and `algo.futures`. */
export class Algo {
  readonly spot: AlgoSpot;
  readonly futures: AlgoFutures;

  constructor(http: HttpClient) {
    this.spot = new AlgoSpot(http);
    this.futures = new AlgoFutures(http);
  }
}
