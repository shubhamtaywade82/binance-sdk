import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { NetworkError } from '../errors/index.js';
import type { WsApiResponse } from '../types/userdata.types.js';
import { Signer, type SignatureAlgorithm } from '../client/Signer.js';

export interface WsApiOptions {
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

export class WsApi {
  private readonly signer: Signer;

  constructor(private readonly options: WsApiOptions) {
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

  placeOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.place', params);
  }

  cancelOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.cancel', params);
  }

  modifyOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.modify', params);
  }

  placeAlgoOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('algoOrder.place', params);
  }

  cancelAlgoOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('algoOrder.cancel', params);
  }

  orderStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.status', params);
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client. Removal planned for the next major version. */
  placeOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.place', params);
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client. Removal planned for the next major version. */
  cancelOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.cancel', params);
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client. Removal planned for the next major version. */
  orderListStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.status', params);
  }

  accountStatus(): Promise<WsApiResponse> {
    return this.request('account.status', {});
  }

  accountPosition(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('account.position', params);
  }

  accountBalance(): Promise<WsApiResponse> {
    return this.request('account.balance', {});
  }

  accountStatusV2(): Promise<WsApiResponse> {
    return this.request('v2/account.status', {});
  }

  accountBalanceV2(): Promise<WsApiResponse> {
    return this.request('v2/account.balance', {});
  }

  accountPositionV2(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('v2/account.position', params);
  }

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

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client (`futures.market`). Removal planned for the next major version. */
  time(): Promise<WsApiResponse> {
    return this.request('time', {}, { signed: false });
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client (`futures.market`). Removal planned for the next major version. */
  exchangeInfo(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('exchangeInfo', params, { signed: false });
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client (`futures.market`). Removal planned for the next major version. */
  klines(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('klines', params, { signed: false });
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client (`futures.market`). Removal planned for the next major version. */
  aggTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('aggTrades', params, { signed: false });
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client (`futures.market`). Removal planned for the next major version. */
  trades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades', params, { signed: false });
  }

  depth(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('depth', params, { signed: false });
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client (`futures.market`). Removal planned for the next major version. */
  avgPrice(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('avgPrice', params, { signed: false });
  }

  tickerPrice(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.price', params, { signed: false });
  }

  tickerBookTicker(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.book', params, { signed: false });
  }

  /** @deprecated Not a USDⓈ-M WebSocket API method (developers.binance.com, checked 2026-10-24), so Binance rejects it; use the REST client (`futures.market`). Removal planned for the next major version. */
  ticker24hr(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.24hr', params, { signed: false });
  }
}
