import { HttpClient } from '../client/HttpClient.js';
import {
  ConvertAcceptQuote,
  ConvertAcceptQuoteSchema,
  ConvertAssetInfo,
  ConvertAssetInfoSchema,
  ConvertExchangeInfoResponseSchema,
  ConvertLimitOrder,
  ConvertLimitOrderResponseSchema,
  ConvertLimitOrderSchema,
  ConvertOrderStatus,
  ConvertOrderStatusSchema,
  ConvertPair,
  ConvertQuote,
  ConvertQuoteSchema,
  ConvertTradeFlow,
  ConvertTradeFlowResponseSchema,
} from '../types/extras.types.js';

/**
 * Binance Convert (SAPI) — request for quote, accept quote, place limit
 * convert orders, and query trade flow. Distinct from the Futures-hosted
 * convert endpoints (`/fapi/v1/convert/*`): these are SAPI-routed.
 */
export class Convert {
  constructor(private readonly http: HttpClient) {}

  /** Request a quote for a conversion. `POST /sapi/v1/convert/getQuote` (SIGNED). */
  async getQuote(params: {
    fromAsset: string;
    toAsset: string;
    fromAmount?: string;
    toAmount?: string;
    walletType?: 'SPOT' | 'FUNDING';
    validTime?: '10s' | '30s' | '1m' | '2m';
  }): Promise<ConvertQuote> {
    return ConvertQuoteSchema.parse(await this.http.post('/sapi/v1/convert/getQuote', params, 'signed'));
  }

  /** Accept a quote returned by `getQuote`. `POST /sapi/v1/convert/acceptQuote` (SIGNED). */
  async acceptQuote(quoteId: string): Promise<ConvertAcceptQuote> {
    return ConvertAcceptQuoteSchema.parse(await this.http.post('/sapi/v1/convert/acceptQuote', { quoteId }, 'signed'));
  }

  /** Order status. `GET /sapi/v1/convert/orderStatus` (SIGNED). */
  async orderStatus(options: { orderId?: string; quoteId?: string }): Promise<ConvertOrderStatus> {
    return ConvertOrderStatusSchema.parse(await this.http.get('/sapi/v1/convert/orderStatus', options, 'signed'));
  }

  /** Trade flow history. `GET /sapi/v1/convert/tradeFlow` (SIGNED). */
  async tradeFlow(options?: { startTime?: number; endTime?: number; limit?: number }): Promise<ConvertTradeFlow[]> {
    return ConvertTradeFlowResponseSchema.parse(await this.http.get('/sapi/v1/convert/tradeFlow', options ?? {}, 'signed'));
  }

  /** Convert asset info (limits & precision). `GET /sapi/v1/convert/assetInfo` (SIGNED). */
  async assetInfo(options?: { fromAsset?: string; toAsset?: string }): Promise<ConvertAssetInfo> {
    return ConvertAssetInfoSchema.parse(await this.http.get('/sapi/v1/convert/assetInfo', options ?? {}, 'signed'));
  }

  /** Convert exchange info (pairs & availability). `GET /sapi/v1/convert/exchangeInfo` (SIGNED). */
  async exchangeInfo(options?: { fromAsset?: string; toAsset?: string }): Promise<ConvertPair[]> {
    return ConvertExchangeInfoResponseSchema.parse(await this.http.get('/sapi/v1/convert/exchangeInfo', options ?? {}, 'signed'));
  }

  /** Place a limit convert order. `POST /sapi/v1/convert/limit/placeOrder` (SIGNED). */
  async limitPlaceOrder(params: {
    baseAsset: string;
    quoteAsset: string;
    limitPrice: string;
    baseAmount?: string;
    quoteAmount?: string;
    side: 'BUY' | 'SELL';
    walletType?: 'SPOT' | 'FUNDING';
    expiredType?: '1_D' | '3_D' | '7_D' | '30_D';
  }): Promise<ConvertLimitOrder> {
    return ConvertLimitOrderSchema.parse(
      await this.http.post('/sapi/v1/convert/limit/placeOrder', params, 'signed'),
    );
  }

  /** Cancel a limit convert order. `POST /sapi/v1/convert/limit/cancelOrder` (SIGNED). */
  async limitCancelOrder(orderId: string): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/convert/limit/cancelOrder', { orderId }, 'signed');
  }

  /** Query open limit convert orders. `GET /sapi/v1/convert/limit/queryOpenOrders` (SIGNED). */
  async limitQueryOpenOrders(options?: { baseAsset?: string; quoteAsset?: string; current?: number; size?: number }): Promise<ConvertLimitOrder[]> {
    return ConvertLimitOrderResponseSchema.parse(await this.http.get('/sapi/v1/convert/limit/queryOpenOrders', options ?? {}, 'signed'));
  }
}
