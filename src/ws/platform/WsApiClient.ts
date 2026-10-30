import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { NetworkError } from '../../errors/index.js';
import {
  RpcOutcomeUnknownError,
  classifyRpcMethod,
  isOrderWriteCategory,
  type RpcRequestCategory,
} from '../../errors/RpcOutcomeUnknownError.js';
import type { WsApiResponse } from '../../types/userdata.types.js';
import { Signer, type SignatureAlgorithm } from '../../client/Signer.js';
import type { EventBus } from '../../core/events.js';
import { exponentialBackoff } from './ReconnectPolicy.js';
import type { ReconnectPolicy } from './types.js';
import type { WsSession } from './WsSession.js';

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
  /**
   * Ed25519 session manager (v3.5.1). When set, every connection is
   * authenticated with `session.logon` after the socket opens: the client
   * moves through AUTHENTICATING and only reaches READY once Binance confirms
   * the session. Session authentication is *connection* state — it never
   * replaces listen-key management for user-data streams.
   */
  session?: WsSession;
  /**
   * When true *and* a `session` is authenticated, signed requests omit
   * `apiKey`/`timestamp`/`recvWindow`/`signature` (the connection itself is
   * authorized, per Binance's session-authentication contract). Default
   * false: per-request HMAC/Ed25519 signing is always applied, which keeps
   * signing behavior unchanged for consumers that do not opt in.
   */
  useSessionAuth?: boolean;
  /**
   * Hard cap on simultaneously pending RPCs. New requests above the cap reject
   * immediately (a queue of unbounded size hides backpressure and lets
   * ambiguous order writes pile up). Default 500.
   */
  maxPendingRequests?: number;
}

/** One in-flight RPC — fully typed, with the data retry policies need. */
export interface PendingRequest {
  /** Correlation id used on the wire. */
  id: string;
  /** WebSocket API method, e.g. `order.place`. */
  method: string;
  /** Dispatched params (never logged; may contain an apiKey when signed). */
  params: Record<string, unknown>;
  /** Request classification, used to pick failure semantics. */
  category: RpcRequestCategory;
  /** Response timeout the request was dispatched with. */
  timeoutMs: number;
  /** Connection generation the request rides on. */
  connectionGeneration: number;
  /** Epoch ms the request entered the pending map. */
  submittedAt: number;
  /** Epoch ms the frame was sent, or null when it never left the client. */
  sentAt: number | null;
  /** Timeout handle. */
  timer: NodeJS.Timeout;
  resolve: (response: WsApiResponse) => void;
  reject: (err: Error) => void;
}

/**
 * Explicit RPC lifecycle. The legacy subset (`IDLE`, `CONNECTING`, `OPEN`,
 * `RECONNECTING`, `CLOSED`) is preserved for consumers that never configure
 * `session`; with session authentication the client additionally moves
 * through the auth-scoped states:
 *
 *   IDLE → CONNECTING → AUTHENTICATING → READY
 *          (reconnect) → RECONNECTING → REAUTHENTICATING → READY
 *   auth rejection / auth timeout → FAILED
 *   close() → CLOSING → CLOSED
 */
export type WsApiClientState =
  | 'IDLE'
  | 'CONNECTING'
  | 'AUTHENTICATING'
  | 'OPEN'
  | 'READY'
  | 'RECONNECTING'
  | 'REAUTHENTICATING'
  | 'CLOSING'
  | 'CLOSED'
  | 'FAILED';

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
 * concurrent requests over it by correlation id.
 *
 * Semantics:
 *  - **REST-style promises** — every call resolves with the server's
 *    response envelope or rejects with a typed error; no frames to juggle.
 *  - **Auto-connect** — the first request opens the connection; subsequent
 *    requests wait for a usable connection (OPEN, or READY with session
 *    authentication) within their own timeout.
 *  - **Reconnect with backoff** — a dropped connection reconnects
 *    automatically with jittered exponential backoff.
 *  - **No replay** — requests in flight when the connection drops are failed
 *    with *classified* errors and are **never** re-sent automatically:
 *      - a request that never left the client → retryable `NetworkError`;
 *      - a dispatched read → retryable `NetworkError`;
 *      - a dispatched order write (place/cancel/modify) →
 *        {@link RpcOutcomeUnknownError} — the outcome is unknown; reconcile
 *        the order (e.g. by client order id) before any resubmission.
 *    This is deliberate: a reconnect-time replay queue is how SDKs end up
 *    double-placing orders after network blips.
 *  - **Session authentication (v3.5.1)** — with a {@link WsSession} the
 *    connection must reach READY before any RPC dispatches; stale
 *    authentication callbacks from retired connections are ignored.
 *  - **Multiplexing** — responses are routed to their caller by `id`, so
 *    concurrent calls never cross wires; late/duplicate responses are
 *    dropped safely.
 */
