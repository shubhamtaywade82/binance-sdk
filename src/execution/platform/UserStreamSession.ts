import type WebSocket from 'ws';
import type { EventBus } from '../../core/events.js';
import { WsConnection, type WsConnectionOptions } from '../../ws/WsConnection.js';
import { createUserEventParser, type UserEventParser } from './normalize.js';
import {
  EXECUTION_PLATFORM_DEFAULTS,
  type ListenKeyApi,
  type UserSessionState,
} from './types.js';

/** Tuning for {@link UserStreamSession}. */
export interface UserStreamSessionOptions {
  /** Product label used in events and errors ('usdm' | 'spot' | …). */
  product: string;
  /** REST listen-key lifecycle the session drives. */
  listenKeyApi: ListenKeyApi;
  /** User-data stream base URL (the listen key is appended as the path). */
  userStreamUrl: string;
  /** Observability bus; `execution.session.*` events are published to it. */
  events?: EventBus;
  /** Connection label; defaults to `userSession:<product>`. */
  name?: string;
  /** Keep-alive cadence. Default 30 minutes. */
  keepAliveIntervalMs?: number;
  /** Consecutive keep-alive failures before key rotation. Default 3. */
  keepAliveFailuresBeforeRotation?: number;
  /** Reconnect attempts before key rotation. Default 6. */
  reconnectAttemptsBeforeRotation?: number;
  /**
   * A connection that opens and dies within this window *without delivering
   * a single frame* counts as a flap. Default 10s.
   */
  flapWindowMs?: number;
  /** Consecutive flaps before key rotation. Default 5. */
  flapFailuresBeforeRotation?: number;
  /** Frame parser; defaults to the product's (usdm → futures, else spot). */
  parseEvent?: UserEventParser;
  /** Injectable WebSocket factory for tests. */
  socketFactory?: (url: string) => WebSocket;
  /** Called once when the session is closed by the user (or `close()`). */
  onClose?: () => void;
  /** Connection-level passthrough (reconnect tuning, rotation window, …). */
  connection?: Partial<Omit<WsConnectionOptions, 'buildUrl' | 'name' | 'events' | 'socketFactory'>>;
}

/**
 * Managed user-data stream session.
 *
 * v2 (and the v3 M1 product clients) left the listen-key dance to the caller:
 * create the key, schedule the 30-minute keep-alive, notice when the key dies,
 * restart. Every consumer reimplemented it, and the failure modes (key expiry
 * mid-run, keep-alive failing silently, zombie sockets) were exactly the kind
 * of thing that loses fills.
 *
 * The session owns the whole lifecycle over a {@link WsConnection}:
 *
 *  - `start()` creates the key, connects, and schedules keep-alive;
 *  - keep-alive failures are counted — after 3 in a row the key is rotated
 *    (a fresh key is created and the connection swapped onto it);
 *  - a connection that cannot re-establish after 6 backoff attempts gets its
 *    key rotated too (the escape hatch for "the key died while we were
 *    partitioned");
 *  - the 24-hour server-side kill is preempted by the connection's own 23-hour
 *    rotation (same listen key, per Binance's renewal semantics);
 *  - `close()` stops everything and deletes the key server-side, best-effort.
 *
 * The session is also a drop-in user stream for the execution manager: it
 * emits `userData` with each parsed (validated, raw-decimal-preserving) frame,
 * so `executionManager.setUserStream(session)` immediately routes live
 * execution reports into the intent ledger.
 *
 * ```ts
 * const session = new UserStreamSession({
 *   product: 'usdm',
 *   listenKeyApi,
 *   userStreamUrl: core.endpoints.wsUser,
 *   events: core.events,
 * });
 * const key = await session.start();
 * session.on('userData', (event) => { /* e: ORDER_TRADE_UPDATE … *\/ });
 * session.close();
 * ```
 */
export class UserStreamSession extends WsConnection {
  private readonly api: ListenKeyApi;
  private readonly userStreamUrl: string;
  private readonly parse: UserEventParser;
  private readonly sessionProduct: string;
  private readonly keepAliveIntervalMs: number;
  private readonly keepAliveFailuresBeforeRotation: number;
  private readonly reconnectAttemptsBeforeRotation: number;
  private readonly flapWindowMs: number;
  private readonly flapFailuresBeforeRotation: number;
  private readonly sessionEvents?: EventBus;
  private listenKeyValue: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private keepAliveFailures = 0;
  private rotating = false;
  private sessionStateValue: UserSessionState = 'idle';
  private startPromise: Promise<string> | null = null;
  private readonly onClose?: () => void;
  /** Epoch ms of the last 'open'; flap detection. */
  private openedAtMs = 0;
  /** Inbound frames since the last 'open'; flap detection. */
  private framesSinceOpen = 0;
  /** Consecutive open-then-die-without-frames cycles. */
  private flapFailures = 0;

