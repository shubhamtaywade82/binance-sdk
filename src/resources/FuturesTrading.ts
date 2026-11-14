import { HttpClient } from '../client/HttpClient.js';
import { BatchOrdersPartialError } from '../errors/BatchOrdersPartialError.js';
import { PositionModeGuard, type PositionSide } from '../preflight/positionMode.js';
import { executeBatchOrders, toBatchElementResults, type BatchElementResult } from '../preflight/batch.js';
import { resolveGoodTillDate } from '../preflight/goodTillDate.js';
import { routeFuturesOrderType } from '../preflight/orderRouting.js';
import { validateTrailingCallbackRate } from '../preflight/callbackRate.js';
import {
  AlgoOrder,
  AlgoOrderResponseSchema,
  AlgoOrdersResponseSchema,
  BatchOrdersItem,
  BatchOrdersItemSchema,
  BatchOrdersResponseSchema,
  PositionModeResponseSchema,
  CountdownCancelAll,
  CountdownCancelAllSchema,
  CreateOrderParams,
  LeverageChange,
  LeverageChangeSchema,
  MarginTypeChange,
  MarginTypeChangeSchema,
  ModifyOrderParams,
  NewOrderAck,
  NewOrderAckSchema,
  Order,
  OrderModifyHistoryEntry,
  OrderModifyHistorySchema,
  OrderResponseSchema,
  OrdersResponseSchema,
  CancelOrderResult,
  CancelOrderResultSchema,
  PositionMarginChange,
  PositionMarginChangeSchema,
} from '../types/trading.types.js';

export class FuturesTrading {
  private positionMode: PositionModeGuard | undefined;

  constructor(private readonly http: HttpClient) {}

  async setLeverage(symbol: string, leverage: number): Promise<LeverageChange> {
    return LeverageChangeSchema.parse(
      await this.http.post('/fapi/v1/leverage', { symbol, leverage }, 'signed'),
    );
  }

  /**
   * Place an order. The response schema depends on `newOrderRespType`:
   * `ACK` (the default for non-MARKET/LIMIT types) yields {@link NewOrderAck};
   * `RESULT` yields the full {@link Order} shape. Parsing follows the
   * requested mode so RESULT responses are not silently truncated into the
   * ACK schema. A default-mode MARKET/LIMIT order returns the RESULT shape,
   * which also satisfies the (looser) ACK schema.
   */
  async createOrder(params: CreateOrderParams): Promise<NewOrderAck | Order> {
    const prepared = this.prepare(params);
    const raw = await this.http.post('/fapi/v1/order', prepared, 'signed');
    if (prepared.newOrderRespType === 'RESULT') {
      return OrderResponseSchema.parse(raw);
    }
    return NewOrderAckSchema.parse(raw);
  }

  async createTestOrder(params: CreateOrderParams): Promise<Record<string, unknown>> {
    return this.http.post('/fapi/v1/order/test', params, 'signed');
  }

  async getOrder(
    symbol: string,
    options?: { orderId?: number; origClientOrderId?: string },
  ): Promise<Order> {
    return OrderResponseSchema.parse(
      await this.http.get('/fapi/v1/order', { symbol, ...options }, 'signed'),
    );
  }

  /**
   * Cancel an order. The cancel response has its own contract (v3.5.1): it
   * carries `cumQty` and omits `avgPrice`/`origQty`/`reduceOnly`, so it is
   * parsed with the dedicated {@link CancelOrderResultSchema} rather than the
   * full query-order schema, which rejects real cancel payloads.
   */
  async cancelOrder(
    symbol: string,
    options?: { orderId?: number; origClientOrderId?: string },
  ): Promise<CancelOrderResult> {
    return CancelOrderResultSchema.parse(
      await this.http.delete('/fapi/v1/order', { symbol, ...options }, 'signed'),
    );
  }

  async getCurrentOrder(
    symbol: string,
    options?: { orderId?: number; origClientOrderId?: string },
  ): Promise<Order> {
    return OrderResponseSchema.parse(
      await this.http.get('/fapi/v1/openOrder', { symbol, ...options }, 'signed'),
    );
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    const params = symbol ? { symbol } : {};
    return OrdersResponseSchema.parse(await this.http.get('/fapi/v1/openOrders', params, 'signed'));
  }

  /** `symbol` is optional per the vendored Postman spec; omit it for an account-wide query. */
  async getAllOrders(
    symbol?: string,
    options?: { orderId?: number; startTime?: number; endTime?: number; limit?: number },
  ): Promise<Order[]> {
    return OrdersResponseSchema.parse(
      await this.http.get('/fapi/v1/allOrders', { symbol, ...options }, 'signed'),
    );
  }

