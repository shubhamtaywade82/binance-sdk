import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Options trading — order placement, modification, and cancellation
 * for vanilla options. Supports single and batch orders, countdown auto-
 * cancel, and history queries.
 */
export class OptionsTrading {
  constructor(private readonly http: HttpClient) {}

  /** Place a single options order. `POST /eapi/v1/order` (SIGNED). */
  async placeOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/order', params, 'signed');
  }

  /** Place up to 20 options orders in a single batched request. `POST /eapi/v1/batchOrders` (SIGNED). */
  async batchOrders(orders: Record<string, unknown>[]): Promise<unknown[]> {
    return this.http.post('/batchOrders', { orders: JSON.stringify(orders) }, 'signed');
  }

  /** Cancel an options order. `DELETE /eapi/v1/order` (SIGNED). */
  async cancelOrder(params: {
    symbol: string;
    orderId?: string;
    clientOrderId?: string;
  }): Promise<Record<string, unknown>> {
    return this.http.delete('/order', params, 'signed');
  }

  /** Cancel multiple options orders in one batched request. `DELETE /eapi/v1/batchOrders` (SIGNED). */
  async cancelBatchOrders(symbol: string, orderIds: string[]): Promise<unknown[]> {
    return this.http.delete(
      '/batchOrders',
      { symbol, orderIds: JSON.stringify(orderIds) },
      'signed',
    );
  }

  /** Cancel all open options orders for a symbol. `DELETE /eapi/v1/allOpenOrders` (SIGNED). */
  async cancelAllOpenOrders(symbol: string): Promise<Record<string, unknown>> {
    return this.http.delete('/allOpenOrders', { symbol }, 'signed');
  }

  /** Currently open options orders. `GET /eapi/v1/openOrders` (SIGNED). */
  async openOrders(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/openOrders', params, 'signed');
  }

  /** Historical (closed) options orders. `GET /eapi/v1/historyOrders` (SIGNED). */
  async historyOrders(options: {
    symbol: string;
    orderId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/historyOrders', options, 'signed');
  }

  /**
   * Auto-cancellation countdown — schedule all open options orders for `symbol`
   * to be cancelled after `countdownTime` (s). Set to `0` to disable.
   * `POST /eapi/v1/countdownCancelAll` (SIGNED).
   */
  async countdownCancelAll(symbol: string, countdownTime: number): Promise<Record<string, unknown>> {
    return this.http.post('/countdownCancelAll', { symbol, countdownTime }, 'signed');
  }
}
