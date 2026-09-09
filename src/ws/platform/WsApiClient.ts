import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { NetworkError } from '../../errors/index.js';
import type { WsApiResponse } from '../../types/userdata.types.js';
import { Signer, type SignatureAlgorithm } from '../../client/Signer.js';
import type { EventBus } from '../../core/events.js';
import { exponentialBackoff } from './ReconnectPolicy.js';
import { WS_PLATFORM_DEFAULTS, type ReconnectPolicy } from './types.js';

export interface WsApiClientOptions {
  /** WS API endpoint, e.g. `wss://ws-fapi.binance.com/ws-fapi/v1`. */
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  /** PEM-encoded Ed25519 or RSA private key; overrides HMAC when set. */
  privateKey?: string | Buffer;
  /** Defaults to 'ED25519' when privateKey is set, otherwise 'HMAC'. */
  signatureAlgorithm?: SignatureAlgorithm;
  recvWindow?: number;
  /** Per-request response timeout. Default 15s (transport parity). */
  requestTimeoutMs?: number;
  /** Reconnect backoff; default jittered exponential 1s→30s. */
  reconnectPolicy?: ReconnectPolicy;
  /** Observability bus. */
  events?: EventBus;
  /** Label for events/logs, e.g. `wsApiUsdm`. */
  name?: string;
  /** Injectable WebSocket factory for tests. */
  socketFactory?: (url: string) => WebSocket;
  /** Injectable delay for tests (reconnect backoff). */
  delay?: (ms: number) => Promise<void>;
}