  constructor(options: UserStreamSessionOptions) {
    super({
      name: options.name ?? `userSession:${options.product}`,
      events: options.events,
      socketFactory: options.socketFactory,
      ...options.connection,
      buildUrl: () => {
        const key = this.listenKeyValue;
        return key ? `${this.userStreamUrl}/${key}` : null;
      },
    });
    this.api = options.listenKeyApi;
    this.userStreamUrl = options.userStreamUrl;
    this.sessionProduct = options.product;
    this.onClose = options.onClose;
    this.sessionEvents = options.events;
    this.keepAliveIntervalMs =
      options.keepAliveIntervalMs ?? EXECUTION_PLATFORM_DEFAULTS.keepAliveIntervalMs;
    this.keepAliveFailuresBeforeRotation =
      options.keepAliveFailuresBeforeRotation ?? EXECUTION_PLATFORM_DEFAULTS.keepAliveFailuresBeforeRotation;
    this.reconnectAttemptsBeforeRotation =
      options.reconnectAttemptsBeforeRotation ?? EXECUTION_PLATFORM_DEFAULTS.reconnectAttemptsBeforeRotation;
    this.flapWindowMs = options.flapWindowMs ?? 10_000;
    this.flapFailuresBeforeRotation =
      options.flapFailuresBeforeRotation ?? 5;
    this.parse =
      options.parseEvent ?? createUserEventParser(options.product === 'usdm' ? 'usdm' : 'spot');

    // A user-data stream is never fatal: attach one no-op error listener so
    // a frame error cannot crash a consumer that forgot to listen.
    this.on('error', () => {
      /* swallowed; real listeners still receive the event */
    });

    // Map connection lifecycle onto session states, and watch for the two
    // signatures of a dead listen key: a reconnect storm whose attempts keep
    // resetting (upgrade refused), and connections that "open" but die
    // without ever delivering a frame (accept-then-close — the ws client's
    // 'open' fires on handshake, so the attempt counter resets even though
    // the stream never carried anything).
    this.on('open', () => {
      this.openedAtMs = Date.now();
      this.framesSinceOpen = 0;
      this.setSessionState('live');
    });
    this.on('reconnecting', (attempt: number) => {
      this.setSessionState('reconnecting');
      const flapped =
        this.framesSinceOpen === 0 && this.openedAtMs > 0 &&
        Date.now() - this.openedAtMs < this.flapWindowMs;
      if (flapped) {
        this.flapFailures += 1;
        if (this.flapFailures >= this.flapFailuresBeforeRotation) {
          const count = this.flapFailures;
          this.flapFailures = 0;
          void this.rotateListenKey(`flapping-connection-${count}`);
        }
      } else {
        this.flapFailures = 0;
      }
      if (attempt >= this.reconnectAttemptsBeforeRotation) {
        void this.rotateListenKey(`reconnect-attempt-${attempt}`);
      }
    });
    this.on('close', (info: { initiatedBy?: string }) => {
      if (info?.initiatedBy === 'user' && this.sessionStateValue !== 'closed') {
        this.setSessionState('closed');
      }
    });
  }

  /** Product this session serves ('usdm' | 'spot' | …). */
  get product(): string {
    return this.sessionProduct;
  }

  /** Consumer-visible session state. */
  get sessionState(): UserSessionState {
    return this.sessionStateValue;
  }

  /** The live listen key, or null before start / after close. */
  get listenKey(): string | null {
    return this.listenKeyValue;
  }

  /**
   * Start the session: create a listen key, connect, schedule keep-alive.
   * Idempotent — concurrent or repeated calls share one start; returns the
   * listen key.
   */
  async start(): Promise<string> {
    if (this.sessionStateValue === 'closed') {
      return Promise.reject(new Error(`[${this.name}] session is closed; create a new one`));
    }
    if (this.sessionStateValue === 'live' || this.sessionStateValue === 'reconnecting') {
      return Promise.resolve(this.listenKeyValue as string);
    }
    if (this.startPromise) return this.startPromise;
    this.setSessionState('starting');
    this.startPromise = this.api
      .create()
      .then((key) => {
        if (this.sessionStateValue === 'closed') {
          // Closed while creating the key: dispose of it server-side.
          this.api.close?.(key).catch(() => {
            /* best-effort */
          });
          throw new Error(`[${this.name}] session closed during start`);
        }
        this.listenKeyValue = key;
        this.keepAliveFailures = 0;
        this.connect();
        this.scheduleNextKeepAlive();
        this.emitSessionEvent('started', { listenKey: key });
        return key;
      })
      .finally(() => {
        this.startPromise = null;
      });
    return this.startPromise;
  }