export class WsApiClient extends EventEmitter {
  protected readonly options: WsApiClientOptions;
  protected readonly label: string;
  private readonly signer: Signer;
  private readonly reconnectPolicy: ReconnectPolicy;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly session?: WsSession;
  private readonly useSessionAuth: boolean;
  private readonly maxPendingRequests: number;

  private socket: WebSocket | null = null;
  private state: WsApiClientState = 'IDLE';
  private closedByUser = false;
  private reconnectAttempt = 0;
  /** Monotonic connection generation; increments on every socket attempt. */
  private connectionGeneration = 0;
  private everAuthenticated = false;
  private authInFlight: Promise<void> | null = null;
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
    this.session = options.session;
    this.useSessionAuth = options.useSessionAuth ?? false;
    this.maxPendingRequests = options.maxPendingRequests ?? 500;
    this.setMaxListeners(0);
  }

  /** Current connection state. */
  getState(): WsApiClientState {
    return this.state;
  }

  /** Current connection generation (identifies the physical connection). */
  getConnectionGeneration(): number {
    return this.connectionGeneration;
  }

  /** True when RPCs may dispatch right now (OPEN, or READY with session auth). */
  isDispatchable(): boolean {
    return (
      (this.state === 'OPEN' || this.state === 'READY') &&
      this.socket?.readyState === WebSocket.OPEN
    );
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
    const category = classifyRpcMethod(method);
    // The id is caller-supplied (params.id) or a fresh correlation uuid.
    const id = typeof params.id === 'string' ? params.id : randomUUID();

    // Credentials are attached *after* the connection is usable: with
    // `useSessionAuth` the session may authenticate during the connect wait,
    // and only then can per-request signing be skipped.
    const promise = this.sendAndWait(method, params, id, category, signed);
    // Fire-and-forget guard: an ignored rejection must never kill the process.
    void promise.catch(() => {
      /* failures are emitted as events in sendAndWait */
    });
    return promise;
  }

  /**
   * {@link WsSessionTransport} adapter: session-control RPCs (logon/status/
   * logout) dispatch with their own credentials already in `params`, so they
   * are sent unsigned by the request path.
   */
  async sendRpc<T = unknown>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<{ id: string; status: number; result: T; error?: { code: number; msg: string } }> {
    const response = await this.request(method, params, { signed: false });
    return response as { id: string; status: number; result: T; error?: { code: number; msg: string } };
  }

  /** User-initiated teardown; pending requests are failed, no reconnect. */
  close(): void {
    if (this.state === 'CLOSED') return;
    this.closedByUser = true;
    this.transition('CLOSING');
    this.session?.clearSession();
    // Classified failure: an in-flight dispatched order write is still
    // ambiguous even on a user-initiated close.
    this.failAllPending('connection closed by user', 'connection-drop');
    this.failOpenWaiters(new Error(`[${this.label}] client closed`));
    if (this.socket) {
      this.removeSocketListeners(this.socket);
      // Terminating a socket that never finished establishing emits 'error'
      // ("WebSocket was closed before the connection was established") — with
      // its listeners just removed that would escape as an uncaught exception.
      this.socket.on('error', () => {
        /* teardown noise */
      });
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
    rawParams: Record<string, unknown>,
    id: string,
    category: RpcRequestCategory,
    signed: boolean,
  ): Promise<WsApiResponse> {
    const timeoutMs = this.options.requestTimeoutMs ?? 15_000;

    if (this.pending.size >= this.maxPendingRequests) {
      this.emitEvent('ws.api.queue.full', {
        method,
        pending: this.pending.size,
        max: this.maxPendingRequests,
      });
      throw new Error(
        `[${this.label}] pending RPC queue full (${this.pending.size}/${this.maxPendingRequests}); refusing ${method}`,
      );
    }

    // Session-control RPCs (logon/status/logout) are the *producers* of the
    // READY state: they must ride the open socket even while the connection
    // is still AUTHENTICATING, or the auth handshake would deadlock on
    // itself. Everything else waits for a dispatchable connection
    // (auto-connect / wait out reconnect or authentication).
    const bypassReadyGate = category === 'session' && this.socket?.readyState === WebSocket.OPEN;
    if (!bypassReadyGate) {
      await this.ensureDispatchable(timeoutMs, method);
    }

    // Credentials are attached here — after the connection reached a usable
    // state — so a session that authenticated during the wait can exempt the
    // request from per-request signing.
    const sessionAuthorized =
      signed && this.useSessionAuth && this.session?.isAuthenticated === true;
    const requestParams = sessionAuthorized
      ? { ...rawParams }
      : this.buildParams(method, rawParams, signed);

    return new Promise<WsApiResponse>((resolve, reject) => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        // Raced a drop between ensureDispatchable and the send: the frame
        // never left the client, so a retry is side-effect-free.
        reject(new NetworkError(`[${this.label}] connection lost before ${method} was sent`));
        return;
      }
      const entry: PendingRequest = {
        id,
        method,
        params: requestParams,
        category,
        timeoutMs,
        connectionGeneration: this.connectionGeneration,
        submittedAt: Date.now(),
        sentAt: null,
        timer: null as unknown as NodeJS.Timeout,
        resolve,
        reject,
      };
      entry.timer = setTimeout(() => {
        this.pending.delete(id);
        // A timeout after dispatch is ambiguous for order writes: the
        // exchange may have processed the frame. Reads stay retryable.
        if (entry.sentAt !== null && isOrderWriteCategory(entry.category)) {
          const err = new RpcOutcomeUnknownError({
            requestId: id,
            method,
            category,
            clientOrderId: stringOrUndefined(requestParams.newClientOrderId),
            symbol: stringOrUndefined(requestParams.symbol),
            connectionGeneration: entry.connectionGeneration,
            submittedAt: entry.submittedAt,
            sentAt: entry.sentAt,
            cause: 'timeout',
          });
          this.emitEvent('ws.api.unknown_outcome', {
            method,
            id,
            category,
            cause: 'timeout',
          });
          reject(err);
          return;
        }
        this.emitEvent('ws.api.timeout', { method, id, timeoutMs });
        reject(new NetworkError(`[${this.label}] ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, entry);

      socket.send(JSON.stringify({ id, method, params: requestParams }));
      entry.sentAt = Date.now();
      this.emitEvent('ws.api.request.sent', { method, id, signed: 'apiKey' in requestParams });
    });
  }

  private ensureDispatchable(timeoutMs: number, method: string): Promise<void> {
    if (this.isDispatchable()) return Promise.resolve();
    if (this.closedByUser || this.state === 'CLOSED' || this.state === 'FAILED') {
      return Promise.reject(
        new Error(`[${this.label}] client is ${this.state}; cannot ${method}`),
      );
    }

    if (this.state === 'IDLE' || this.state === 'RECONNECTING') {
      if (this.state === 'IDLE') this.openSocket('connect');
      // fall through: wait for a usable connection
    } else if (this.state === 'CONNECTING' || this.state === 'AUTHENTICATING' || this.state === 'REAUTHENTICATING') {
      // already opening / authenticating; wait
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiterIndex = this.openWaiters.findIndex((w) => w.resolve === resolve);
        if (waiterIndex >= 0) this.openWaiters.splice(waiterIndex, 1);
        reject(new Error(`[${this.label}] connection not usable within ${timeoutMs}ms (state=${this.state})`));
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
    this.connectionGeneration += 1;
    const generation = this.connectionGeneration;
    this.transition('CONNECTING');
    this.emitEvent('ws.api.connecting', { reason, url: this.options.baseUrl, generation });

    socket.on('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      if (this.session) {
        // Session-authenticated connection: authenticate before READY.
        this.transition(this.everAuthenticated ? 'REAUTHENTICATING' : 'AUTHENTICATING');
        this.emit('authenticating');
        void this.authenticate(socket, generation);
        return;
      }
      this.transition('OPEN');
      this.emit('open');
      this.emitEvent('ws.api.open', { reason, generation });
      this.resolveOpenWaiters();
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
      this.emitEvent('ws.api.closed', {
        code,
        reason: reason.toString(),
        initiatedBy: this.closedByUser ? 'user' : 'server',
        generation,
      });
      // Session authorization is connection state — it dies with the socket.
      this.session?.clearSession();
      if (this.closedByUser) {
        this.transition('CLOSED');
        this.failAllPending('connection closed', 'connection-drop');
        this.failOpenWaiters(new Error(`[${this.label}] connection closed`));
        return;
      }
      if (this.state === 'AUTHENTICATING' || this.state === 'REAUTHENTICATING') {
        this.emit('authInterrupted', { code });
      }
      // In-flight requests cannot be assumed delivered — classified failure,
      // and nothing is ever replayed on the new connection.
      this.failAllPending('connection dropped during request', 'connection-drop');
      this.failOpenWaiters(new Error(`[${this.label}] connection dropped`));
      this.scheduleReconnect();
    });
  }

  /**
   * Authenticate the current connection (`session.logon`) and promote it to
   * READY. Generation-guarded: an auth result from a retired connection can
   * never promote or fail a newer one, and concurrent triggers deduplicate
   * onto a single logon per connection.
   */
  private async authenticate(socket: WebSocket, generation: number): Promise<void> {
    if (this.authInFlight) {
      await this.authInFlight.catch(() => {
        /* the owning caller surfaces the failure */
      });
      return;
    }
    const session = this.session;
    if (!session) return;
    this.authInFlight = (async () => {
      try {
        await session.logon(this);
      } catch (err) {
        // Stale result: a newer connection (or a user close) owns the state.
        if (this.socket !== socket || this.connectionGeneration !== generation || this.closedByUser) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.emit('authFailed', err instanceof Error ? err : new Error(message));
        this.emitEvent('ws.api.auth.failed', { message, generation });
        // Authentication failure is terminal for this client: a rejected
        // credential does not heal by reconnecting, and a retry loop would
        // only hammer the endpoint.
        this.transition('FAILED');
        this.failAllPending('session authentication failed', 'connection-drop');
        this.failOpenWaiters(new Error(`[${this.label}] session authentication failed: ${message}`));
        return;
      }
      if (this.socket !== socket || this.connectionGeneration !== generation || this.closedByUser) {
        // Stale success (connection was replaced while authenticating).
        return;
      }
      this.everAuthenticated = true;
      this.transition('READY');
      this.emit('ready');
      this.emitEvent('ws.api.auth.success', { generation });
      this.resolveOpenWaiters();
    })();
    try {
      await this.authInFlight;
    } finally {
      this.authInFlight = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    this.transition('RECONNECTING');
    const delayMs = this.reconnectPolicy.delayForMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.emit('reconnecting', this.reconnectAttempt, delayMs);
    this.emitEvent('ws.api.reconnecting', { attempt: this.reconnectAttempt, delayMs });

    void this.delay(delayMs).then(() => {
      if (this.closedByUser || this.state === 'CLOSED' || this.state === 'FAILED') return;
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
    const entry = this.pending.get(String(response.id));
    if (!entry) {
      // Late or duplicate response: no pending request owns it. Dropped
      // safely — it must never resolve a different request.
      this.emitEvent('ws.api.late_response', {
        id: String(response.id),
        status: response.status,
      });
      return;
    }
    this.pending.delete(String(response.id));
    clearTimeout(entry.timer);

    if (response.status >= 400) {
      const message =
        response.error?.msg ?? `[${this.label}] WS API error ${response.status} (${entry.method})`;
      this.emitEvent('ws.api.request.failed', {
        method: entry.method,
        id: entry.id,
        status: response.status,
        message,
      });
      entry.reject(new Error(message));
      return;
    }
    this.emitEvent('ws.api.response', { method: entry.method, id: entry.id, status: response.status });
    entry.resolve(response);
  }

  /**
   * Fail every pending request with a *classified* error:
   *  - dispatched order writes (place/cancel/modify) → RpcOutcomeUnknownError
   *    (reconcile before any retry);
   *  - never-sent requests and dispatched reads → retryable NetworkError.
   * Nothing is re-queued: there is no reconnect replay path.
   */
  private failAllPending(context: string, cause: 'connection-drop' | 'timeout'): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      if (entry.sentAt !== null && isOrderWriteCategory(entry.category)) {
        this.emitEvent('ws.api.unknown_outcome', {
          method: entry.method,
          id: entry.id,
          category: entry.category,
          cause,
        });
        entry.reject(
          new RpcOutcomeUnknownError({
            requestId: entry.id,
            method: entry.method,
            category: entry.category,
            clientOrderId: stringOrUndefined(entry.params.newClientOrderId),
            symbol: stringOrUndefined(entry.params.symbol),
            connectionGeneration: entry.connectionGeneration,
            submittedAt: entry.submittedAt,
            sentAt: entry.sentAt,
            cause,
          }),
        );
        continue;
      }
      entry.reject(
        new NetworkError(`[${this.label}] ${entry.method}: ${context}`),
      );
    }
    this.pending.clear();
  }

  private resolveOpenWaiters(): void {
    const waiters = [...this.openWaiters];
    this.openWaiters.length = 0;
    for (const waiter of waiters) waiter.resolve();
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
    this.emitEvent('ws.api.state', { from, to, generation: this.connectionGeneration });
  }

  private emitEvent(name: string, payload: Record<string, unknown>): void {
    this.options.events?.scoped(`ws:${this.label}`).emit(name, payload);
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function buildQueryString(data: Record<string, unknown>): string {
  // WS API signatures cover the params sorted by name (plain code-unit order).
  return Object.entries(data)
    .filter(([, val]) => val !== undefined && val !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, val]) => `${key}=${encodeURIComponent(String(val))}`)
    .join('&');
}
