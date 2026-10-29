import { z } from 'zod';
import { HttpClient } from '../client/HttpClient.js';
import {
  acceptQuoteResponseSchema,
  cancelLimitOrderResponseSchema,
  type CancelLimitOrderResponse,
  getConvertTradeHistoryResponseListInnerSchema,
  getConvertTradeHistoryResponseSchema,
  listAllConvertPairsResponseSchema,
  orderStatusResponseSchema,
  placeLimitOrderResponseSchema,
  queryLimitOpenOrdersResponseListInnerSchema,
  queryLimitOpenOrdersResponseSchema,
  queryOrderQuantityPrecisionPerAssetResponseSchema,
  sendQuoteRequestResponseSchema,
  type AcceptQuoteResponse,
  type GetConvertTradeHistoryResponseListInner,
  type ListAllConvertPairsResponse,
  type OrderStatusResponse,
  type PlaceLimitOrderResponse,
  type QueryLimitOpenOrdersResponseListInner,
  type QueryOrderQuantityPrecisionPerAssetResponse,
  type SendQuoteRequestResponse,
} from '../types/convert.wave8.types.js';
import { ConvertAssetInfoSchema, type ConvertAssetInfo } from '../types/extras.types.js';

/**
 * Binance Convert (SAPI) — request for quote, accept quote, place limit
 * convert orders, and query trade flow. Distinct from the Futures-hosted
 * convert endpoints (`/fapi/v1/convert/*`): these are SAPI-routed.
 *
 * Wave 8: response parsing is driven by the connector-js oracle
 * (Binance's official OpenAPI documents, vendored under
 * contracts/wave8-oracle/convert). Three wire-shape transitions from the
 * pre-catalog docs are carried as explicit unions at the call site:
 *
 * - `tradeFlow` and `limitQueryOpenOrders` — current OpenAPI models the
 *   response as `{"list": [...]}` (with paging echoes for trade flow);
 *   the wire has also been seen as a plain array. Both parse; the
 *   method normalizes to a plain array so the public shape is stable.
 * - `assetInfo` — re-documented as "Query order quantity precision per
 *   asset" returning `[{asset, fraction}]`; the pre-catalog endpoint
 *   returned pair limits. Both documented shapes parse during the
 *   transition; the next major pins the current documented shape.
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
  }): Promise<SendQuoteRequestResponse> {
    return sendQuoteRequestResponseSchema.parse(await this.http.post('/sapi/v1/convert/getQuote', params, 'signed'));
  }

  /** Accept a quote returned by `getQuote`. `POST /sapi/v1/convert/acceptQuote` (SIGNED). */
  async acceptQuote(quoteId: string): Promise<AcceptQuoteResponse> {
    return acceptQuoteResponseSchema.parse(await this.http.post('/sapi/v1/convert/acceptQuote', { quoteId }, 'signed'));
  }

  /** Order status. `GET /sapi/v1/convert/orderStatus` (SIGNED). */
  async orderStatus(options: { orderId?: string; quoteId?: string }): Promise<OrderStatusResponse> {
    return orderStatusResponseSchema.parse(await this.http.get('/sapi/v1/convert/orderStatus', options, 'signed'));
  }

  /**
   * Trade flow history. `GET /sapi/v1/convert/tradeFlow` (SIGNED).
   *
   * Parses both documented wire shapes — the current wrapped
   * `{"list": [...]}` and the legacy plain array — and always returns a
   * plain array.
   */
  async tradeFlow(options?: { startTime?: number; endTime?: number; limit?: number }): Promise<GetConvertTradeHistoryResponseListInner[]> {
    const raw = await this.http.get('/sapi/v1/convert/tradeFlow', options ?? {}, 'signed');
    const parsed = z
      .union([z.array(getConvertTradeHistoryResponseListInnerSchema), getConvertTradeHistoryResponseSchema])
      .parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.list ?? []);
  }

  /**
   * Convert asset info. `GET /sapi/v1/convert/assetInfo` (SIGNED).
   *
   * Transition union: the current docs re-describe this endpoint as
   * "Query order quantity precision per asset" (`[{asset, fraction}]`);
   * the pre-catalog wire returned pair limits. Both parse until the
   * next major pins the current documented shape.
   */
  async assetInfo(
    options?: Record<string, string>,
  ): Promise<ConvertAssetInfo | QueryOrderQuantityPrecisionPerAssetResponse> {
    const raw = await this.http.get('/sapi/v1/convert/assetInfo', options ?? {}, 'signed');
    return z.union([ConvertAssetInfoSchema, queryOrderQuantityPrecisionPerAssetResponseSchema]).parse(raw);
  }

  /** Convert exchange info (pairs & availability). `GET /sapi/v1/convert/exchangeInfo` (SIGNED). */
  async exchangeInfo(options?: { fromAsset?: string; toAsset?: string }): Promise<ListAllConvertPairsResponse> {
    return listAllConvertPairsResponseSchema.parse(await this.http.get('/sapi/v1/convert/exchangeInfo', options ?? {}, 'signed'));
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
  }): Promise<PlaceLimitOrderResponse> {
    return placeLimitOrderResponseSchema.parse(
      await this.http.post('/sapi/v1/convert/limit/placeOrder', params, 'signed'),
    );
  }

  /** Cancel a limit convert order. `POST /sapi/v1/convert/limit/cancelOrder` (SIGNED). */
  async limitCancelOrder(orderId: string): Promise<CancelLimitOrderResponse> {
    return cancelLimitOrderResponseSchema.parse(
      await this.http.post('/sapi/v1/convert/limit/cancelOrder', { orderId }, 'signed'),
    );
  }

  /**
   * Query open limit convert orders. `GET /sapi/v1/convert/limit/queryOpenOrders` (SIGNED).
   *
   * Parses both documented wire shapes — the current wrapped
   * `{"list": [...]}` and the legacy plain array — and always returns a
   * plain array.
   */
  async limitQueryOpenOrders(options?: {
    baseAsset?: string;
    quoteAsset?: string;
    current?: number;
    size?: number;
  }): Promise<QueryLimitOpenOrdersResponseListInner[]> {
    const raw = await this.http.get('/sapi/v1/convert/limit/queryOpenOrders', options ?? {}, 'signed');
    const parsed = z
      .union([z.array(queryLimitOpenOrdersResponseListInnerSchema), queryLimitOpenOrdersResponseSchema])
      .parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.list ?? []);
  }
}
