import WebSocket from 'ws';
import type { EventBus } from '../../core/events.js';
import { BaseWS } from '../BaseWS.js';
import { FuturesMarketWS } from '../FuturesMarketWS.js';
import { SpotMarketWS } from '../SpotMarketWS.js';
import { CoinMMarketWS } from '../CoinMMarketWS.js';
import { exponentialBackoff } from './ReconnectPolicy.js';
import { WS_FAMILY_LIMITS, type ReconnectPolicy, type WsConnectionStats, type WsFamily } from './types.js';

/** The pooled connection classes the platform already ships per family. */
export type PooledConnection = FuturesMarketWS | SpotMarketWS | CoinMMarketWS;

export interface FamilyConnectionPoolOptions {
  family: WsFamily;
  /** Combined-stream base URL for the family (from core.endpoints). */
  baseStreamUrl: string;
  /** Cap on pooled connections; default is the family's documented default. */
  maxConnections?: number;
  /** Reconnect backoff; default jittered exponential. */
  reconnectPolicy?: ReconnectPolicy;
  /** Observability bus. */
  events?: EventBus;
  /** Injectable WebSocket factory for tests. */
  socketFactory?: (url: string) => WebSocket;
  /** Control-request ack timeout. Default 10s. */
  requestTimeoutMs?: number;
  /**
   * Called exactly once per created connection so the platform can wire
   * heartbeat liveness and centralized renewal (the pool itself never
   * schedules timers beyond the connection's own reconnect backoff).
   */
  onConnection?: (name: string, conn: PooledConnection) => void;
}

/**
 * Capacity-aware connection pool for one market-stream family.
 *
 * Binance documents a per-connection stream ceiling (200 for futures, 1024
 * for spot); the pool packs streams onto the least-loaded connection with
 * capacity and opens another connection (up to `maxConnections`) when every
 * existing one is full — so a 500-stream workload spreads across 3 USDⓈ-M
 * connections automatically instead of failing server-side.
 *
 * Pool-managed connections:
 *  - disable the built-in 23h rotation timer (renewal is centralized in
 *    {@link RenewalController} for stagger and observability);
 *  - disable the built-in liveness watchdog (pool-level {@link WsHeartbeat}
 *    uses one timer for all connections);
 *  - use the platform reconnect policy (jittered backoff, so a pool-wide
 *    outage does not retry in lockstep).
 */
export class FamilyConnectionPool {
  readonly family: WsFamily;
  private readonly baseStreamUrl: string;
  private readonly maxConnections: number;
  private readonly maxStreamsPerConnection: number;
  private readonly events?: EventBus;
  private readonly socketFactory?: (url: string) => WebSocket;
  private readonly requestTimeoutMs: number;
  private readonly onConnection?: (name: string, conn: PooledConnection) => void;
  private readonly createConnection: () => PooledConnection;
  private readonly pool: PooledConnection[] = [];

  constructor(options: FamilyConnectionPoolOptions) {
    this.family = options.family;
    this.baseStreamUrl = options.baseStreamUrl;
    this.maxConnections = options.maxConnections ?? WS_FAMILY_LIMITS[options.family].defaultMaxConnections;
    this.maxStreamsPerConnection = WS_FAMILY_LIMITS[options.family].maxStreamsPerConnection;
    this.events = options.events;
    this.socketFactory = options.socketFactory;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.onConnection = options.onConnection;

    const reconnectPolicy = options.reconnectPolicy ?? exponentialBackoff();
    const family = options.family;
    const buildOptions = {
      events: options.events,
      socketFactory: options.socketFactory,
      requestTimeoutMs: this.requestTimeoutMs,
      // Platform-owned lifecycles:
      rotationMs: 0, // RenewalController schedules renewal
      staleMs: 0, // WsHeartbeat owns liveness
      computeReconnectDelay: (attempt: number) => reconnectPolicy.delayForMs(attempt),
    };

    switch (family) {
      case 'usdm':
        this.createConnection = () => new FuturesMarketWS(this.baseStreamUrl, { ...buildOptions, name: this.nextName() });
        break;
      case 'spot':
        this.createConnection = () => new SpotMarketWS(this.baseStreamUrl, { ...buildOptions, name: this.nextName() });
        break;
      case 'coinm':
        this.createConnection = () => new CoinMMarketWS(this.baseStreamUrl, { ...buildOptions, name: this.nextName() });
        break;
    }
  }

  /**
   * Pick the connection that should carry `newStreams` — the least-loaded one
   * with capacity, or a newly created one. Creates never perform I/O: the
   * returned connection connects lazily on first `subscribe()`.
   *
   * Throws when every connection is at the documented stream ceiling and the
   * `maxConnections` cap is reached — the caller is over the family's
   * capacity and must raise the cap.
   */
  selectOrCreate(newStreams: readonly string[]): PooledConnection {
    if (newStreams.length > 0) {
      let candidate: PooledConnection | null = null;
      let candidateLoad = Number.POSITIVE_INFINITY;
      for (const conn of this.pool) {
        const load = conn.getSubscribedStreams().length;
        if (load + newStreams.length <= this.maxStreamsPerConnection && load < candidateLoad) {
          candidate = conn;
          candidateLoad = load;
        }
      }
      if (candidate) return candidate;
    }
    if (this.pool.length >= this.maxConnections) {
      throw new Error(
        `[${this.family}] connection pool exhausted: ${this.pool.length}/${this.maxConnections} connections at ` +
          `${this.maxStreamsPerConnection} streams each. Raise the ws platform's maxConnections for this family.`,
      );
    }
    const conn = this.createConnection();
    this.pool.push(conn);
    this.onConnection?.(conn.name, conn);
    this.events?.emit('ws.pool.connection.created', {
      family: this.family,
      name: conn.name,
      connections: this.pool.length,
    });
    return conn;
  }

  /** Live pooled connections (copy). */
  connections(): PooledConnection[] {
    return [...this.pool];
  }

  /** Number of pooled connections. */
  size(): number {
    return this.pool.length;
  }

  /** Structural snapshot (cheap, no I/O). */
  stats(): WsConnectionStats[] {
    return this.pool.map((conn) => ({
      name: conn.name,
      family: this.family,
      state: conn.getState(),
      desiredStreams: conn.getSubscribedStreams().length,
      confirmedStreams: conn.getConfirmedStreams().length,
      reconnectAttempt: conn.getReconnectAttempt(),
      msSinceLastActivity: conn.msSinceLastActivity(),
      nextRenewalAt: null, // filled in by the platform (RenewalController owns this)
    }));
  }

  /** Close every pooled connection. Safe repeatedly. */
  closeAll(): void {
    for (const conn of this.pool) conn.close();
    this.pool.length = 0;
  }

  /** Next pool-assigned connection name, e.g. `usdmMarket[3]`. */
  private nextName(): string {
    return `${this.family}Market[${this.pool.length}]`;
  }
}
