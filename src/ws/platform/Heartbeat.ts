import type { EventBus } from '../../core/events.js';

/**
 * Minimal connection surface the heartbeat needs — implemented by
 * {@link WsConnection} and satisfiable by test stubs.
 */
export interface HeartbeatWatch {
  /** Connection label for events. */
  name?: string;
  getState(): string;
  /** ms since the last inbound frame; Infinity when never opened. */
  msSinceLastActivity(): number;
  /** Tear down into the reconnect path. */
  reconnect(): void;
}

export interface WsHeartbeatOptions {
  /** Silence threshold that declares a connection dead. Default 10 min. */
  staleMs?: number;
  /** Sampling interval. Default 30s. */
  intervalMs?: number;
  /** Observability bus. */
  events?: EventBus;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Injectable timer for tests (returns an unref-able handle). */
  setInterval?: (fn: () => void, ms: number) => { unref?: () => void };
}

/**
 * Pool-level liveness watchdog with a *single* timer.
 *
 * `WsConnection` already supports per-connection `staleMs`, but v3 platforms
 * watch dozens of sockets; one tick beats N setInterval handles, and the
 * judgment (server pings every 3 minutes → 10 minutes of total silence means
 * the path is dead) lives in exactly one place. Protocol-level activity
 * (pings/pongs) counts as liveness via `msSinceLastActivity`.
 *
 * When a connection goes stale the heartbeat does not wait for TCP to notice:
 * it calls `reconnect()` (terminate + fresh socket), which is the correct
 * response to a half-open path.
 */
export class WsHeartbeat {
  private readonly staleMs: number;
  private readonly intervalMs: number;
  private readonly events?: EventBus;
  private readonly now: () => number;
  private readonly timerFn: (fn: () => void, ms: number) => { unref?: () => void };
  private readonly watched = new Map<string, { conn: HeartbeatWatch; name: string }>();
  private timer: { unref?: () => void } | null = null;

  constructor(options: WsHeartbeatOptions = {}) {
    this.staleMs = options.staleMs ?? 10 * 60 * 1000;
    this.intervalMs = options.intervalMs ?? Math.max(Math.min(this.staleMs / 2, 30_000), 1_000);
    this.events = options.events;
    this.now = options.now ?? Date.now;
    this.timerFn = options.setInterval ?? ((fn, ms) => setInterval(fn, ms) as unknown as { unref?: () => void });
  }

  /** Start watching a connection under a stable key. */
  watch(key: string, conn: HeartbeatWatch): void {
    this.watched.set(key, { conn, name: conn.name ?? key });
    this.ensureTicking();
  }

  /** Stop watching (connection closed or pooled away). */
  unwatch(key: string): void {
    this.watched.delete(key);
    if (this.watched.size === 0) this.stop();
  }

  /** True when currently watched. */
  isWatching(key: string): boolean {
    return this.watched.has(key);
  }

  /** Number of watched connections. */
  size(): number {
    return this.watched.size;
  }

  /** Run one check immediately (also the interval body). */
  check(): { stale: string[] } {
    const stale: string[] = [];
    for (const [key, { conn, name }] of this.watched) {
      if (conn.getState() !== 'OPEN') continue;
      const quiet = conn.msSinceLastActivity();
      if (quiet > this.staleMs) {
        stale.push(name);
        this.events?.emit('ws.heartbeat.stale', {
          connection: name,
          quietMs: quiet === Number.POSITIVE_INFINITY ? null : Math.floor(quiet),
          staleMs: this.staleMs,
        });
        // Terminate-and-replace; a dead path must not be waited on.
        conn.reconnect();
        void key;
      }
    }
    return { stale };
  }

  start(): void {
    this.ensureTicking();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer as unknown as NodeJS.Timeout);
      this.timer = null;
    }
  }

  private ensureTicking(): void {
    if (this.timer || this.watched.size === 0) return;
    this.timer = this.timerFn(() => this.check(), this.intervalMs);
    this.timer.unref?.();
  }
}
