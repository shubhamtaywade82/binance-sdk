import { HttpClient } from '../client/HttpClient.js';
import {
  OptionsBatchOrderResult,
  OptionsBatchOrdersResponseSchema,
  OptionsCountdownCancel,
  OptionsCountdownCancelSchema,
  OptionsOrder,
  OptionsOrderResponseSchema,
  OptionsOrdersResponseSchema,
} from '../types/options.types.js';

/**
 * Binance Options trading — order placement, modification, and cancellation
 * for vanilla options. Supports single and batch orders, countdown auto-
 * cancel, and history queries.
 */
export class OptionsTrading {
  constructor(private readonly http: HttpClient) {}

  /** Place a single options order. `POST /eapi/v1/order` (SIGNED). */
  async placeOrder(params: Record<string, unknown>): Promise<OptionsOrder> {
    return OptionsOrderResponseSchema.parse(await this.http.post('/eapi/v1/order', params, 'signed'));
  }

  /** Place up to 20 options orders in a single batched request. `POST /eapi/v1/batchOrders` (SIGNED). */
  async batchOrders(orders: Record<string, unknown>[]): Promise<OptionsBatchOrderResult[]> {
    return OptionsBatchOrdersResponseSchema.parse(
      await this.http.post('/eapi/v1/batchOrders', { orders: JSON.stringify(orders) }, 'signed'),
    );
  }

  /** Cancel an options order. `DELETE /eapi/v1/order` (SIGNED). */
  async cancelOrder(params: {
    symbol: string;
    orderId?: string;
    clientOrderId?: string;
  }): Promise<OptionsOrder> {
    return OptionsOrderResponseSchema.parse(await this.http.delete('/eapi/v1/order', params, 'signed'));
  }

  /** Cancel multiple options orders in one batched request. `DELETE /eapi/v1/batchOrders` (SIGNED). */
  async cancelBatchOrders(symbol: string, orderIds: string[]): Promise<OptionsBatchOrderResult[]> {
    return OptionsBatchOrdersResponseSchema.parse(
      await this.http.delete('/eapi/v1/batchOrders', { symbol, orderIds: JSON.stringify(orderIds) }, 'signed'),
    );
  }

  /** Cancel all open options orders for a symbol. `DELETE /eapi/v1/allOpenOrders` (SIGNED). */
  async cancelAllOpenOrders(symbol: string): Promise<Record<string, unknown>> {
    return this.http.delete('/eapi/v1/allOpenOrders', { symbol }, 'signed');
  }

  /** Currently open options orders. `GET /eapi/v1/openOrders` (SIGNED). */
  async openOrders(symbol?: string): Promise<OptionsOrder[]> {
    const params = symbol ? { symbol } : undefined;
    return OptionsOrdersResponseSchema.parse(await this.http.get('/eapi/v1/openOrders', params, 'signed'));
  }

  /** Historical (closed) options orders. `GET /eapi/v1/historyOrders` (SIGNED). */
  async historyOrders(options: {
    symbol: string;
    orderId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsOrder[]> {
    return OptionsOrdersResponseSchema.parse(await this.http.get('/eapi/v1/historyOrders', options, 'signed'));
  }

  /**
   * Auto-cancellation countdown — schedule all open options orders for `symbol`
   * to be cancelled after `countdownTime` (s). Set to `0` to disable.
   * `POST /eapi/v1/countdownCancelAll` (SIGNED).
   */
  async countdownCancelAll(symbol: string, countdownTime: number): Promise<OptionsCountdownCancel> {
    return OptionsCountdownCancelSchema.parse(
      await this.http.post('/eapi/v1/countdownCancelAll', { symbol, countdownTime }, 'signed'),
    );
  }
}
