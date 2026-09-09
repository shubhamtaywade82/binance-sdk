import { HttpClient } from '../client/HttpClient.js';
import {
  AlgoOrder,
  AlgoOrderResponseSchema,
  AlgoOrdersResponseSchema,
  BatchOrdersItem,
  BatchOrdersResponseSchema,
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
  PositionMarginChange,
  PositionMarginChangeSchema,
} from '../types/trading.types.js';

export class FuturesTrading {
  constructor(private readonly http: HttpClient) {}

  async setLeverage(symbol: string, leverage: number): Promise<LeverageChange> {
    return LeverageChangeSchema.parse(
      await this.http.post('/fapi/v1/leverage', { symbol, leverage }, 'signed'),
    );
  }

  /**
   * Place an order. The response schema depends on `newOrderRespType`:
   * `ACK` (the default) yields {@link NewOrderAck}; `RESULT` yields the full
   * {@link Order} shape. Parsing follows the requested mode so RESULT
   * responses are not silently truncated into the ACK schema.
   */
  async createOrder(params: CreateOrderParams): Promise<NewOrderAck | Order> {
    const raw = await this.http.post('/fapi/v1/order', params, 'signed');
    if (params.newOrderRespType === 'RESULT') {
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

  async cancelOrder(
    symbol: string,
    options?: { orderId?: number; origClientOrderId?: string },
  ): Promise<Order> {
    return OrderResponseSchema.parse(
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

  async getAllOrders(
    symbol: string,
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

  async createBatchOrders(batchOrders: CreateOrderParams[]): Promise<BatchOrdersItem[]> {
    return BatchOrdersResponseSchema.parse(
      await this.http.post('/fapi/v1/batchOrders', { batchOrders: JSON.stringify(batchOrders) }, 'signed'),
    );
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
}
