import type { EventEmitter } from 'node:events';

export interface RateLimitUsage {
  /** Highest `x-mbx-used-weight-*` value seen across all interval headers on the last response. */
  usedWeight: number;
  /** Per-header-suffix used-weight snapshot, e.g. `{ '1m': 120 }`. */
  usedWeightByInterval: Record<string, number>;
  /** Per-header-suffix order-count snapshot, e.g. `{ '10s': 3, '1d': 45 }`. */
  orderCountByInterval: Record<string, number>;
  lastUpdated: number;
}

export interface RateLimitTrackerOptions {
  /** Assumed weight-per-minute ceiling used to compute throttling delay. Binance's default IP limit is 6000 for most REST hosts. */
  weightLimitPerMinute?: number;
  /** Fraction of the weight limit at which the tracker starts delaying requests (0-1). Set >=1 to disable throttling. */
  safetyMargin?: number;
  /**
   * ORDERS limit per 10 seconds for this account. No default: order throttling stays off
   * until the caller supplies the limit (read it from exchangeInfo.rateLimits).
   */
  ordersPer10s?: number;
  /** ORDERS limit per minute for this account. No default; see ordersPer10s. */
  ordersPer1m?: number;
}

/** A `rateLimits` entry as returned in a WS API response. */
export interface WsRateLimitEntry {
  rateLimitType: string;
  interval: string;
  intervalNum: number;
  limit: number;
  count: number;
}

const WEIGHT_HEADER = /^x-mbx-used-weight-(.+)$/i;
const ORDER_COUNT_HEADER = /^x-mbx-order-count-(.+)$/i;

/**
 * Tracks Binance's `X-MBX-USED-WEIGHT-*` / `X-MBX-ORDER-COUNT-*` response headers, and the
 * WS API `rateLimits` blocks, so callers can back off before hitting `-1003` or `-1015`.
 */
export class RateLimitTracker {
  private readonly weightLimitPerMinute: number;
  private readonly safetyMargin: number;
  private readonly ordersPer10s: number | undefined;
  private readonly ordersPer1m: number | undefined;
  private usage: RateLimitUsage = {
    usedWeight: 0,
    usedWeightByInterval: {},
    orderCountByInterval: {},
    lastUpdated: 0,
  };

  constructor(options: RateLimitTrackerOptions = {}) {
    this.weightLimitPerMinute = options.weightLimitPerMinute ?? 6000;
    this.safetyMargin = options.safetyMargin ?? 0.8;
    this.ordersPer10s = options.ordersPer10s;
    this.ordersPer1m = options.ordersPer1m;
  }

  update(headers: Record<string, string> | undefined): void {
    if (!headers) return;
    const usedWeightByInterval: Record<string, number> = {};
    const orderCountByInterval: Record<string, number> = {};

    for (const [key, value] of Object.entries(headers)) {
      const weightMatch = key.match(WEIGHT_HEADER);
      if (weightMatch?.[1]) {
        usedWeightByInterval[weightMatch[1]] = Number(value);
        continue;
      }
      const orderMatch = key.match(ORDER_COUNT_HEADER);
      if (orderMatch?.[1]) {
        orderCountByInterval[orderMatch[1]] = Number(value);
      }
    }

    if (Object.keys(usedWeightByInterval).length === 0 && Object.keys(orderCountByInterval).length === 0) {
      return;
    }

    this.usage = {
      usedWeight: Math.max(0, ...Object.values(usedWeightByInterval)),
      usedWeightByInterval,
      orderCountByInterval,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Merge the `rateLimits` array from a WS API response. Only REQUEST_WEIGHT per minute and
   * ORDERS per 10 seconds / per minute are mapped, which are the windows the tracker reads.
   * Other entries are ignored.
   */
  observeWsRateLimits(entries: unknown): void {
    if (!Array.isArray(entries)) return;
    const weight = { ...this.usage.usedWeightByInterval };
    const orders = { ...this.usage.orderCountByInterval };
    let touched = false;
    for (const entry of entries as Partial<WsRateLimitEntry>[]) {
      if (typeof entry?.count !== 'number') continue;
      if (entry.rateLimitType === 'REQUEST_WEIGHT' && entry.interval === 'MINUTE' && entry.intervalNum === 1) {
        weight['1m'] = entry.count;
        touched = true;
      } else if (entry.rateLimitType === 'ORDERS' && entry.interval === 'SECOND' && entry.intervalNum === 10) {
        orders['10s'] = entry.count;
        touched = true;
      } else if (entry.rateLimitType === 'ORDERS' && entry.interval === 'MINUTE' && entry.intervalNum === 1) {
        orders['1m'] = entry.count;
        touched = true;
      }
    }
    if (!touched) return;
    this.usage = {
      usedWeight: Math.max(0, ...Object.values(weight)),
      usedWeightByInterval: weight,
      orderCountByInterval: orders,
      lastUpdated: Date.now(),
    };
  }

  getUsage(): Readonly<RateLimitUsage> {
    return this.usage;
  }

  /**
   * Milliseconds a caller should wait before its next request. The larger of the 1-minute
   * weight delay and the order-burst delays. Returns 0 when usage is stale or under the margin.
   */
  getThrottleDelayMs(): number {
    if (this.safetyMargin >= 1) return 0;
    return Math.max(this.weightThrottleMs(), this.orderThrottleMs());
  }

  private isFresh(windowMs: number): boolean {
    return Date.now() - this.usage.lastUpdated <= windowMs;
  }

  private weightThrottleMs(): number {
    const oneMinuteWeight = this.usage.usedWeightByInterval['1m'] ?? this.usage.usedWeight;
    if (!oneMinuteWeight) return 0;
    if (!this.isFresh(60_000)) return 0;

    const threshold = this.weightLimitPerMinute * this.safetyMargin;
    if (oneMinuteWeight < threshold) return 0;

    const msIntoMinute = Date.now() % 60_000;
    return 60_000 - msIntoMinute;
  }

  /** Delay until the next window boundary when an order burst reaches the margin. */
  private orderThrottleMs(): number {
    const now = Date.now();
    let delay = 0;
    if (this.ordersPer10s !== undefined && this.isFresh(10_000)) {
      const count = this.usage.orderCountByInterval['10s'] ?? 0;
      if (count >= this.ordersPer10s * this.safetyMargin) delay = Math.max(delay, 10_000 - (now % 10_000));
    }
    if (this.ordersPer1m !== undefined && this.isFresh(60_000)) {
      const count = this.usage.orderCountByInterval['1m'] ?? 0;
      if (count >= this.ordersPer1m * this.safetyMargin) delay = Math.max(delay, 60_000 - (now % 60_000));
    }
    return delay;
  }
}

/** Feed a WS API client's `rateLimits` events into a tracker. */
export function attachWsRateLimits(
  source: Pick<EventEmitter, 'on'>,
  tracker: RateLimitTracker,
): void {
  source.on('rateLimits', (entries: unknown) => tracker.observeWsRateLimits(entries));
}
