import { HttpClient } from '../client/HttpClient.js';
import { C2COrder, C2COrderResponseSchema } from '../types/extras.types.js';

/**
 * Binance C2C — peer-to-peer order history. SAPI-routed.
 */
export class C2C {
  constructor(private readonly http: HttpClient) {}

  /** C2C order-match history for the authenticated user. `GET /sapi/v1/c2c/orderMatch/listUserOrderHistory` (SIGNED). */
  async orderMatchListUserOrderHistory(options: {
    tradeType: 'BUY' | 'SELL';
    startTimestamp?: number;
    endTimestamp?: number;
    page?: number;
    rows?: number;
  }): Promise<C2COrder[]> {
    return C2COrderResponseSchema.parse(await this.http.get('/sapi/v1/c2c/orderMatch/listUserOrderHistory', options, 'signed'));
  }
}
