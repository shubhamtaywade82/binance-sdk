import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { NetworkError } from '../errors/index.js';
import type { WsApiResponse } from '../types/userdata.types.js';
import { Signer, type SignatureAlgorithm } from '../client/Signer.js';

export interface SpotWsApiOptions {
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  /** PEM-encoded Ed25519 or RSA private key. When set, requests are signed with it instead of HMAC. */
  privateKey?: string | Buffer;
  /** Defaults to 'ED25519' when privateKey is set, otherwise 'HMAC'. */
  signatureAlgorithm?: SignatureAlgorithm;
  recvWindow?: number;
  timeoutMs?: number;
}

interface WsApiRequestParams {
  id?: string;
  [key: string]: unknown;
}

function buildQueryString(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, val]) => val !== undefined && val !== null)
    .map(([key, val]) => `${key}=${encodeURIComponent(String(val))}`)
    .join('&');
}

/**
 * Spot WebSocket API (`wss://ws-api.binance.com:443/ws-api/v3`). Same request/response envelope
 * as the futures {@link WsApi}, but Spot uses its own method identifiers (`trades.recent` rather
 * than `trades`, `ticker.book` rather than `ticker.bookTicker`, etc.) — hence a separate class
 * rather than pointing WsApi at a different host.
 */
export class SpotWsApi {
  private readonly signer: Signer;

  constructor(private readonly options: SpotWsApiOptions) {
    this.signer = new Signer({
      algorithm: options.signatureAlgorithm,
      apiSecret: options.apiSecret,
      privateKey: options.privateKey,
    });
  }

  async request(
    method: string,
    params: WsApiRequestParams = {},
    options?: { signed?: boolean },
  ): Promise<WsApiResponse> {
    const { apiKey } = this.options;
    const signed = options?.signed ?? true;
    const { id = randomUUID(), ...methodParams } = params;
    const requestParams: Record<string, unknown> = { ...methodParams };

    if (signed) {
      if (!apiKey || !this.signer.canSign()) {
        throw new Error('API key and secret (or privateKey) required for signed WebSocket API requests');
      }
      requestParams.apiKey = apiKey;
      requestParams.timestamp = Date.now();
      requestParams.recvWindow = this.options.recvWindow ?? 5000;
      const queryString = buildQueryString(requestParams);
      requestParams.signature = this.signer.sign(queryString);
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.baseUrl);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new NetworkError(`WebSocket API request timed out: ${method}`));
      }, this.options.timeoutMs ?? 15_000);

      ws.on('open', () => ws.send(JSON.stringify({ id, method, params: requestParams })));
      ws.on('message', (raw: Buffer) => {
        clearTimeout(timeout);
        ws.close();
        try {
          const parsed = JSON.parse(raw.toString()) as WsApiResponse;
          if (parsed.status >= 400) {
            reject(new Error(parsed.error?.msg ?? `WebSocket API error: ${method}`));
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(new NetworkError('Invalid WebSocket API JSON payload', err));
        }
      });
      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(new NetworkError(err.message, err));
      });
    });
  }

  // ---- Trading (signed) ----

  placeOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.place', params);
  }

  testOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.test', params);
  }

  cancelOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.cancel', params);
  }

  cancelReplaceOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.cancelReplace', params);
  }

  orderStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.status', params);
  }

  openOrdersStatus(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('openOrders.status', params);
  }

  cancelOpenOrders(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('openOrders.cancelAll', params);
  }

  placeOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.place', params);
  }

  cancelOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.cancel', params);
  }

  orderListStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.status', params);
  }

  openOrderListsStatus(): Promise<WsApiResponse> {
    return this.request('openOrderLists.status', {});
  }

  // ---- Account (signed) ----

  accountStatus(): Promise<WsApiResponse> {
    return this.request('account.status', {});
  }

  accountCommission(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('account.commission', params);
  }

  accountRateLimitsOrders(): Promise<WsApiResponse> {
    return this.request('account.rateLimits.orders', {});
  }

  allOrders(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('allOrders', params);
  }

  allOrderLists(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('allOrderLists', params);
  }

  myTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('myTrades', params);
  }

  // ---- User data stream (managed listen keys) ----

  userDataStreamStart(): Promise<WsApiResponse> {
    return this.request('userDataStream.start', {});
  }

  userDataStreamPing(listenKey: string): Promise<WsApiResponse> {
    return this.request('userDataStream.ping', { listenKey });
  }

  userDataStreamStop(listenKey: string): Promise<WsApiResponse> {
    return this.request('userDataStream.stop', { listenKey });
  }

  // ---- Public market data (no signature required) ----

  ping(): Promise<WsApiResponse> {
    return this.request('ping', {}, { signed: false });
  }

  time(): Promise<WsApiResponse> {
    return this.request('time', {}, { signed: false });
  }

  exchangeInfo(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('exchangeInfo', params, { signed: false });
  }

  depth(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('depth', params, { signed: false });
  }

  recentTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades.recent', params, { signed: false });
  }

  historicalTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades.historical', params, { signed: false });
  }

  aggTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades.aggregate', params, { signed: false });
  }

  klines(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('klines', params, { signed: false });
  }

  uiKlines(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('uiKlines', params, { signed: false });
  }

  avgPrice(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('avgPrice', params, { signed: false });
  }

  ticker24hr(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.24hr', params, { signed: false });
  }

  tickerTradingDay(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('ticker.tradingDay', params, { signed: false });
  }

  tickerPrice(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.price', params, { signed: false });
  }

  tickerBook(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.book', params, { signed: false });
  }

  ticker(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('ticker', params, { signed: false });
  }
}
