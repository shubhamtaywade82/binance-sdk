import { EventEmitter } from 'node:events';
import WebSocket, { type RawData } from 'ws';
import { parseWsPayload, type WsStreamPayload } from '../types/ws.types.js';
import type { SdkLogger } from '../util/logger.js';
import { silentLogger } from '../util/logger.js';

/**
 * Connection lifecycle state machine.
 *
 *   IDLE ──connect()──▶ CONNECTING ──open──▶ OPEN
 *                        │                     │
 *                 fail/close                fail/close
 *                        ▼                     ▼
 *                   RECONNECTING ──timer──▶ CONNECTING ── ...
 *
 *   any ──close()──▶ CLOSING ──▶ CLOSED ──connect()──▶ CONNECTING (restartable)
 *
 * Exactly one socket is authoritative at any time (`this.socket`) and every
 * event handler only acts on the authoritative socket. Superseded sockets are
 * retired with their listeners detached, so a close event from an abandoned
 * connection can never schedule a duplicate reconnect — the reconnect race:
 *
 *   reconnect() → close old → close event → scheduleReconnect() → connect()
 *   → new socket → scheduled reconnect fires → ANOTHER socket
 *
 * cannot happen, because reconnect() detaches the old socket's handlers and
 * schedules exactly one reconnect attempt, and connect() is a no-op unless the
 * state machine allows a fresh attempt.
 */
export enum WsState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  OPEN = 'open',
  RECONNECTING = 'reconnecting',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

export interface BaseWSOptions {
  baseStreamUrl: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  /**
   * Proactive connection recycle interval. Binance derivatives market data
   * connections have a 24-hour validity window; instead of waiting for the
   * server to drop the connection, a replacement socket is dialed and the old
   * one is retired only after the replacement is OPEN — the old socket keeps
   * dispatching until then, so there is no data gap. Default 23h; set <= 0 to
   * disable.
   */
  connectionLifetimeMs?: number;
  /** How long subscribe()/unsubscribe() wait for the exchange's ack frame. Default 10s. */
  subscriptionTimeoutMs?: number;
  /** Retry delay after a failed rotation attempt. Default 60s. */
  rotationRetryMs?: number;
  logger?: SdkLogger;
}

interface CombinedStreamMessage {
  stream: string;
  data: unknown;
}

interface ControlFrame {
  id?: number;
  result?: unknown;
  error?: { code?: number; msg?: string };
}

interface PendingControl {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_CONNECTION_LIFETIME_MS = 23 * 60 * 60 * 1000;

/**
 * Base class for Binance combined-stream WebSocket connections.
 *
 * `subscribe(streams)` returns a promise that resolves only once the
 * subscription is actually active: on a live connection the SUBSCRIBE control
 * frame must be acknowledged by the exchange (`{"result":null,"id":n}`), and
 * on a fresh connection the streams ride in the URL, for which the completed
 * handshake is the acknowledgement.
 */
export class BaseWS extends EventEmitter {
  /** The authoritative, dispatching socket. */
  private socket: WebSocket | null = null;
  /** A rotation replacement that is connecting but not yet authoritative. */
  private replacement: WebSocket | null = null;
  private readonly streams = new Set<string>();
  /** Streams confirmed active on the current connection (URL-embedded or ack'd). */
  private urlStreams = new Set<string>();
  private reconnectAttempt = 0;
  private state: WsState = WsState.IDLE;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private rotateTimer: NodeJS.Timeout | null = null;
  private readonly pendingControls = new Map<number, PendingControl>();
  private readonly openWaiters = new Set<(error?: Error) => void>();
  private requestId = 0;
  private readonly logger: SdkLogger;

  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly connectionLifetimeMs: number;
  private readonly subscriptionTimeoutMs: number;
  private readonly rotationRetryMs: number;

  constructor(private readonly options: BaseWSOptions) {
    super();
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.connectionLifetimeMs = options.connectionLifetimeMs ?? DEFAULT_CONNECTION_LIFETIME_MS;
    this.subscriptionTimeoutMs = options.subscriptionTimeoutMs ?? 10_000;
    this.rotationRetryMs = options.rotationRetryMs ?? 60_000;
    this.logger = options.logger ?? silentLogger;
  }

  /** Current lifecycle state of the connection. */
  getState(): WsState {
    return this.state;
  }

  /** Streams this instance intends to be subscribed to. */
  getStreams(): string[] {
    return [...this.streams];
  }

