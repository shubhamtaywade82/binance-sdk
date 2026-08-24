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
}
