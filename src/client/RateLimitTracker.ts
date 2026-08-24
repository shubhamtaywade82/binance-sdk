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
}

const WEIGHT_HEADER = /^x-mbx-used-weight-(.+)$/i;
const ORDER_COUNT_HEADER = /^x-mbx-order-count-(.+)$/i;

/**
 * Tracks Binance's `X-MBX-USED-WEIGHT-*` / `X-MBX-ORDER-COUNT-*` response headers so callers can
 * back off before hitting `-1003` (IP ban) instead of reacting to it after the fact.
 */
export class RateLimitTracker {
  private readonly weightLimitPerMinute: number;
  private readonly safetyMargin: number;
  private usage: RateLimitUsage = {
    usedWeight: 0,
    usedWeightByInterval: {},
    orderCountByInterval: {},
    lastUpdated: 0,
  };

  constructor(options: RateLimitTrackerOptions = {}) {
    this.weightLimitPerMinute = options.weightLimitPerMinute ?? 6000;
    this.safetyMargin = options.safetyMargin ?? 0.8;
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

  getUsage(): Readonly<RateLimitUsage> {
    return this.usage;
  }

  /**
   * Milliseconds a caller should wait before its next request, based on the most recently
   * observed 1-minute weight usage. Returns 0 when usage is stale or under the safety margin.
   */
  getThrottleDelayMs(): number {
    if (this.safetyMargin >= 1) return 0;
    const oneMinuteWeight = this.usage.usedWeightByInterval['1m'] ?? this.usage.usedWeight;
    if (!oneMinuteWeight) return 0;
    if (Date.now() - this.usage.lastUpdated > 60_000) return 0;

    const threshold = this.weightLimitPerMinute * this.safetyMargin;
    if (oneMinuteWeight < threshold) return 0;

    const msIntoMinute = Date.now() % 60_000;
    return 60_000 - msIntoMinute;
  }
}
