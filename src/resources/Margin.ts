import { HttpClient } from '../client/HttpClient.js';
import {
  BorrowRepayParams,
  BorrowRepayRecordResponse,
  BorrowRepayRecordResponseSchema,
  BorrowRepayResult,
  BorrowRepayResultSchema,
  CrossMarginAccount,
  CrossMarginAccountSchema,
  IsolatedMarginAccount,
  IsolatedMarginAccountSchema,
  IsolatedTransferParams,
  MarginCreateOrderParams,
  MarginForceLiquidationResponse,
  MarginForceLiquidationResponseSchema,
  MarginInterestHistoryResponse,
  MarginInterestHistoryResponseSchema,
  MarginOrder,
  MarginOrderResponseSchema,
  MarginOrdersResponseSchema,
  MarginPriceIndex,
  MarginPriceIndexSchema,
  MarginTradesResponseSchema,
  MarginTrade,
  MarginTransferResult,
  MarginTransferResultSchema,
  MaxBorrowable,
  MaxBorrowableSchema,
  MaxTransferable,
  MaxTransferableSchema,
} from '../types/margin.types.js';

export class MarginAccount {
  constructor(private readonly http: HttpClient) {}

  async crossAccount(): Promise<CrossMarginAccount> {
    return CrossMarginAccountSchema.parse(await this.http.get('/sapi/v1/margin/account', undefined, 'signed'));
  }

  async isolatedAccount(symbols?: string[]): Promise<IsolatedMarginAccount> {
    const params = symbols?.length ? { symbols: symbols.join(',') } : undefined;
    return IsolatedMarginAccountSchema.parse(
      await this.http.get('/sapi/v1/margin/isolated/account', params, 'signed'),
    );
  }

  async maxBorrowable(asset: string, isolatedSymbol?: string): Promise<MaxBorrowable> {
    return MaxBorrowableSchema.parse(
      await this.http.get('/sapi/v1/margin/maxBorrowable', { asset, isolatedSymbol }, 'signed'),
    );
  }

  async maxTransferable(asset: string, isolatedSymbol?: string): Promise<MaxTransferable> {
    return MaxTransferableSchema.parse(
      await this.http.get('/sapi/v1/margin/maxTransferable', { asset, isolatedSymbol }, 'signed'),
    );
  }

  async borrowRepay(params: BorrowRepayParams): Promise<BorrowRepayResult> {
    return BorrowRepayResultSchema.parse(
      await this.http.post('/sapi/v1/margin/borrow-repay', params, 'signed'),
    );
  }

  async borrow(asset: string, amount: number, options?: { isIsolated?: boolean; symbol?: string }): Promise<BorrowRepayResult> {
    return this.borrowRepay({
      asset,
      amount,
      type: 'BORROW',
      isIsolated: options?.isIsolated ? 'TRUE' : undefined,
      symbol: options?.symbol,
    });
  }

  async repay(asset: string, amount: number, options?: { isIsolated?: boolean; symbol?: string }): Promise<BorrowRepayResult> {
    return this.borrowRepay({
      asset,
      amount,
      type: 'REPAY',
      isIsolated: options?.isIsolated ? 'TRUE' : undefined,
      symbol: options?.symbol,
    });
  }

  async borrowRepayRecord(
    type: 'BORROW' | 'REPAY',
    options?: { asset?: string; isolatedSymbol?: string; startTime?: number; endTime?: number; current?: number; size?: number },
  ): Promise<BorrowRepayRecordResponse> {
    return BorrowRepayRecordResponseSchema.parse(
      await this.http.get('/sapi/v1/margin/borrow-repay', { type, ...options }, 'signed'),
    );
  }

  async transfer(asset: string, amount: number, type: 1 | 2): Promise<MarginTransferResult> {
    return MarginTransferResultSchema.parse(
      await this.http.post('/sapi/v1/margin/transfer', { asset, amount, type }, 'signed'),
    );
  }

  async isolatedTransfer(params: IsolatedTransferParams): Promise<MarginTransferResult> {
    return MarginTransferResultSchema.parse(
      await this.http.post('/sapi/v1/margin/isolated/transfer', params, 'signed'),
    );
  }

  async interestHistory(options?: {
    asset?: string;
    isolatedSymbol?: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    size?: number;
  }): Promise<MarginInterestHistoryResponse> {
    return MarginInterestHistoryResponseSchema.parse(
      await this.http.get('/sapi/v1/margin/interestHistory', options, 'signed'),
    );
  }

  async forceLiquidationRecord(options?: {
    startTime?: number;
    endTime?: number;
    isolatedSymbol?: string;
    current?: number;
    size?: number;
  }): Promise<MarginForceLiquidationResponse> {
    return MarginForceLiquidationResponseSchema.parse(
      await this.http.get('/sapi/v1/margin/forceLiquidationRec', options, 'signed'),
    );
  }

  async priceIndex(symbol: string): Promise<MarginPriceIndex> {
    return MarginPriceIndexSchema.parse(await this.http.get('/sapi/v1/margin/priceIndex', { symbol }));
  }
}

export class MarginTrading {
  constructor(private readonly http: HttpClient) {}

  async createOrder(params: MarginCreateOrderParams): Promise<MarginOrder> {
    return MarginOrderResponseSchema.parse(await this.http.post('/sapi/v1/margin/order', params, 'signed'));
  }

  async cancelOrder(
    symbol: string,
    options?: { isIsolated?: 'TRUE' | 'FALSE'; orderId?: number; origClientOrderId?: string; newClientOrderId?: string },
  ): Promise<MarginOrder> {
    return MarginOrderResponseSchema.parse(
      await this.http.delete('/sapi/v1/margin/order', { symbol, ...options }, 'signed'),
    );
  }

  async cancelAllOpenOrders(symbol: string, isIsolated?: 'TRUE' | 'FALSE'): Promise<MarginOrder[]> {
    return MarginOrdersResponseSchema.parse(
      await this.http.delete('/sapi/v1/margin/openOrders', { symbol, isIsolated }, 'signed'),
    );
  }

  async getOrder(
    symbol: string,
    options?: { isIsolated?: 'TRUE' | 'FALSE'; orderId?: number; origClientOrderId?: string },
  ): Promise<MarginOrder> {
    return MarginOrderResponseSchema.parse(
      await this.http.get('/sapi/v1/margin/order', { symbol, ...options }, 'signed'),
    );
  }

  async getOpenOrders(options?: { symbol?: string; isIsolated?: 'TRUE' | 'FALSE' }): Promise<MarginOrder[]> {
    return MarginOrdersResponseSchema.parse(await this.http.get('/sapi/v1/margin/openOrders', options, 'signed'));
  }

  async getAllOrders(
    symbol: string,
    options?: { isIsolated?: 'TRUE' | 'FALSE'; orderId?: number; startTime?: number; endTime?: number; limit?: number },
  ): Promise<MarginOrder[]> {
    return MarginOrdersResponseSchema.parse(
      await this.http.get('/sapi/v1/margin/allOrders', { symbol, ...options }, 'signed'),
    );
  }

  async myTrades(
    symbol: string,
    options?: { isIsolated?: 'TRUE' | 'FALSE'; orderId?: number; startTime?: number; endTime?: number; fromId?: number; limit?: number },
  ): Promise<MarginTrade[]> {
    return MarginTradesResponseSchema.parse(
      await this.http.get('/sapi/v1/margin/myTrades', { symbol, ...options }, 'signed'),
    );
  }
}
