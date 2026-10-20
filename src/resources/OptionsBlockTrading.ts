import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Options block trading — large-trade RFQ flow distinct from the
 * public order book. A market maker creates a quote, the counterparty
 * executes it, then both sides can query their own trades and the public
 * block-trade tape.
 */
export class OptionsBlockTrading {
  constructor(private readonly http: HttpClient) {}

  /** Create a block-order quote (market maker side). `POST /eapi/v1/block/order/create` (SIGNED). */
  async createOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/block/order/create', params, 'signed');
  }

  /** Execute (accept) a block-order quote (counterparty side). `POST /eapi/v1/block/order/execute` (SIGNED). */
  async executeOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/block/order/execute', params, 'signed');
  }

  /** Query block orders created or accepted by the caller. `GET /eapi/v1/block/order/orders` (SIGNED). */
  async orders(options: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/block/order/orders', options, 'signed');
  }

  /** Block-trade user trades for the caller. `GET /eapi/v1/block/user-trades` (SIGNED). */
  async userTrades(options: {
    symbol?: string;
    fromId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/block/user-trades', options, 'signed');
  }

  /** Public block-trade tape (recently executed block trades). `GET /eapi/v1/blockTrades` (PUBLIC). */
  async trades(options: { symbol?: string; limit?: number }): Promise<unknown[]> {
    return this.http.get('/blockTrades', options);
  }
}