  /**
   * Subscribe to streams. Resolves once the subscription is actually active:
   * the exchange's ack frame on a live connection, or the completed handshake
   * for URL-embedded streams on a new one. Void-compatible with callers that
   * ignore the returned promise.
   */
  subscribe(streams: string[]): Promise<void> {
    if (streams.length === 0) return Promise.resolve();
    for (const s of streams) this.streams.add(s);

    switch (this.state) {
      case WsState.OPEN: {
        const fresh = streams.filter((s) => !this.urlStreams.has(s));
        if (fresh.length === 0) return Promise.resolve();
        return this.sendControl('SUBSCRIBE', fresh).then(() => {
          for (const s of fresh) this.urlStreams.add(s);
        }, this.rollbackAdditions(fresh));
      }
      case WsState.IDLE:
      case WsState.CLOSED:
        this.connect();
        return this.waitForOpen();
      case WsState.CONNECTING:
      case WsState.RECONNECTING:
        // Streams added mid-connect are reconciled via SUBSCRIBE once open.
        return this.waitForOpen();
      case WsState.CLOSING:
      default:
        return Promise.reject(new Error('WebSocket is closing; subscribe again after it reconnects'));
    }
  }

  /**
   * Unsubscribe, resolving on the exchange's ack frame. Removes from the
   * intended set immediately so a reconnect does not re-add them; the promise
   * rejects only if the exchange refuses the request.
   */
  unsubscribe(streams: string[]): Promise<void> {
    if (streams.length === 0) return Promise.resolve();
    for (const s of streams) this.streams.delete(s);

    if (this.state !== WsState.OPEN) return Promise.resolve();
    const live = streams.filter((s) => this.urlStreams.has(s));
    if (live.length === 0) return Promise.resolve();
    return this.sendControl('UNSUBSCRIBE', live).then(() => {
      for (const s of live) this.urlStreams.delete(s);
    }, this.rollbackRemovals(live));
  }

  /** Ask the exchange which streams this connection is subscribed to (LIST_SUBSCRIPTIONS). */
  async listSubscriptions(): Promise<string[]> {
    if (this.state !== WsState.OPEN) {
      throw new Error(`LIST_SUBSCRIPTIONS requires an open connection (state: ${this.state})`);
    }
    const result = await this.sendControl('LIST_SUBSCRIPTIONS', []);
    return Array.isArray(result) ? (result as string[]) : [];
  }

  /** Start the connection if not already live/connecting. Restartable after close(). */
  connect(): void {
    if (
      this.state === WsState.CONNECTING ||
      this.state === WsState.OPEN ||
      this.state === WsState.CLOSING ||
      this.state === WsState.RECONNECTING
    ) {
      return;
    }
    this.transition(WsState.CONNECTING);
    this.spawnSocket('fresh');
  }

  close(): void {
    if (this.state === WsState.CLOSED) return;
    this.transition(WsState.CLOSING);
    this.clearReconnectTimer();
    this.clearRotateTimer();
    const socket = this.socket;
    const replacement = this.replacement;
    this.socket = null;
    this.replacement = null;
    if (replacement) this.retireSocket(replacement);
    if (socket) this.retireSocket(socket);
    this.failOpenWaiters(new Error('WebSocket closed by user'));
    this.rejectPendingControls(new Error('WebSocket closed by user'));
    this.transition(WsState.CLOSED);
  }

