import { HttpClient } from '../client/HttpClient.js';
import {
  cancelAlgoOrderFutureAlgoResponseSchema,
  cancelAlgoOrderSpotAlgoResponseSchema,
  queryCurrentAlgoOpenOrdersFutureAlgoResponseSchema,
  queryCurrentAlgoOpenOrdersSpotAlgoResponseSchema,
  queryHistoricalAlgoOrdersFutureAlgoResponseSchema,
  queryHistoricalAlgoOrdersSpotAlgoResponseSchema,
  querySubOrdersFutureAlgoResponseSchema,
  querySubOrdersSpotAlgoResponseSchema,
  timeWeightedAveragePriceFutureAlgoResponseSchema,
  timeWeightedAveragePriceSpotAlgoResponseSchema,
  volumeParticipationFutureAlgoResponseSchema,
  volumeParticipationResponseSchema,
} from '../types/algo.wave8.types.js';
import type {
  CancelAlgoOrderFutureAlgoResponse,
  CancelAlgoOrderSpotAlgoResponse,
  QueryCurrentAlgoOpenOrdersFutureAlgoResponse,
  QueryCurrentAlgoOpenOrdersSpotAlgoResponse,
  QueryHistoricalAlgoOrdersFutureAlgoResponse,
  QueryHistoricalAlgoOrdersSpotAlgoResponse,
  QuerySubOrdersFutureAlgoResponse,
  QuerySubOrdersSpotAlgoResponse,
  TimeWeightedAveragePriceFutureAlgoResponse,
  TimeWeightedAveragePriceSpotAlgoResponse,
  VolumeParticipationFutureAlgoResponse,
  VolumeParticipationResponse,
} from '../types/algo.wave8.types.js';

/**
 * Binance Algo SAPI — TWAP/VP algo orders for spot and futures. Distinct from
 * the Futures-hosted `/fapi/v1/algoOrder` surface: these SAPI-routed algo
 * orders run through the broker/spot algo engine.
 *
 * Wave 8: every method parses with an oracle-derived strict schema
 * (src/types/algo.wave8.types.ts). The migration also fixed real wire-shape
 * bugs — the previous Wave 1 schemas parsed list endpoints as plain arrays
 * and submits as full order echoes, but the documented (and live) wire is
 * wrapped (`{ total, orders }`) and submits ack with
 * `{ clientAlgoId, success, code, msg }`; the old parses threw on every
 * real response.
 */
export class AlgoSpot {
  constructor(private readonly http: HttpClient) {}

  /**
   * Historical spot algo orders. `GET /sapi/v1/algo/spot/historicalOrders` (SIGNED).
   * Returns the documented wrapped shape `{ total, orders }`.
   */
  async historicalOrders(options?: { symbol?: string; side?: 'BUY' | 'SELL'; startTime?: number; endTime?: number; page?: number; pageSize?: number }): Promise<QueryHistoricalAlgoOrdersSpotAlgoResponse> {
    return queryHistoricalAlgoOrdersSpotAlgoResponseSchema.parse(await this.http.get('/sapi/v1/algo/spot/historicalOrders', options ?? {}, 'signed'));
  }

  /**
   * Place a new spot TWAP order. `POST /sapi/v1/algo/spot/newOrderTwap` (SIGNED).
   * Returns the documented ack `{ clientAlgoId, success, code, msg }`.
   */
  async newOrderTwap(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    duration: number;
    clientOrderId?: string;
    limitPrice?: string;
  }): Promise<TimeWeightedAveragePriceSpotAlgoResponse> {
    return timeWeightedAveragePriceSpotAlgoResponseSchema.parse(await this.http.post('/sapi/v1/algo/spot/newOrderTwap', params, 'signed'));
  }

  /**
   * Place a new spot VP (Volume Participation) order. `POST /sapi/v1/algo/spot/newOrderVp` (SIGNED).
   * Returns the documented ack `{ clientAlgoId, success, code, msg }`.
   */
  async newOrderVp(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    participationRate: number;
    clientOrderId?: string;
    limitPrice?: string;
  }): Promise<VolumeParticipationResponse> {
    return volumeParticipationResponseSchema.parse(await this.http.post('/sapi/v1/algo/spot/newOrderVp', params, 'signed'));
  }

  /**
   * Currently open spot algo orders. `GET /sapi/v1/algo/spot/openOrders` (SIGNED).
   * Returns the documented wrapped shape `{ total, orders }`.
   */
  async openOrders(options?: { symbol?: string; page?: number; pageSize?: number }): Promise<QueryCurrentAlgoOpenOrdersSpotAlgoResponse> {
    return queryCurrentAlgoOpenOrdersSpotAlgoResponseSchema.parse(await this.http.get('/sapi/v1/algo/spot/openOrders', options ?? {}, 'signed'));
  }

  /**
   * Cancel a spot algo order. `DELETE /sapi/v1/algo/spot/order` (SIGNED).
   * Wave 8: was a raw `Record<string, unknown>`; now validated against the
   * oracle ack shape `{ algoId, success, code, msg }`.
   */
  async cancelOrder(algoId: string): Promise<CancelAlgoOrderSpotAlgoResponse> {
    return cancelAlgoOrderSpotAlgoResponseSchema.parse(await this.http.delete('/sapi/v1/algo/spot/order', { algoId }, 'signed'));
  }

  /**
   * Sub-orders of a spot algo order (per-slice execution). `GET /sapi/v1/algo/spot/subOrders` (SIGNED).
   * Returns the documented wrapped shape `{ total, executedQty, executedAmt, subOrders }`.
   */
  async subOrders(options: { algoId: string; page?: number; pageSize?: number }): Promise<QuerySubOrdersSpotAlgoResponse> {
    return querySubOrdersSpotAlgoResponseSchema.parse(await this.http.get('/sapi/v1/algo/spot/subOrders', options, 'signed'));
  }
}

