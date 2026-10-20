import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Convert (SAPI) — request for quote, accept quote, place limit
 * convert orders, and query trade flow. Distinct from the Futures-hosted
 * convert endpoints (`/fapi/v1/convert/*`): these are SAPI-routed.
 *
 * Endpoint surface (9 total).
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
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/convert/getQuote', params, 'signed');
  }

  /** Accept a quote returned by `getQuote`. `POST /sapi/v1/convert/acceptQuote` (SIGNED). */
  async acceptQuote(quoteId: string): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/convert/acceptQuote', { quoteId }, 'signed');
  }

  /** Order status. `GET /sapi/v1/convert/orderStatus` (SIGNED). */
  async orderStatus(options: { orderId?: string; quoteId?: string }): Promise<Record<string, unknown>> {
    return this.http.get('/sapi/v1/convert/orderStatus', options, 'signed');
  }

  /** Trade flow history. `GET /sapi/v1/convert/tradeFlow` (SIGNED). */
  async tradeFlow(options?: { startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/convert/tradeFlow', options ?? {}, 'signed');
  }

  /** Convert asset info (limits & precision). `GET /sapi/v1/convert/assetInfo` (SIGNED). */
  async assetInfo(options?: { fromAsset?: string; toAsset?: string }): Promise<Record<string, unknown>> {
    return this.http.get('/sapi/v1/convert/assetInfo', options ?? {}, 'signed');
  }

  /** Convert exchange info (pairs & availability). `GET /sapi/v1/convert/exchangeInfo` (SIGNED). */
  async exchangeInfo(options?: { fromAsset?: string; toAsset?: string }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/convert/exchangeInfo', options ?? {}, 'signed');
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
  }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/convert/limit/placeOrder', params, 'signed');
  }

  /** Cancel a limit convert order. `POST /sapi/v1/convert/limit/cancelOrder` (SIGNED). */
  async limitCancelOrder(orderId: string): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/convert/limit/cancelOrder', { orderId }, 'signed');
  }

  /** Query open limit convert orders. `GET /sapi/v1/convert/limit/queryOpenOrders` (SIGNED). */
  async limitQueryOpenOrders(options?: { baseAsset?: string; quoteAsset?: string; current?: number; size?: number }): Promise<unknown[]> {
    return this.http.get('/sapi/v1/convert/limit/queryOpenOrders', options ?? {}, 'signed');
  }
}