  /**
   * Controlled restart: the current socket is retired silently — its close
   * event can no longer schedule a reconnect — and exactly one reconnect is
   * scheduled immediately. Idempotent.
   */
  reconnect(): void {
    if (this.state === WsState.CLOSED || this.state === WsState.CLOSING) return;
    this.clearReconnectTimer();
    this.clearRotateTimer();
    this.reconnectAttempt = 0;

    const socket = this.socket;
    const replacement = this.replacement;
    this.socket = null;
    this.replacement = null;
    if (replacement) this.retireSocket(replacement);
    if (socket) this.retireSocket(socket);

    this.transition(WsState.RECONNECTING);
    this.scheduleReconnect(0);
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempt = 0;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private buildUrl(): string {
    const streams = [...this.streams].join('/');
    return streams ? `${this.options.baseStreamUrl}?streams=${streams}` : this.options.baseStreamUrl;
  }

  /**
   * Spawn a socket. Mode 'fresh' makes it authoritative immediately (the old
   * socket, if any, is dead or retired). Mode 'replacement' keeps the old
   * socket dispatching until the replacement opens — that is what makes the
   * proactive 24h rotation gapless.
   */
  private spawnSocket(mode: 'fresh' | 'replacement'): void {
    const spawnStreams = new Set(this.streams); // frozen set carried by this socket's URL
    const socket = new WebSocket(this.buildUrl());
    if (mode === 'fresh') {
      const previous = this.socket;
      this.socket = socket;
      this.replacement = null;
      this.urlStreams = spawnStreams;
      if (previous && previous !== socket) this.retireSocket(previous);
    } else {
      this.replacement = socket;
    }

    socket.on('open', () => {
      if (this.replacement === socket) {
        // Rotation handoff: the replacement is now authoritative.
        const old = this.socket;
        this.socket = socket;
        this.replacement = null;
        this.urlStreams = spawnStreams;
        if (old && old !== socket) this.retireSocket(old);
        this.onSocketOpen(socket, 'rotated');
        return;
      }
      if (this.socket === socket) {
        this.onSocketOpen(socket, 'connected');
        return;
      }
      // Orphan (superseded while connecting) — retire.
      this.retireSocket(socket);
    });

    socket.on('message', (raw: RawData) => {
      if (this.socket !== socket) return; // includes replacement-before-open
      this.handleMessage(raw.toString());
    });

    socket.on('error', (err: Error) => {
      if (this.replacement === socket) {
        this.abortRotation(socket, `replacement error: ${err.message}`);
        return;
      }
      if (this.socket !== socket) return;
      this.logger.warn('socket-error', { message: err.message });
      this.emit('error', err);
      // ws always emits 'close' after 'error' — reconnect handled there.
    });

    socket.on('close', (code: number, reason: Buffer) => {
      if (this.replacement === socket) {
        this.abortRotation(socket, `replacement closed (${code})`);
        return;
      }
      if (this.socket !== socket) return; // stale socket — inert
      this.handleClose(code, reason.toString());
    });
  }

  private onSocketOpen(socket: WebSocket, reason: 'connected' | 'rotated'): void {
    this.clearRotateTimer();
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;
    this.transition(WsState.OPEN);
    this.scheduleRotation();
    this.logger.info(reason, { streams: this.streams.size });
    this.emit('open');
    this.emit(reason === 'rotated' ? 'rotated' : 'connected');
    void this.reconcileSubscriptions();
  }

  private handleClose(code: number, reason: string): void {
    this.clearRotateTimer();
    this.logger.info('disconnected', { code, reason });
    this.emit('close', code, reason);
    if (this.state === WsState.CLOSING || this.state === WsState.CLOSED) {
      this.transition(WsState.CLOSED);
      return;
    }
    this.scheduleReconnect();
  }

  /**
   * After a socket opens, reconcile anything that changed while its URL was
   * frozen: SUBSCRIBE for streams added mid-connect, UNSUBSCRIBE for removed.
   * URL-embedded streams are already active and need no ack.
   */
  private async reconcileSubscriptions(): Promise<void> {
    if (this.state !== WsState.OPEN) return;
    const toAdd = [...this.streams].filter((s) => !this.urlStreams.has(s));
    const toRemove = [...this.urlStreams].filter((s) => !this.streams.has(s));

    if (toRemove.length > 0) {
      for (const s of toRemove) this.urlStreams.delete(s);
      try {
        await this.sendControl('UNSUBSCRIBE', toRemove);
      } catch {
        /* already gone server-side, or the connection rotated again */
      }
    }
    if (toAdd.length > 0) {
      try {
        await this.sendControl('SUBSCRIBE', toAdd);
        for (const s of toAdd) this.urlStreams.add(s);
      } catch {
        for (const s of toAdd) this.streams.delete(s);
        this.emit('error', new Error(`Failed to confirm subscription for: ${toAdd.join(', ')}`));
        return;
      }
    }
    this.resolveOpenWaiters();
  }

  private waitForOpen(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiter = (error?: Error) => {
        this.openWaiters.delete(waiter);
        if (error) reject(error);
        else resolve();
      };
      this.openWaiters.add(waiter);
    });
  }

  private resolveOpenWaiters(): void {
    for (const waiter of [...this.openWaiters]) waiter();
  }

  private failOpenWaiters(error: Error): void {
    for (const waiter of [...this.openWaiters]) waiter(error);
  }

