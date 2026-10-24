import { HttpClient } from '../client/HttpClient.js';
import {
  CoinMCreateOrderParams,
  CoinMLeverageChange,
  CoinMLeverageChangeSchema,
  CoinMMarginTypeChange,
  CoinMMarginTypeChangeSchema,
  CoinMOrder,
  CoinMOrderResponseSchema,
  CoinMOrdersResponseSchema,
  CoinMPositionMarginChange,
  CoinMPositionMarginChangeSchema,
} from '../types/coinm.types.js';

export class CoinMTrading {
  constructor(private readonly http: HttpClient) {}

  async setLeverage(symbol: string, leverage: number): Promise<CoinMLeverageChange> {
    return CoinMLeverageChangeSchema.parse(
      await this.http.post('/dapi/v1/leverage', { symbol, leverage }, 'signed'),
    );
  }

  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<CoinMMarginTypeChange> {
    return CoinMMarginTypeChangeSchema.parse(
      await this.http.post('/dapi/v1/marginType', { symbol, marginType }, 'signed'),
    );
  }

  async createOrder(params: CoinMCreateOrderParams): Promise<CoinMOrder> {
    return CoinMOrderResponseSchema.parse(await this.http.post('/dapi/v1/order', params, 'signed'));
  }

  /** @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); COIN-M has no test-order endpoint. Removal planned for the next major version. */
  async createTestOrder(params: CoinMCreateOrderParams): Promise<Record<string, unknown>> {
    return this.http.post('/dapi/v1/order/test', params, 'signed');
  }

  async getOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<CoinMOrder> {
    return CoinMOrderResponseSchema.parse(
      await this.http.get('/dapi/v1/order', { symbol, ...options }, 'signed'),
    );
  }

  async cancelOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<CoinMOrder> {
    return CoinMOrderResponseSchema.parse(
      await this.http.delete('/dapi/v1/order', { symbol, ...options }, 'signed'),
    );
  }

  async cancelAllOpenOrders(symbol: string): Promise<Record<string, unknown>> {
    return this.http.delete('/dapi/v1/allOpenOrders', { symbol }, 'signed');
  }

  async getOpenOrders(symbol?: string): Promise<CoinMOrder[]> {
    const params = symbol ? { symbol } : undefined;
    return CoinMOrdersResponseSchema.parse(await this.http.get('/dapi/v1/openOrders', params, 'signed'));
  }

  async getAllOrders(
    symbol: string,
    options?: { orderId?: number; startTime?: number; endTime?: number; limit?: number },
  ): Promise<CoinMOrder[]> {
    return CoinMOrdersResponseSchema.parse(
      await this.http.get('/dapi/v1/allOrders', { symbol, ...options }, 'signed'),
    );
  }

  async modifyPositionMargin(symbol: string, amount: number, type: number): Promise<CoinMPositionMarginChange> {
    return CoinMPositionMarginChangeSchema.parse(
      await this.http.post('/dapi/v1/positionMargin', { symbol, amount, type }, 'signed'),
    );
  }

  // ---------------------------------------------------------------------------
  // Trading endpoints (added to close the COIN-M gap)
  // ---------------------------------------------------------------------------

  /**
   * Modify an existing COIN-M order (price/quantity). Endpoint: `PUT /dapi/v1/order` (SIGNED).
   */
  async modifyOrder(params: Record<string, unknown>): Promise<unknown> {
    return this.http.put('/dapi/v1/order', params, 'signed');
  }

  /**
   * Query a single currently-active order by `orderId` or
   * `origClientOrderId`. Distinct from `getOpenOrders` (which lists all open
   * orders for a symbol). Endpoint: `GET /dapi/v1/openOrder` (SIGNED).
   */
  async getCurrentOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<unknown> {
    return this.http.get('/dapi/v1/openOrder', { symbol, ...options }, 'signed');
  }

  /**
   * COIN-M order amendment history (modifications logged over time).
   * Endpoint: `GET /dapi/v1/orderAmendment` (SIGNED).
   */
  async getOrderAmendHistory(options: {
    symbol: string;
    orderId?: number;
    origClientOrderId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/dapi/v1/orderAmendment', options, 'signed');
  }

  /**
   * Place up to 5 COIN-M orders in a single batched request.
   * Endpoint: `POST /dapi/v1/batchOrders` (SIGNED).
   */
  async createBatchOrders(batchOrders: CoinMCreateOrderParams[]): Promise<unknown[]> {
    return this.http.post(
      '/dapi/v1/batchOrders',
      { batchOrders: JSON.stringify(batchOrders) },
      'signed',
    );
  }

  /**
   * Modify up to 5 COIN-M orders in a single batched request.
   * Endpoint: `PUT /dapi/v1/batchOrders` (SIGNED).
   */
  async modifyBatchOrders(batchOrders: Record<string, unknown>[]): Promise<unknown[]> {
    return this.http.put(
      '/dapi/v1/batchOrders',
      { batchOrders: JSON.stringify(batchOrders) },
      'signed',
    );
  }

  /**
   * Cancel up to 5 COIN-M orders in a single batched request.
   * Endpoint: `DELETE /dapi/v1/batchOrders` (SIGNED).
   */
  async cancelBatchOrders(
    symbol: string,
    options?: { orderIdList?: number[]; origClientOrderIdList?: string[] },
  ): Promise<unknown[]> {
    const params: Record<string, unknown> = { symbol };
    if (options?.orderIdList?.length) params.orderIdList = JSON.stringify(options.orderIdList);
    if (options?.origClientOrderIdList?.length) {
      params.origClientOrderIdList = JSON.stringify(options.origClientOrderIdList);
    }
    return this.http.delete('/dapi/v1/batchOrders', params, 'signed');
  }

  /**
   * Auto-cancellation countdown — schedule all open orders for `symbol` to be
   * cancelled after `countdownTime` (ms). Set to `0` to disable.
   * Endpoint: `POST /dapi/v1/countdownCancelAll` (SIGNED).
   */
  async setCountdownCancelAll(symbol: string, countdownTime: number): Promise<unknown> {
    return this.http.post('/dapi/v1/countdownCancelAll', { symbol, countdownTime }, 'signed');
  }

  /**
   * COIN-M ADL quantile estimation. Endpoint: `GET /dapi/v1/adlQuantile` (SIGNED).
   */
  async adlQuantile(symbol?: string): Promise<unknown> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/dapi/v1/adlQuantile', params, 'signed');
  }
}