  async cancelAllOpenOrders(symbol: string): Promise<Record<string, unknown>> {
    return this.http.delete('/fapi/v1/allOpenOrders', { symbol }, 'signed');
  }

  async modifyOrder(params: ModifyOrderParams): Promise<Order> {
    return OrderResponseSchema.parse(await this.http.put('/fapi/v1/order', params, 'signed'));
  }

  async createAlgoOrder(params: Record<string, unknown>): Promise<AlgoOrder> {
    return AlgoOrderResponseSchema.parse(await this.http.post('/fapi/v1/algoOrder', params, 'signed'));
  }

  async cancelAlgoOrder(
    symbol: string,
    options?: { algoId?: number; clientAlgoId?: string },
  ): Promise<Record<string, unknown>> {
    return this.http.delete('/fapi/v1/algoOrder', { symbol, ...options }, 'signed');
  }

  async cancelAllOpenAlgoOrders(symbol: string): Promise<Record<string, unknown>> {
    return this.http.delete('/fapi/v1/algoOpenOrders', { symbol }, 'signed');
  }

  async getAlgoOrder(
    symbol: string,
    options?: { algoId?: number; clientAlgoId?: string },
  ): Promise<AlgoOrder> {
    return AlgoOrderResponseSchema.parse(
      await this.http.get('/fapi/v1/algoOrder', { symbol, ...options }, 'signed'),
    );
  }

  async getOpenAlgoOrders(symbol?: string): Promise<AlgoOrder[]> {
    const params = symbol ? { symbol } : {};
    return AlgoOrdersResponseSchema.parse(await this.http.get('/fapi/v1/openAlgoOrders', params, 'signed'));
  }

