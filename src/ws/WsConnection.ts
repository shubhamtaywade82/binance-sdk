import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { EventBus } from '../core/events.js';
import { parseJsonLossless } from '../core/json.js';

/**
 * WebSocket connection lifecycle with an explicit state machine.
 *
 * This replaces the fragile pattern previously duplicated across BaseWS and the
 * three user-stream classes, which suffered from three concrete defects:
 *
 *  1. Reconnect race: `reconnect()` closed the old socket and immediately opened
 *     a new one, but the old socket's `close` handler then scheduled *another*
 *     reconnect — producing duplicate concurrent connections.
 *  2. No state visibility: callers could not distinguish "connecting" from
 *     "reconnecting" from "closed by user", so `subscribe()` during a connect
 *     window created a second socket.
 *  3. No proactive rotation: Binance terminates every stream connection at the
 *     24-hour mark; the old code waited for the server to drop it, stalling all
 *     market data for a full reconnect cycle every day.
 *
 * State machine:
 *
 *   IDLE ──connect()──▶ CONNECTING ──open──▶ OPEN
 *                          │                   │
 *                    error/close           close (server)
 *                          ▼                   ▼
 *   CLOSED ◀──close()── RECONNECTING ──backoff──▶ CONNECTING
 *
 *   OPEN ──rotation timer (T-23h)──▶ CONNECTING(replacement) ──open──▶ OPEN
 *          (traffic switches to the replacement; the old socket is retired)
 *
 * Stale-socket protection: every socket carries a unique token. A socket's
 * events are honored only while its token is the `active` token (or the
 * `pending` replacement token during a rotation window), so a retiring socket
 * can never trigger a spurious reconnect or emit stale data after a swap.
 */

export type WsConnectionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'OPEN'
  | 'RECONNECTING'
  | 'CLOSING'
  | 'CLOSED';

export interface WsConnectionOptions {
  /**
   * Produces the URL for each (re)connect attempt. Invoked per connection so
   * credentials (listenKeys) and stream lists are always current. Return null
   * to abort connecting (e.g. no listenKey yet).
   */
  buildUrl: () => string | null;
  /** Initial reconnect backoff. Default 1000ms. */
  reconnectDelayMs?: number;
  /** Backoff ceiling. Default 30000ms. */
  maxReconnectDelayMs?: number;
  /**
   * Proactive replacement window. Binance kills stream connections at 24h; we
   * rotate at 23h by default so the replacement is live *before* the server
   * drops us. 0 disables.
   */
  rotationMs?: number;
  /**
   * Liveness watchdog: when no frames (data, protocol pings or pongs) arrive
   * for this long while OPEN, the socket is considered dead and is torn down
   * into a reconnect. Binance user streams can legitimately go quiet, but the
   * server still pings them, so protocol-level activity counts. 0 disables.
   */
  staleMs?: number;
  /** Milliseconds to wait for a control-request ack before rejecting. Default 10000. */
  requestTimeoutMs?: number;
  /** Observability bus; events are published under the `ws:<name>` scope. */
  events?: EventBus;
  /** Label used in events/logs, e.g. `futuresMarket`, `spotUser`. */
  name?: string;
  /** Injectable WebSocket factory for tests. */
  socketFactory?: (url: string) => WebSocket;
  /**
   * v3 platform hook: replaces the built-in `min(base * 2^attempt, max)`
   * backoff formula with a caller-supplied policy (e.g. jittered
   * exponential). Purely additive — omit for the v2 default behavior.
   */
  computeReconnectDelay?: (attempt: number) => number;
}

interface AckHandler {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

const DEFAULTS = {
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30_000,
  rotationMs: 23 * 60 * 60 * 1000,
  staleMs: 0,
  requestTimeoutMs: 10_000,
};

export class WsConnection extends EventEmitter {
  protected readonly wsOptions: WsConnectionOptions;