  /**
   * Close the session: stop keep-alive, tear the connection down, delete the
   * listen key server-side (best-effort). Safe to call repeatedly and from
   * any state.
   */
  override close(): void {
    if (this.sessionStateValue === 'closed') return;
    this.setSessionState('closed');
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    const key = this.listenKeyValue;
    this.listenKeyValue = null;
    if (key) {
      this.api.close?.(key).catch(() => {
        /* best-effort cleanup */
      });
    }
    this.emitSessionEvent('closed', {});
    super.close();
    this.onClose?.();
  }

  protected override handleRawMessage(text: string): void {
    this.framesSinceOpen += 1; // any frame proves the stream is delivering
    const parsed = this.parseFrame(text);
    if (parsed === undefined) return;
    try {
      const event = this.parse(parsed);
      const type = (event as { e?: unknown })?.e;
      if (typeof type === 'string') {
        this.emit(type, event);
      }
      this.emit('userData', event);
    } catch (err) {
      // Parse failures are per-frame: emit and keep the stream alive.
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ---------------------------------------------------------------------------
  // Keep-alive & rotation
  // ---------------------------------------------------------------------------

  private scheduleNextKeepAlive(): void {
    if (this.sessionStateValue === 'closed') return;
    if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
    this.keepAliveTimer = setTimeout(() => {
      this.keepAliveTimer = null;
      void this.keepAliveTick();
    }, this.keepAliveIntervalMs);
    this.keepAliveTimer.unref?.();
  }

  private async keepAliveTick(): Promise<void> {
    if (this.sessionStateValue === 'closed') return;
    const key = this.listenKeyValue;
    if (!key) return;
    try {
      await this.api.keepAlive(key);
      this.keepAliveFailures = 0;
      this.emitSessionEvent('keepalive', { ok: true });
    } catch (err) {
      this.keepAliveFailures += 1;
      this.emitSessionEvent('keepalive', {
        ok: false,
        failures: this.keepAliveFailures,
        message: err instanceof Error ? err.message : String(err),
      });
      if (this.keepAliveFailures >= this.keepAliveFailuresBeforeRotation) {
        await this.rotateListenKey(`keep-alive-failure-${this.keepAliveFailures}`);
      }
    } finally {
      this.scheduleNextKeepAlive();
    }
  }

  /**
   * Rotate onto a fresh listen key: create it, swap `listenKeyValue`, and
   * force the connection to re-establish on the new key. Guarded so overlapping
   * triggers (keep-alive failure + reconnect storm) rotate once.
   */
  private async rotateListenKey(reason: string): Promise<void> {
    if (this.rotating || this.isClosed()) return;
    this.rotating = true;
    try {
      const key = await this.api.create();
      if (this.isClosed()) {
        this.api.close?.(key).catch(() => {
          /* best-effort */
        });
        return;
      }
      this.listenKeyValue = key;
      this.keepAliveFailures = 0;
      this.emitSessionEvent('rotated', { reason, listenKey: key });
      // Swap the connection onto the new key. `reconnect()` is safe from any
      // live state; a healthy connection is briefly re-established, an
      // unhealthy one is already failing anyway.
      if (this.getState() !== 'CLOSED') {
        this.reconnect();
      }
    } catch (err) {
      this.emitSessionEvent('rotationFailed', {
        reason,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.rotating = false;
    }
  }

  private setSessionState(state: UserSessionState): void {
    if (this.sessionStateValue === state || this.sessionStateValue === 'closed') return;
    this.sessionStateValue = state;
    this.emit('sessionState', state);
  }

  /** Narrowing-safe terminal check (crosses `await` boundaries). */
  private isClosed(): boolean {
    return this.sessionStateValue === 'closed';
  }

  private emitSessionEvent(name: string, payload: Record<string, unknown>): void {
    this.emit(`session.${name}`, payload);
    if (!this.sessionEvents) return;
    this.sessionEvents
      .scoped('execution')
      .emit(`session.${name}`, { product: this.sessionProduct, ...payload });
  }
}
