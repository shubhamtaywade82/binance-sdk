import type { EventBus } from '../../core/events.js';
import { WS_PLATFORM_DEFAULTS } from './types.js';

/**
 * Minimal connection surface the renewal controller needs — implemented by
 * {@link WsConnection} (an EventEmitter) and satisfiable by test stubs.
 *
 * Zero-gap rotation is transparent in the state machine: the connection stays
 * OPEN while the replacement connects, so completion is signalled by the
 * `rotated` / `rotationFailed` emitter events, not by state transitions.
 */
export interface RenewableConnection {
  on(event: 'state', listener: (to: string, from: string) => void): unknown;
  on(event: 'rotated', listener: () => void): unknown;
  on(event: 'rotationFailed', listener: (info: { code: number; reason: string }) => void): unknown;
  off(event: 'state', listener: (to: string, from: string) => void): unknown;
  off(event: 'rotated', listener: () => void): unknown;
  off(event: 'rotationFailed', listener: (info: { code: number; reason: string }) => void): unknown;
  getState(): string;
  /** Attempt a zero-gap rotation; false when not applicable. */
  rotateNow(): boolean;
}

export interface RenewalControllerOptions {
  /**
   * Renewal window. Binance kills stream connections at 24h; the platform
   * rotates at 23h so the replacement carries traffic *before* the drop.
   * Default 23h.
   */
  rotationMs?: number;
  /**
   * Per-connection jitter (uniform [0, jitterMs)). Two connections opened in
   * the same millisecond would otherwise renew in the same millisecond — a
   * synchronized herd. Default 10 min.
   */
  jitterMs?: number;
  /**
   * Platform-wide cap on simultaneous renewals; the default 1 serializes
   * rotations so a pool of N connections renews one at a time.
   */
  maxConcurrent?: number;
  /** Observability bus. */
  events?: EventBus;
  /** Injectable randomness for tests; must return [0, 1). */
  random?: () => number;
  /** Injectable timer for tests. */
  setTimeout?: (fn: () => void, ms: number) => { unref?: () => void };
  /** Postponement/retry interval. Default 30s. */
  retryMs?: number;
}

interface Tracked {
  name: string;
  conn: RenewableConnection;
  nextRenewalAt: number | null;
  timer: { unref?: () => void } | null;
  rotating: boolean;
  onState: (to: string, from: string) => void;
  onRotated: () => void;
  onRotationFailed: (info: { code: number; reason: string }) => void;
}

/**
 * Centralized, staggered 24h-safe renewal sequencing.
 *
 * `WsConnection` has a built-in 23h rotation timer; pool-managed connections
 * disable it (`rotationMs: 0`) and defer to this controller because:
 *
 *  - **Decorrelation** — every connection gets a uniform jitter on top of the
 *    23h window, so a pool created at boot rotates across a spread, not a
 *    synchronized herd.
 *  - **Concurrency cap** — at most `maxConcurrent` rotations platform-wide;
 *    a herd forced to serialize is a blip, not an event.
 *  - **Observability** — `nextRenewalAt(name)` and `ws.renewal.*` events make
 *    the rotation schedule inspectable instead of a hidden timer per socket.
 *
 * Renewals are zero-gap: the connection swaps sockets internally (traffic
 * keeps flowing on the old one until the replacement is open).
 */
export class RenewalController {
  private readonly rotationMs: number;
  private readonly jitterMs: number;
  private readonly maxConcurrent: number;
  private readonly events?: EventBus;
  private readonly random: () => number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => { unref?: () => void };
  private readonly retryMs: number;
  private readonly tracked = new Map<string, Tracked>();