  private state: WsConnectionState = 'IDLE';
  private activeSocket: WebSocket | null = null;
  private pendingSocket: WebSocket | null = null;
  private tokenCounter = 0;
  private activeToken = 0;
  private pendingToken = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private rotationTimer: NodeJS.Timeout | null = null;
  private livenessTimer: NodeJS.Timeout | null = null;
  private lastActivityMs = 0;
  private closedByUser = false;
  private readonly acks = new Map<number, AckHandler>();
  private nextRequestId = 1;
  private readonly events?: EventBus;
  protected readonly label: string;

  constructor(options: WsConnectionOptions) {
    super();
    this.wsOptions = options;
    this.label = options.name ?? 'ws';
    this.events = options.events;
    this.setMaxListeners(0);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  getState(): WsConnectionState {
    return this.state;
  }

  /** Public connection label (for pools, registries and stats snapshots). */
  get name(): string {
    return this.label;
  }

  isOpen(): boolean {
    return this.state === 'OPEN' && this.activeSocket?.readyState === WebSocket.OPEN;
  }

  /** Start the connection (no-op unless IDLE/CLOSED). */
  connect(): void {
    if (this.state === 'IDLE' || this.state === 'CLOSED') {
      this.closedByUser = false;
      this.reconnectAttempt = 0;
      this.openPrimarySocket('connect');
    }
    // Any other state (CONNECTING / OPEN / RECONNECTING) is already progressing;
    // opening a second socket here is the old duplicate-connection bug.
  }

  /**
   * User-initiated close. Cleans up every timer and socket; no reconnect will
   * be scheduled. Safe to call repeatedly and from any state.
   */
  close(): void {
    if (this.state === 'CLOSED') return;
    this.closedByUser = true;
    this.transition('CLOSING');
    this.clearTimers();
    this.failAllAcks(new Error(`[${this.label}] connection closed`));
    this.retireSocket(this.activeSocket);
    this.retireSocket(this.pendingSocket);
    this.activeSocket = null;
    this.pendingSocket = null;
    this.activeToken = 0;
    this.pendingToken = 0;
    this.transition('CLOSED');
    this.emit('close', { initiatedBy: 'user' });
    this.emitEvent('ws.closed', { connection: this.label, initiatedBy: 'user' });
    this.onClosedByUser();
  }

  /** Subclass hook: user-initiated teardown completed. */
  protected onClosedByUser(): void {
    /* default: no-op */
  }

  /**
   * v3 platform hook: trigger a zero-gap rotation now (the same path the
   * internal 23h timer uses). Returns true when a rotation was started,
   * false when it is not applicable — not OPEN, or a replacement is already
   * in flight. Centralized renewal schedulers (RenewalController) call this
   * so rotation timing is observable and staggered pool-wide.
   */
  rotateNow(): boolean {
    if (this.state !== 'OPEN' || this.closedByUser) return false;
    if (this.pendingSocket) return false; // already rotating
    this.rotate();
    return true;
  }

  /**
   * Force an immediate replacement connection. Safe from any live state: the
   * current socket (if any) is retired as stale so its close event cannot
   * trigger a duplicate reconnect.
   */
  reconnect(): void {
    if (this.state === 'CLOSED') {
      this.connect();
      return;
    }
    if (this.closedByUser) return;
    this.clearTimers();
    this.reconnectAttempt = 0;
    this.retireSocket(this.pendingSocket);
    this.pendingSocket = null;
    this.pendingToken = 0;
    this.retireSocket(this.activeSocket);
    this.activeSocket = null;
    this.activeToken = 0;
    this.openPrimarySocket('reconnect');
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempt = 0;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  /** Resolves once the connection reaches OPEN; rejects on terminal failure. */
  waitForOpen(timeoutMs = 30_000): Promise<void> {
    if (this.isOpen()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`[${this.label}] timed out waiting for OPEN (state=${this.state})`));
      }, timeoutMs);
      const onState = (to: WsConnectionState) => {
        if (to === 'OPEN') {
          cleanup();
          resolve();
        } else if (to === 'CLOSED') {
          cleanup();
          reject(new Error(`[${this.label}] connection closed before OPEN`));
        }
      };
      const onUserClose = (): void => {
        cleanup();
        reject(new Error(`[${this.label}] connection closed`));
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        this.off('state', onState);
        this.off('close', onUserClose);
      };
      this.on('state', onState);
      this.on('close', onUserClose);
    });
  }

  /**
   * Send a raw string when OPEN. Returns false (and queues nothing) if the
   * connection is not currently open — callers decide whether to retry.
   */
  sendRaw(data: string): boolean {
    if (!this.isOpen() || !this.activeSocket) return false;
    this.activeSocket.send(data);
    return true;
  }

  /**
   * Send a control request (`SUBSCRIBE`, `UNSUBSCRIBE`, `LIST_SUBSCRIPTIONS`)
   * and await its ack envelope `{result, id}`. Replies are parsed with
   * large-integer preservation.
   */
  request(method: string, params?: string[]): Promise<unknown> {
    if (!this.isOpen()) {
      return Promise.reject(
        new Error(`[${this.label}] not OPEN (state=${this.state}); cannot ${method}`),
      );
    }
    const id = this.nextRequestId++;
    const timeoutMs = this.wsOptions.requestTimeoutMs ?? DEFAULTS.requestTimeoutMs;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.acks.delete(id);
        reject(new Error(`[${this.label}] ${method} ack timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.acks.set(id, { resolve, reject, timer, method });
      this.sendRaw(JSON.stringify({ method, params: params ?? [], id }));
    });
  }

  /** Milliseconds since the last inbound frame (data, ping or pong). */
  msSinceLastActivity(): number {
    return this.lastActivityMs === 0 ? Number.POSITIVE_INFINITY : Date.now() - this.lastActivityMs;
  }

  // ---------------------------------------------------------------------------
  // Socket plumbing
  // ---------------------------------------------------------------------------

  private openPrimarySocket(reason: 'connect' | 'reconnect'): void {
    const url = this.wsOptions.buildUrl();
    if (url === null) {
      this.emit('error', new Error(`[${this.label}] no URL available (missing credentials?)`));
      this.emitEvent('ws.connect.failed', { reason, cause: 'no-url' });
      return;
    }
    const token = ++this.tokenCounter;
    this.activeToken = token;
    this.pendingToken = 0;
    const socket = this.createSocket(url, token, { purpose: reason });
    this.activeSocket = socket;
    this.transition('CONNECTING');
    this.emitEvent('ws.connecting', { reason, token, url: redactUrl(url) });
  }

  private createSocket(
    url: string,
    token: number,
    opts: { purpose: 'connect' | 'reconnect' | 'rotation' },
  ): WebSocket {
    const factory = this.wsOptions.socketFactory ?? ((u: string) => new WebSocket(u));
    const socket = factory(url);

    const isAuthorized = (): boolean =>
      token === this.activeToken || token === this.pendingToken;

    socket.on('open', () => {
      if (!isAuthorized()) return;
      if (opts.purpose === 'rotation') {
        // Rotation succeeded: swap traffic to the replacement, retire the old.
        this.retireSocket(this.activeSocket);
        this.activeSocket = socket;
        this.activeToken = token;
        this.pendingToken = 0;
        this.pendingSocket = null;
        this.reconnectAttempt = 0;
        this.lastActivityMs = Date.now();
        this.transition('OPEN');
        this.emit('rotated');
        this.emitEvent('ws.rotated', { connection: this.label });
        this.startRotationTimer();
        this.startLivenessTimer();
        return;
      }

      this.activeSocket = socket;
      this.activeToken = token;
      this.pendingToken = 0;
      this.pendingSocket = null;
      this.reconnectAttempt = 0;
      this.lastActivityMs = Date.now();
      this.transition('OPEN');
      this.emit('open');
      this.emitEvent('ws.open', { connection: this.label, token, reason: opts.purpose });
      this.startRotationTimer();
      this.startLivenessTimer();
    });

    const noteActivity = (): void => {
      if (!isAuthorized()) return;
      this.lastActivityMs = Date.now();
    };
    socket.on('message', (raw: unknown) => {
      if (!isAuthorized()) return;
      noteActivity();
      const text = typeof raw === 'string' ? raw : (raw as { toString(): string }).toString();
      this.handleRawMessage(text);
    });
    // Protocol-level pings/pongs also prove the connection is alive.
    socket.on('ping', noteActivity);
    socket.on('pong', noteActivity);

    socket.on('error', (err: Error) => {
      if (!isAuthorized()) return;
      this.emit('error', err);
      this.emitEvent('ws.error', {
        connection: this.label,
        phase: opts.purpose,
        message: err.message,
      });
      // 'ws' emits 'close' after 'error'; reconnection is driven from 'close'.
    });

    socket.on('close', (code: number, reason: Buffer) => {
      if (token === this.pendingToken) {
        // Failed rotation replacement: the active connection may still be fine.
        // Keep it carrying traffic and schedule another rotation attempt.
        this.pendingToken = 0;
        this.pendingSocket = null;
        this.emitEvent('ws.rotation.failed', { code, reason: reason.toString() });
        this.emit('rotationFailed', { code, reason: reason.toString() });
        this.startRotationTimer();
        return;
      }
      if (token !== this.activeToken) return; // retired socket: ignore

      this.emitEvent('ws.closed', {
        connection: this.label,
        code,
        reason: reason.toString(),
      });
      if (this.closedByUser) {
        this.transition('CLOSED');
        this.emit('close', { code, reason: reason.toString(), initiatedBy: 'user' });
        return;
      }
      this.emit('close', { code, reason: reason.toString() });
      this.scheduleReconnect();
    });

    return socket;
  }

  /**
   * Proactive 24h-safe renewal: open a replacement while the old connection
   * still carries traffic, then switch over without a data gap. The old socket
   * stays authorized until the replacement is fully open.
   */
  private rotate(): void {
    const url = this.wsOptions.buildUrl();
    if (url === null) {
      this.emitEvent('ws.rotation.skipped', { cause: 'no-url' });
      return;
    }
    this.emitEvent('ws.rotation.started', { connection: this.label });
    const token = ++this.tokenCounter;
    this.pendingToken = token;
    this.pendingSocket = this.createSocket(url, token, { purpose: 'rotation' });
  }

  /**
   * Marks a socket as retired: future events from it are ignored via the token
   * guards. Closes gracefully, terminating after a grace period so a hung TCP
   * close cannot pin the event loop open. Termination is defensive: the `ws`
   * library throws when terminating a socket that never finished establishing
   * (e.g. close() racing an in-flight connect) — that throw is noise here.
   */
  private retireSocket(socket: WebSocket | null): void {
    if (!socket) return;
    removeAllListeners(socket);
    // Terminating a socket that never finished establishing asynchronously
    // emits 'error' ("WebSocket was closed before the connection was
    // established") — with its listeners just removed, that would escape as
    // an uncaught exception. Attach a swallow-listener first.
    socket.on('error', () => {
      /* retired socket: teardown noise */
    });
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'client-rotating');
      const forced = setTimeout(() => {
        if (socket.readyState !== WebSocket.CLOSED) {
          try {
            socket.terminate();
          } catch {
            /* already gone */
          }
        }
      }, 5_000);
      forced.unref?.();
    } else if (
      socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.CLOSING
    ) {
      try {
        socket.terminate();
      } catch {
        /* the ws library throws on terminate-before-established; the socket is dead either way */
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.state === 'CLOSED' || this.closedByUser) return;
    if (this.reconnectTimer) return; // already scheduled

    this.clearTimers();
    const computeDelay = this.wsOptions.computeReconnectDelay;
    let delay: number;
    if (computeDelay) {
      delay = Math.max(0, computeDelay(this.reconnectAttempt));
    } else {
      const base = this.wsOptions.reconnectDelayMs ?? DEFAULTS.reconnectDelayMs;
      const max = this.wsOptions.maxReconnectDelayMs ?? DEFAULTS.maxReconnectDelayMs;
      delay = Math.min(base * 2 ** this.reconnectAttempt, max);
    }
    this.reconnectAttempt += 1;
    this.transition('RECONNECTING');
    this.emit('reconnecting', this.reconnectAttempt, delay);
    this.emitEvent('ws.reconnecting', {
      connection: this.label,
      attempt: this.reconnectAttempt,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser && this.state !== 'CLOSED') {
        this.openPrimarySocket('reconnect');
      }
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private startRotationTimer(): void {
    const rotationMs = this.wsOptions.rotationMs ?? DEFAULTS.rotationMs;
    if (rotationMs <= 0) return;
    this.rotationTimer = setTimeout(() => {
      this.rotationTimer = null;
      if (this.state !== 'OPEN' || this.closedByUser) return;
      if (this.pendingSocket) return; // rotation already in flight
      this.rotate();
    }, rotationMs);
    this.rotationTimer.unref?.();
  }

  private startLivenessTimer(): void {
    const staleMs = this.wsOptions.staleMs ?? DEFAULTS.staleMs;
    if (staleMs <= 0) return;
    this.livenessTimer = setInterval(() => {
      if (this.state !== 'OPEN') return;
      if (Date.now() - this.lastActivityMs > staleMs) {
        const quietMs = Date.now() - this.lastActivityMs;
        this.emitEvent('ws.stale', { connection: this.label, quietMs, staleMs });
        this.emit('stale', quietMs);
        // Terminate (not graceful close): don't wait on a dead network path.
        this.reconnect();
      }
    }, Math.max(Math.min(staleMs / 2, 30_000), 1_000));
    this.livenessTimer.unref?.();
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Message handling hooks
  // ---------------------------------------------------------------------------

  /** Subclass hook: receive each inbound frame as raw text. */
  protected handleRawMessage(text: string): void {
    this.emit('rawMessage', text);
  }

  /**
   * Parse + dispatch a control ack envelope `{result, id}`. Returns true when
   * the frame was an ack consumed by a pending `request()` call.
   */
  protected dispatchAck(parsed: unknown): boolean {
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !('stream' in (parsed as Record<string, unknown>)) &&
      'id' in (parsed as Record<string, unknown>) &&
      'result' in (parsed as Record<string, unknown>)
    ) {
      const { id, result, error } = parsed as {
        id: number;
        result?: unknown;
        error?: unknown;
      };
      const handler = this.acks.get(id);
      if (handler) {
        this.acks.delete(id);
        clearTimeout(handler.timer);
        if (error) {
          handler.reject(
            new Error(`[${this.label}] ${handler.method} rejected: ${JSON.stringify(error)}`),
          );
        } else {
          handler.resolve(result);
        }
        return true;
      }
    }
    return false;
  }

  private failAllAcks(err: Error): void {
    for (const handler of this.acks.values()) {
      clearTimeout(handler.timer);
      handler.reject(err);
    }
    this.acks.clear();
  }

  /** Lossless parse helper for subclasses. */
  protected parseFrame(text: string): unknown {
    try {
      return parseJsonLossless(text);
    } catch {
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------

  private transition(to: WsConnectionState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.emit('state', to, from);
    this.emitEvent('ws.state', { from, to, connection: this.label });
  }

  protected emitEvent(name: string, payload: Record<string, unknown>): void {
    if (!this.events) return;
    this.events.scoped(`ws:${this.label}`).emit(name, payload);
  }
}

function removeAllListeners(socket: WebSocket): void {
  socket.removeAllListeners('open');
  socket.removeAllListeners('message');
  socket.removeAllListeners('ping');
  socket.removeAllListeners('pong');
  socket.removeAllListeners('error');
  socket.removeAllListeners('close');
}

function redactUrl(url: string): string {
  // Hide listenKey path segments from logs/events.
  return url.replace(/\/[0-9a-f-]{20,}/i, '/<redacted>');
}
