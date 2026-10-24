import { HttpClient } from '../client/HttpClient.js';
import {
  SpotAccountInfo,
  SpotAccountSchema,
  SpotOCOOrderAck,
  SpotOCOOrderAckResponseSchema,
  SpotOCOOrdersResponseSchema,
  SpotOrder,
  SpotOrderSchema,
  SpotOrdersResponseSchema,
  SpotTrade,
  SpotTradesResponseSchema,
} from '../types/spot.types.js';

export class SpotTrading {
  constructor(private readonly http: HttpClient) {}

  async createOrder(params: Record<string, unknown>): Promise<SpotOrder> {
    return SpotOrderSchema.parse(await this.http.post('/order', params, 'signed'));
  }

  async testOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/order/test', params, 'signed');
  }

  async getOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<SpotOrder> {
    return SpotOrderSchema.parse(
      await this.http.get('/order', { symbol, ...options }, 'signed'),
    );
  }

  async cancelOrder(
    symbol: string,
    options?: { orderId?: number; origClientOrderId?: string; newClientOrderId?: string },
  ): Promise<SpotOrder> {
    return SpotOrderSchema.parse(
      await this.http.delete('/order', { symbol, ...options }, 'signed'),
    );
  }

  async cancelOpenOrders(symbol: string): Promise<SpotOrder[]> {
    return SpotOrdersResponseSchema.parse(
      await this.http.delete('/openOrders', { symbol }, 'signed'),
    );
  }

  async getOpenOrders(symbol?: string): Promise<SpotOrder[]> {
    const params = symbol ? { symbol } : {};
    return SpotOrdersResponseSchema.parse(await this.http.get('/openOrders', params, 'signed'));
  }

  async getAllOrders(
    symbol: string,
    options?: { orderId?: number; startTime?: number; endTime?: number; limit?: number },
  ): Promise<SpotOrder[]> {
    return SpotOrdersResponseSchema.parse(
      await this.http.get('/allOrders', { symbol, ...options }, 'signed'),
    );
  }

  async cancelReplaceOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/order/cancelReplace', params, 'signed');
  }

  // ---- OCO order lists ----

  async createOCOOrder(params: Record<string, unknown>): Promise<SpotOCOOrderAck> {
    return SpotOCOOrderAckResponseSchema.parse(
      await this.http.post('/orderList', params, 'signed'),
    );
  }

  async cancelOCOOrder(
    symbol: string,
    options?: { orderListId?: number; listClientOrderId?: string; newClientOrderId?: string },
  ): Promise<SpotOCOOrderAck> {
    return SpotOCOOrderAckResponseSchema.parse(
      await this.http.delete('/orderList', { symbol, ...options }, 'signed'),
    );
  }

  async getOCOOrder(
    symbol: string,
    options?: { orderListId?: number; origClientOrderId?: string },
  ): Promise<SpotOCOOrderAck> {
    return SpotOCOOrderAckResponseSchema.parse(
      await this.http.get('/orderList', { symbol, ...options }, 'signed'),
    );
  }

  /** @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); the path is `GET /api/v3/openOrderList` (`spot.queryOpenOrderLists`). Removal planned for the next major version. */
  async getOpenOCOOrders(): Promise<SpotOCOOrderAck[]> {
    return SpotOCOOrdersResponseSchema.parse(
      await this.http.get('/openOrderLists', undefined, 'signed'),
    );
  }

  /** @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); the path is `GET /api/v3/allOrderList` (`spot.queryAllOrderLists`). Removal planned for the next major version. */
  async getAllOCOOrders(
    symbol: string,
    options?: { fromId?: number; startTime?: number; endTime?: number; limit?: number },
  ): Promise<SpotOCOOrderAck[]> {
    return SpotOCOOrdersResponseSchema.parse(
      await this.http.get('/allOrderLists', { symbol, ...options }, 'signed'),
    );
  }

  /** @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); `DELETE /api/v3/openOrders` cancels open order lists too. Removal planned for the next major version. */
  async cancelOpenOCOOrders(symbol: string): Promise<SpotOCOOrderAck[]> {
    return SpotOCOOrdersResponseSchema.parse(
      await this.http.delete('/openOrderLists', { symbol }, 'signed'),
    );
  }
}

export class SpotAccount {
  constructor(private readonly http: HttpClient) {}

  async account(): Promise<SpotAccountInfo> {
    return SpotAccountSchema.parse(await this.http.get('/account', undefined, 'signed'));
  }

  async myTrades(
    symbol: string,
    options?: { orderId?: number; startTime?: number; endTime?: number; fromId?: number; limit?: number },
  ): Promise<SpotTrade[]> {
    return SpotTradesResponseSchema.parse(
      await this.http.get('/myTrades', { symbol, ...options }, 'signed'),
    );
  }

  async myPreventedMatches(
    symbol: string,
    options?: {
      preventedMatchId?: number;
      orderId?: number;
      fromPreventedMatchId?: number;
      limit?: number;
    },
  ): Promise<unknown[]> {
    return this.http.get('/myPreventedMatches', { symbol, ...options }, 'signed');
  }

  async accountCommission(symbol: string): Promise<Record<string, unknown>> {
    return this.http.get('/account/commission', { symbol }, 'signed');
  }

  async rateLimitOrder(): Promise<unknown[]> {
    return this.http.get('/rateLimit/order', undefined, 'signed');
  }
}