  constructor(options: RenewalControllerOptions = {}) {
    this.rotationMs = options.rotationMs ?? WS_PLATFORM_DEFAULTS.rotationMs;
    this.jitterMs = options.jitterMs ?? WS_PLATFORM_DEFAULTS.renewalJitterMs;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? WS_PLATFORM_DEFAULTS.maxConcurrentRenewals);
    this.events = options.events;
    this.random = options.random ?? Math.random;
    this.setTimeoutFn =
      options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms) as unknown as { unref?: () => void });
    this.retryMs = options.retryMs ?? 30_000;
  }

  /**
   * Start centrally managing renewal for a connection. Scheduling anchors on
   * the connection reaching OPEN (or immediately, if already open), so a
   * tracked-but-not-yet-connected socket does not burn its rotation window.
   */
  track(name: string, conn: RenewableConnection): void {
    if (this.tracked.has(name)) return;
    const tracked: Tracked = {
      name,
      conn,
      nextRenewalAt: null,
      timer: null,
      rotating: false,
      onState: (to) => {
        if (to === 'OPEN') this.scheduleRenewal(tracked);
      },
      onRotated: () => {
        // Zero-gap swap completed: the new socket carries traffic. Re-anchor
        // the next window from now.
        tracked.rotating = false;
        this.scheduleRenewal(tracked);
      },
      onRotationFailed: () => {
        // Replacement refused/died; the old socket still carries traffic.
        // Clear the in-flight flag and retry after a short postpone.
        tracked.rotating = false;
        if (tracked.timer) {
          clearTimeout(tracked.timer as unknown as NodeJS.Timeout);
          tracked.timer = null;
        }
        tracked.nextRenewalAt = Date.now() + this.retryMs;
        tracked.timer = this.setTimeoutFn(() => {
          tracked.timer = null;
          this.fireRenewal(tracked);
        }, this.retryMs);
        tracked.timer.unref?.();
      },
    };
    this.tracked.set(name, tracked);
    conn.on('state', tracked.onState);
    conn.on('rotated', tracked.onRotated);
    conn.on('rotationFailed', tracked.onRotationFailed);
    if (conn.getState() === 'OPEN') this.scheduleRenewal(tracked);
  }

  /** Stop managing a connection; safe to call for unknown names. */
  untrack(name: string): void {
    const tracked = this.tracked.get(name);
    if (!tracked) return;
    if (tracked.timer) clearTimeout(tracked.timer as unknown as NodeJS.Timeout);
    tracked.conn.off('state', tracked.onState);
    tracked.conn.off('rotated', tracked.onRotated);
    tracked.conn.off('rotationFailed', tracked.onRotationFailed);
    this.tracked.delete(name);
  }

  /** Epoch-ms of the next scheduled renewal, or null when idle/closed. */
  nextRenewalAt(name: string): number | null {
    return this.tracked.get(name)?.nextRenewalAt ?? null;
  }

  /** True while a renewal is in flight for this connection. */
  isRenewing(name: string): boolean {
    return this.tracked.get(name)?.rotating ?? false;
  }

  /** Number of centrally managed connections. */
  size(): number {
    return this.tracked.size;
  }

  /** Stop managing everything. */
  close(): void {
    for (const name of [...this.tracked.keys()]) this.untrack(name);
  }

  private scheduleRenewal(tracked: Tracked): void {
    if (tracked.timer) {
      clearTimeout(tracked.timer as unknown as NodeJS.Timeout);
      tracked.timer = null;
    }
    const jitter = this.jitterMs > 0 ? Math.floor(this.random() * this.jitterMs) : 0;
    const delay = this.rotationMs + jitter;
    tracked.nextRenewalAt = Date.now() + delay;
    tracked.rotating = false;

    tracked.timer = this.setTimeoutFn(() => {
      tracked.timer = null;
      this.fireRenewal(tracked);
    }, delay);
    tracked.timer.unref?.();
  }

  private fireRenewal(tracked: Tracked): void {
    tracked.nextRenewalAt = null;
    if (tracked.conn.getState() !== 'OPEN') {
      // Not carrying traffic — nothing to renew; the OPEN state listener will
      // schedule a fresh window when it (re)connects.
      tracked.rotating = false;
      return;
    }
    const inFlight = this.countInFlight();
    if (inFlight >= this.maxConcurrent) {
      this.events?.emit('ws.renewal.postponed', {
        connection: tracked.name,
        reason: 'concurrency',
        retryInMs: this.retryMs,
      });
      tracked.timer = this.setTimeoutFn(() => {
        tracked.timer = null;
        this.fireRenewal(tracked);
      }, this.retryMs);
      tracked.timer.unref?.();
      return;
    }

    tracked.rotating = true;
    const started = tracked.conn.rotateNow();
    this.events?.emit('ws.renewal.started', { connection: tracked.name, started });
    if (!started) {
      // Rotation not applicable (already in flight, or the connection raced
      // to a non-OPEN state); reschedule the window and try again.
      tracked.rotating = false;
      this.scheduleRenewal(tracked);
      return;
    }
    // Completion arrives as `rotated` (swap done) or `rotationFailed`
    // (replacement refused) — both handled by the tracked listeners.
  }

  private countInFlight(): number {
    let count = 0;
    for (const tracked of this.tracked.values()) if (tracked.rotating) count += 1;
    return count;
  }
}