/** Futures algo orders (TWAP/VP). Same surface as AlgoSpot, different paths. */
export class AlgoFutures {
  constructor(private readonly http: HttpClient) {}

  /**
   * Historical futures algo orders. `GET /sapi/v1/algo/futures/historicalOrders` (SIGNED).
   * Returns the documented wrapped shape `{ total, orders }`.
   */
  async historicalOrders(options?: { symbol?: string; side?: 'BUY' | 'SELL'; startTime?: number; endTime?: number; page?: number; pageSize?: number }): Promise<QueryHistoricalAlgoOrdersFutureAlgoResponse> {
    return queryHistoricalAlgoOrdersFutureAlgoResponseSchema.parse(await this.http.get('/sapi/v1/algo/futures/historicalOrders', options ?? {}, 'signed'));
  }

  /**
   * Place a new futures TWAP order. `POST /sapi/v1/algo/futures/newOrderTwap` (SIGNED).
   * Returns the documented ack `{ clientAlgoId, success, code, msg }`.
   */
  async newOrderTwap(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    duration: number;
    clientOrderId?: string;
    limitPrice?: string;
    positionSide?: 'BOTH' | 'LONG' | 'SHORT';
    reduceOnly?: boolean;
  }): Promise<TimeWeightedAveragePriceFutureAlgoResponse> {
    return timeWeightedAveragePriceFutureAlgoResponseSchema.parse(await this.http.post('/sapi/v1/algo/futures/newOrderTwap', params, 'signed'));
  }

  /**
   * Place a new futures VP (Volume Participation) order. `POST /sapi/v1/algo/futures/newOrderVp` (SIGNED).
   * Returns the documented ack `{ clientAlgoId, success, code, msg }`.
   */
  async newOrderVp(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: string;
    participationRate: number;
    clientOrderId?: string;
    limitPrice?: string;
    positionSide?: 'BOTH' | 'LONG' | 'SHORT';
    reduceOnly?: boolean;
  }): Promise<VolumeParticipationFutureAlgoResponse> {
    return volumeParticipationFutureAlgoResponseSchema.parse(await this.http.post('/sapi/v1/algo/futures/newOrderVp', params, 'signed'));
  }

  /**
   * Currently open futures algo orders. `GET /sapi/v1/algo/futures/openOrders` (SIGNED).
   * Returns the documented wrapped shape `{ total, orders }`.
   */
  async openOrders(options?: { symbol?: string; page?: number; pageSize?: number }): Promise<QueryCurrentAlgoOpenOrdersFutureAlgoResponse> {
    return queryCurrentAlgoOpenOrdersFutureAlgoResponseSchema.parse(await this.http.get('/sapi/v1/algo/futures/openOrders', options ?? {}, 'signed'));
  }

  /**
   * Cancel a futures algo order. `DELETE /sapi/v1/algo/futures/order` (SIGNED).
   * Wave 8: was a raw `Record<string, unknown>`; now validated against the
   * oracle ack shape `{ algoId, success, code, msg }`.
   */
  async cancelOrder(algoId: string): Promise<CancelAlgoOrderFutureAlgoResponse> {
    return cancelAlgoOrderFutureAlgoResponseSchema.parse(await this.http.delete('/sapi/v1/algo/futures/order', { algoId }, 'signed'));
  }

  /**
   * Sub-orders of a futures algo order (per-slice execution). `GET /sapi/v1/algo/futures/subOrders` (SIGNED).
   * Returns the documented wrapped shape `{ total, executedQty, executedAmt, subOrders }`.
   */
  async subOrders(options: { algoId: string; page?: number; pageSize?: number }): Promise<QuerySubOrdersFutureAlgoResponse> {
    return querySubOrdersFutureAlgoResponseSchema.parse(await this.http.get('/sapi/v1/algo/futures/subOrders', options, 'signed'));
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