  async getAllAlgoOrders(
    symbol: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<AlgoOrder[]> {
    return AlgoOrdersResponseSchema.parse(
      await this.http.get('/fapi/v1/allAlgoOrders', { symbol, ...options }, 'signed'),
    );
  }

  /**
   * Place orders, auto-chunked to the 5-order exchange limit and sent one chunk at a
   * time. Returns one result per input, in input order. A rejected or unknown-outcome
   * order does not stop the remaining chunks.
   */
  async placeBatchOrders(batchOrders: CreateOrderParams[]): Promise<BatchElementResult<BatchOrdersItem>[]> {
    const prepared = batchOrders.map((order) => this.prepare(order));
    const outcomes = await executeBatchOrders<CreateOrderParams, unknown>(prepared, async (chunk) => {
      const reply = await this.http.post('/fapi/v1/batchOrders', { batchOrders: JSON.stringify(chunk) }, 'signed');
      if (!Array.isArray(reply)) throw new Error('batchOrders reply is not an array');
      return reply;
    });
    return toBatchElementResults(outcomes, (raw) => {
      const parsed = BatchOrdersItemSchema.safeParse(raw);
      return parsed.success ? parsed.data : (raw as BatchOrdersItem);
    });
  }

  /**
   * Legacy batch placement. Returns the accepted orders only when every element was
   * accepted. Otherwise it throws {@link BatchOrdersPartialError}, which carries the
   * per-element results. Accepted orders are still placed. Use placeBatchOrders for
   * per-element handling without an exception.
   */
  async createBatchOrders(batchOrders: CreateOrderParams[]): Promise<BatchOrdersItem[]> {
    const results = await this.placeBatchOrders(batchOrders);
    if (results.some((r) => !r.success)) throw new BatchOrdersPartialError(results);
    return results.flatMap((r) => (r.success ? [r.data] : []));
  }

  /**
   * Attach a position-mode guard. Once attached, every order that carries positionSide
   * is checked against the cached mode, and the check fails closed when the mode is
   * unknown or stale. Call {@link syncPositionMode} to refresh it.
   */
  setPositionModeGuard(guard: PositionModeGuard): void {
    this.positionMode = guard;
  }

  /** Read the account's position mode and cache it in the guard. Returns dualSidePosition. */
  async syncPositionMode(): Promise<boolean> {
    const { dualSidePosition } = PositionModeResponseSchema.parse(
      await this.http.get('/fapi/v1/positionSide/dual', {}, 'signed'),
    );
    this.positionMode?.setDualSidePosition(dualSidePosition);
    return dualSidePosition;
  }

  /**
   * Local checks applied to every order before it is sent. They make no extra request,
   * except the position-mode guard's cached read:
   * - goodTillDate: set only for GTD (required, > now + 600 s, second precision).
   *   Other time-in-force values drop it.
   * - callbackRate: bounded per endpoint. The algo route allows 0.1–20 and the order
   *   route allows 0.1–10.
   * - positionSide: validated against the cached mode when a guard is attached.
   */
  private prepare(params: CreateOrderParams): CreateOrderParams {
    const prepared: CreateOrderParams = { ...params };

    const goodTillDate = resolveGoodTillDate({
      timeInForce: params.timeInForce ?? '',
      goodTillDate: params.goodTillDate,
      nowMs: Date.now(),
    });
    if (goodTillDate === undefined) delete prepared.goodTillDate;
    else prepared.goodTillDate = goodTillDate;

    if (params.callbackRate !== undefined) {
      prepared.callbackRate = validateTrailingCallbackRate(params.callbackRate, routeFuturesOrderType(params.type));
    }

    if (this.positionMode && params.positionSide !== undefined) {
      prepared.positionSide = this.positionMode.resolvePositionSide(params.positionSide as PositionSide);
    }
    return prepared;
  }

  async modifyBatchOrders(batchOrders: ModifyOrderParams[]): Promise<BatchOrdersItem[]> {
    return BatchOrdersResponseSchema.parse(
      await this.http.put('/fapi/v1/batchOrders', { batchOrders: JSON.stringify(batchOrders) }, 'signed'),
    );
  }

  async cancelBatchOrders(
    symbol: string,
    options?: { orderIdList?: number[]; origClientOrderIdList?: string[] },
  ): Promise<BatchOrdersItem[]> {
    const params: Record<string, unknown> = { symbol };
    if (options?.orderIdList?.length) params.orderIdList = JSON.stringify(options.orderIdList);
    if (options?.origClientOrderIdList?.length) {
      params.origClientOrderIdList = JSON.stringify(options.origClientOrderIdList);
    }
    return BatchOrdersResponseSchema.parse(await this.http.delete('/fapi/v1/batchOrders', params, 'signed'));
  }

  async getOrderModifyHistory(
    symbol: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<OrderModifyHistoryEntry[]> {
    return OrderModifyHistorySchema.parse(
      await this.http.get('/fapi/v1/orderAmendment', { symbol, ...options }, 'signed'),
    );
  }

  async setMarginType(symbol: string, marginType: 'isolated' | 'cross'): Promise<MarginTypeChange> {
    return MarginTypeChangeSchema.parse(
      await this.http.post('/fapi/v1/marginType', { symbol, marginType }, 'signed'),
    );
  }

  async modifyPositionMargin(symbol: string, amount: number, type: number): Promise<PositionMarginChange> {
    return PositionMarginChangeSchema.parse(
      await this.http.post('/fapi/v1/positionMargin', { symbol, amount, type }, 'signed'),
    );
  }

  async setCountdownCancelAll(symbol: string, countdownTime: number): Promise<CountdownCancelAll> {
    return CountdownCancelAllSchema.parse(
      await this.http.post('/fapi/v1/countdownCancelAll', { symbol, countdownTime }, 'signed'),
    );
  }

  async convertExchangeInfo(options?: { fromAsset?: string; toAsset?: string }): Promise<unknown[]> {
    return this.http.get('/fapi/v1/convert/exchangeInfo', options);
  }

  async convertGetQuote(params: {
    fromAsset: string;
    toAsset: string;
    fromAmount?: number;
    toAmount?: number;
    validTime?: '10s' | '30s' | '1m' | '2m';
  }): Promise<Record<string, unknown>> {
    return this.http.post('/fapi/v1/convert/getQuote', params, 'signed');
  }

  async convertAcceptQuote(quoteId: string): Promise<Record<string, unknown>> {
    return this.http.post('/fapi/v1/convert/acceptQuote', { quoteId }, 'signed');
  }

  async convertOrderStatus(options: { orderId?: string; quoteId?: string }): Promise<Record<string, unknown>> {
    return this.http.get('/fapi/v1/convert/orderStatus', options, 'signed');
  }

  /**
   * Futures TradFi Perps Contract — places a stock-style contract order on the
   * USDⓈ-M Futures host. Introduced by Binance for TradFi perps exposure.
   * Endpoint: `POST /fapi/v1/stock/contract` (SIGNED).
   *
   * Returns the raw Binance response envelope; callers requiring strict typing
   * can wrap the result with their own Zod schema. Kept permissive deliberately
   * because Binance has not yet published a stable response shape for this
   * endpoint across all environments.
   */
  async stockContract(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/fapi/v1/stock/contract', params, 'signed');
  }
}