interface PendingRequest {
  resolve: (response: WsApiResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

export type WsApiClientState = 'IDLE' | 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'CLOSED';

export interface WsRequestOptions {
  /** Sign the request (apiKey + timestamp + recvWindow + signature). Default true. */
  signed?: boolean;
}

/**
 * Persistent, multiplexed WebSocket API client.
 *
 * v2's {@link WsApi} opened a *socket per request* — an order burst of 20
 * meant 20 connects, 20 TLS handshakes and 20 server-side teardowns. The v3
 * platform client keeps **one** connection per endpoint alive and routes
 * concurrent requests over it by correlation id:
 *
 * ```ts
 * const api = client.ws.api.usdm;
 * const [order, status] = await Promise.all([
 *   api.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', ... }),
 *   api.accountStatus(),
 * ]);  // both ride the same socket
 * ```
 *
 * Semantics:
 *  - **REST-style promises** — every call resolves with the server's
 *    response envelope or rejects with a typed error; no frames to juggle.
 *  - **Auto-connect** — the first request opens the connection; subsequent
 *    requests wait for OPEN when a reconnect is in flight (within their own
 *    timeout).
 *  - **Reconnect with backoff** — a dropped connection reconnects
 *    automatically; requests that were in flight when it dropped reject
 *    with a retryable {@link NetworkError} (the caller decides whether to
 *    re-send — WS API requests are not idempotent-by-default).
 *  - **Multiplexing** — responses are routed to their caller by `id`, so
 *    concurrent calls never cross wires.
 */
export class WsApiClient extends EventEmitter {
  protected readonly options: WsApiClientOptions;
  protected readonly label: string;
  private readonly signer: Signer;
  private readonly reconnectPolicy: ReconnectPolicy;
  private readonly delay: (ms: number) => Promise<void>;

  private socket: WebSocket | null = null;
  private state: WsApiClientState = 'IDLE';
  private closedByUser = false;
  private reconnectAttempt = 0;
  private openWaiters: { resolve: () => void; reject: (err: Error) => void }[] = [];
  private readonly pending = new Map<string, PendingRequest>();

  constructor(options: WsApiClientOptions) {
    super();
    this.options = options;
    this.label = options.name ?? 'wsApi';
    this.signer = new Signer({
      algorithm: options.signatureAlgorithm,
      apiSecret: options.apiSecret,
      privateKey: options.privateKey,
    });
    this.reconnectPolicy = options.reconnectPolicy ?? exponentialBackoff();
    this.delay = options.delay ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.setMaxListeners(0);
  }

  /** Current connection state. */
  getState(): string {
    return this.state;
  }

  /** Public client label (for stats snapshots and events). */
  get name(): string {
    return this.label;
  }

  /** Requests awaiting a response right now. */
  pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Issue one WS API method call and resolve with the server's response.
   * The request rides the persistent connection (opening it if needed).
   * Signed requests without credentials reject (never throw sync).
   */
  async request(
    method: string,
    params: Record<string, unknown> = {},
    options: WsRequestOptions = {},
  ): Promise<WsApiResponse> {
    const signed = options.signed ?? true;
    const requestParams = this.buildParams(method, params, signed);
    const id = typeof requestParams.id === 'string' ? requestParams.id : randomUUID();

    const promise = this.sendAndWait(method, requestParams, id);
    // Fire-and-forget guard: an ignored rejection must never kill the process.
    void promise.catch(() => {
      /* failures are emitted as events in sendAndWait */
    });
    return promise;
  }

  /** User-initiated teardown; pending requests are failed, no reconnect. */
  close(): void {
    this.closedByUser = true;
    this.failAllPending(new NetworkError(`[${this.label}] client closed`));
    this.failOpenWaiters(new Error(`[${this.label}] client closed`));
    if (this.socket) {
      this.removeSocketListeners(this.socket);
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.close(1000, 'client-closing');
      } else if (this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.terminate();
      }
      this.socket = null;
    }
    this.transition('CLOSED');
    this.emit('close');
    this.emitEvent('ws.api.closed', {});
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private buildParams(
    method: string,
    params: Record<string, unknown>,
    signed: boolean,
  ): Record<string, unknown> {
    const requestParams: Record<string, unknown> = { ...params };
    if (!signed) return requestParams;

    const { apiKey } = this.options;
    if (!apiKey || !this.signer.canSign()) {
      throw new Error(
        `[${this.label}] API key and secret (or privateKey) required for signed WS API request: ${method}`,
      );
    }
    requestParams.apiKey = apiKey;
    requestParams.timestamp = Date.now();
    requestParams.recvWindow = this.options.recvWindow ?? 5000;
    const queryString = buildQueryString(requestParams);
    requestParams.signature = this.signer.sign(queryString);
    return requestParams;
  }

  private async sendAndWait(
    method: string,
    requestParams: Record<string, unknown>,
    id: string,
  ): Promise<WsApiResponse> {
    const timeoutMs = this.options.requestTimeoutMs ?? 15_000;

    // Ensure the connection is OPEN (auto-connect / wait out reconnect).
    await this.ensureOpen(timeoutMs);

    return new Promise<WsApiResponse>((resolve, reject) => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        // Raced a drop between ensureOpen and the send: fail as retryable
        // network error rather than letting ws throw a raw sync error.
        reject(new NetworkError(`[${this.label}] connection lost before ${method} was sent`));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const err = new NetworkError(`[${this.label}] ${method} timed out after ${timeoutMs}ms`);
        this.emitEvent('ws.api.timeout', { method, id, timeoutMs });
        reject(err);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });

      socket.send(JSON.stringify({ id, method, params: requestParams }));
      this.emitEvent('ws.api.request.sent', { method, id, signed: 'apiKey' in requestParams });
    });
  }

  private ensureOpen(timeoutMs: number): Promise<void> {
    if (this.state === 'OPEN' && this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.closedByUser || this.state === 'CLOSED') {
      return Promise.reject(new Error(`[${this.label}] client is closed`));
    }

    if (this.state === 'IDLE' || this.state === 'RECONNECTING') {
      if (this.state === 'IDLE') this.openSocket('connect');
      // fall through: wait for OPEN
    } else if (this.state === 'CONNECTING') {
      // already opening; wait
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiterIndex = this.openWaiters.findIndex((w) => w.resolve === resolve);
        if (waiterIndex >= 0) this.openWaiters.splice(waiterIndex, 1);
        reject(new Error(`[${this.label}] connection not OPEN within ${timeoutMs}ms (state=${this.state})`));
      }, timeoutMs);
      const waiter = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.openWaiters.push(waiter);
    });
  }

  private openSocket(reason: 'connect' | 'reconnect'): void {
    const factory = this.options.socketFactory ?? ((url: string) => new WebSocket(url));
    const socket = factory(this.options.baseUrl);
    this.socket = socket;
    this.transition('CONNECTING');
    this.emitEvent('ws.api.connecting', { reason, url: this.options.baseUrl });

    socket.on('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.transition('OPEN');
      this.emit('open');
      this.emitEvent('ws.api.open', { reason });
      const waiters = [...this.openWaiters];
      this.openWaiters.length = 0;
      for (const waiter of waiters) waiter.resolve();
    });

    socket.on('message', (raw: unknown) => {
      if (this.socket !== socket) return;
      const text = typeof raw === 'string' ? raw : (raw as { toString(): string }).toString();
      this.handleMessage(text);
    });

    socket.on('error', (err: Error) => {
      if (this.socket !== socket) return;
      this.emit('error', err);
      this.emitEvent('ws.api.error', { message: err.message, state: this.state });
      // 'ws' emits 'close' after 'error'; reconnect is driven from 'close'.
    });

    socket.on('close', (code: number, reason: Buffer) => {
      if (this.socket !== socket) return;
      this.emitEvent('ws.api.closed', { code, reason: reason.toString(), initiatedBy: this.closedByUser ? 'user' : 'server' });
      if (this.closedByUser) {
        this.transition('CLOSED');
        this.failAllPending(new NetworkError(`[${this.label}] connection closed`));
        this.failOpenWaiters(new Error(`[${this.label}] connection closed`));
        return;
      }
      // In-flight requests cannot be assumed delivered — fail them as
      // retryable network errors; the caller decides whether to re-send.
      this.failAllPending(new NetworkError(`[${this.label}] connection dropped during request`));
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    this.transition('RECONNECTING');
    const delayMs = this.reconnectPolicy.delayForMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.emit('reconnecting', this.reconnectAttempt, delayMs);
    this.emitEvent('ws.api.reconnecting', { attempt: this.reconnectAttempt, delayMs });

    void this.delay(delayMs).then(() => {
      if (this.closedByUser || this.state === 'CLOSED') return;
      this.openSocket('reconnect');
    });
  }

  private handleMessage(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.emitEvent('ws.api.parse.error', { preview: text.slice(0, 80) });
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || !('id' in parsed)) {
      return; // not a response envelope (WS API responses always carry id)
    }
    const response = parsed as WsApiResponse;
    const handler = this.pending.get(response.id);
    if (!handler) return;
    this.pending.delete(response.id);
    clearTimeout(handler.timer);

    if (response.status >= 400) {
      const message = response.error?.msg ?? `[${this.label}] WS API error ${response.status} (${handler.method})`;
      this.emitEvent('ws.api.request.failed', {
        method: handler.method,
        id: response.id,
        status: response.status,
        message,
      });
      handler.reject(new Error(message));
      return;
    }
    this.emitEvent('ws.api.response', { method: handler.method, id: response.id, status: response.status });
    handler.resolve(response);
  }

  private failAllPending(err: Error): void {
    for (const handler of this.pending.values()) {
      clearTimeout(handler.timer);
      handler.reject(err);
    }
    this.pending.clear();
  }

  private failOpenWaiters(err: Error): void {
    const waiters = [...this.openWaiters];
    this.openWaiters.length = 0;
    for (const waiter of waiters) waiter.reject(err);
  }

  private removeSocketListeners(socket: WebSocket): void {
    socket.removeAllListeners('open');
    socket.removeAllListeners('message');
    socket.removeAllListeners('error');
    socket.removeAllListeners('close');
  }

  private transition(to: WsApiClientState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.emit('state', to, from);
    this.emitEvent('ws.api.state', { from, to });
  }

  private emitEvent(name: string, payload: Record<string, unknown>): void {
    this.options.events?.scoped(`ws:${this.label}`).emit(name, payload);
  }
}

function buildQueryString(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, val]) => val !== undefined && val !== null)
    .map(([key, val]) => `${key}=${encodeURIComponent(String(val))}`)
    .join('&');
}
