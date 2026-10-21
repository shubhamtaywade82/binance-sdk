import { HttpClient } from '../client/HttpClient.js';
import {
  OptionsBlockOrder,
  OptionsBlockOrdersResponseSchema,
  OptionsBlockTrade,
  OptionsBlockTradesResponseSchema,
} from '../types/options.types.js';

/**
 * Binance Options block trading — large-trade RFQ flow distinct from the
 * public order book. A market maker creates a quote, the counterparty
 * executes it, then both sides can query their own trades and the public
 * block-trade tape.
 */
export class OptionsBlockTrading {
  constructor(private readonly http: HttpClient) {}

  /** Create a block-order quote (market maker side). `POST /eapi/v1/block/order/create` (SIGNED). */
  async createOrder(params: Record<string, unknown>): Promise<OptionsBlockOrder> {
    const data = await this.http.post('/eapi/v1/block/order/create', params, 'signed');
    return OptionsBlockOrdersResponseSchema.parse([data])[0] as OptionsBlockOrder;
  }

  /** Execute (accept) a block-order quote (counterparty side). `POST /eapi/v1/block/order/execute` (SIGNED). */
  async executeOrder(params: Record<string, unknown>): Promise<OptionsBlockOrder> {
    const data = await this.http.post('/eapi/v1/block/order/execute', params, 'signed');
    return OptionsBlockOrdersResponseSchema.parse([data])[0] as OptionsBlockOrder;
  }

  /** Query block orders created or accepted by the caller. `GET /eapi/v1/block/order/orders` (SIGNED). */
  async orders(options: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsBlockOrder[]> {
    return OptionsBlockOrdersResponseSchema.parse(await this.http.get('/eapi/v1/block/order/orders', options, 'signed'));
  }

  /** Block-trade user trades for the caller. `GET /eapi/v1/block/user-trades` (SIGNED). */
  async userTrades(options: {
    symbol?: string;
    fromId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsBlockTrade[]> {
    return OptionsBlockTradesResponseSchema.parse(await this.http.get('/eapi/v1/block/user-trades', options, 'signed'));
  }

  /** Public block-trade tape (recently executed block trades). `GET /eapi/v1/blockTrades` (PUBLIC). */
  async trades(options: { symbol?: string; limit?: number }): Promise<OptionsBlockTrade[]> {
    return OptionsBlockTradesResponseSchema.parse(await this.http.get('/eapi/v1/blockTrades', options));
  }
}