  private rejectPendingControls(error: Error): void {
    for (const pending of this.pendingControls.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingControls.clear();
  }

  private rollbackAdditions(streams: string[]) {
    return (err: Error) => {
      // Never carry an unconfirmed stream into the next reconnect URL.
      for (const s of streams) this.streams.delete(s);
      throw err;
    };
  }

  private rollbackRemovals(streams: string[]) {
    return (err: Error) => {
      // The unsubscribe was refused — restore intent so state stays truthful.
      for (const s of streams) this.streams.add(s);
      throw err;
    };
  }

  private sendControl(
    method: 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'LIST_SUBSCRIPTIONS',
    params: string[],
  ): Promise<unknown> {
    this.requestId += 1;
    const id = this.requestId;
    const payload = JSON.stringify({ method, params, id });

    return new Promise<unknown>((resolve, reject) => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN || this.state !== WsState.OPEN) {
        reject(new Error(`Cannot send ${method}: connection is not open`));
        return;
      }
      const timer = setTimeout(() => {
        this.pendingControls.delete(id);
        reject(new Error(`${method} ack timed out after ${this.subscriptionTimeoutMs}ms`));
      }, this.subscriptionTimeoutMs);

      this.pendingControls.set(id, { resolve, reject, timer });
      this.logger.debug('control', { method, streams: params.length, id });
      socket.send(payload, (err) => {
        if (err) {
          this.pendingControls.delete(id);
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  private handleMessage(raw: string): void {
    let parsed: CombinedStreamMessage & ControlFrame;
    try {
      parsed = JSON.parse(raw) as CombinedStreamMessage & ControlFrame;
    } catch {
      return;
    }

    // Control frames: {"result":...,"id":n} or {"error":{...},"id":n}
    if ((parsed.result !== undefined || parsed.error !== undefined) && parsed.id !== undefined) {
      this.dispatchControl(parsed.id, parsed.result, parsed.error);
      return;
    }

    if (!parsed.stream || parsed.data === undefined) return;
    try {
      const payload: WsStreamPayload = parseWsPayload(parsed.stream, parsed.data);
      this.emit('message', parsed.stream, payload);
      this.emit(parsed.stream, payload);
    } catch (err) {
      this.emit('error', err);
    }
  }

  private dispatchControl(id: number, result: unknown, error: ControlFrame['error']): void {
    const pending = this.pendingControls.get(id);
    if (!pending) return;
    this.pendingControls.delete(id);
    clearTimeout(pending.timer);
    if (error) {
      pending.reject(
        new Error(`Binance rejected control request: ${error.msg ?? 'unknown error'} (code ${error.code ?? '?'})`),
      );
    } else {
      pending.resolve(result);
    }
  }

  private scheduleReconnect(delayOverride?: number): void {
    this.clearReconnectTimer();
    if (this.state === WsState.CLOSED || this.state === WsState.CLOSING) return;
    this.transition(WsState.RECONNECTING);

    const delay =
      delayOverride ?? Math.min(this.reconnectDelayMs * 2 ** this.reconnectAttempt, this.maxReconnectDelayMs);
    this.reconnectAttempt += 1;
    this.logger.info('reconnect-scheduled', { delayMs: delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state === WsState.RECONNECTING) {
        this.transition(WsState.CONNECTING);
        this.spawnSocket('fresh');
      }
    }, delay);
  }

  /** Proactive 24h-style rotation: dial the replacement before retiring the old socket. */
  private scheduleRotation(): void {
    this.clearRotateTimer();
    if (!(this.connectionLifetimeMs > 0)) return;
    this.rotateTimer = setTimeout(() => {
      this.rotateTimer = null;
      if (this.state !== WsState.OPEN || this.replacement) return;
      this.logger.info('rotate', { reason: 'connection-lifetime', lifetimeMs: this.connectionLifetimeMs });
      this.emit('rotate');
      this.spawnSocket('replacement');
    }, this.connectionLifetimeMs);
  }

  /** A rotation replacement died before opening — keep the old connection and retry later. */
  private abortRotation(socket: WebSocket, reason: string): void {
    if (this.replacement !== socket) return;
    this.replacement = null;
    this.retireSocket(socket);
    this.logger.warn('rotation-aborted', { reason });
    this.emit('rotation-aborted', reason);
    if (this.state === WsState.OPEN) {
      this.rotateTimer = setTimeout(() => {
        this.rotateTimer = null;
        this.scheduleRotation();
      }, this.rotationRetryMs);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearRotateTimer(): void {
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
  }

  /** Detach every listener and close a superseded socket so its events are inert. */
  private retireSocket(socket: WebSocket): void {
    socket.removeAllListeners();
    // Keep a no-op error listener so ws internals can never throw unhandled.
    socket.on('error', () => undefined);
    try {
      socket.close();
    } catch {
      /* already closed or closing */
    }
  }

  private transition(state: WsState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }
}
