/**
 * Pre-send rate budget for REST and WebSocket API traffic.
 *
 * Verified inputs:
 * - IP weight is reported per response in `X-MBX-USED-WEIGHT-1M`. WebSocket API
 *   connection and request weight is accumulated per IP and shared by all
 *   connections from that address. One IP pool therefore covers both, which is the
 *   conservative choice: if the real limits were split, we would only throttle more.
 * - Order count is per account, reported in `X-MBX-ORDER-COUNT-10S` and
 *   `X-MBX-ORDER-COUNT-1M`. Rejected orders may omit these headers.
 * - 429 means back off. 418 means the IP is banned, for 2 minutes up to 3 days on
 *   repeat offences.
 *
 * Policy (not from the docs): the rolling windows use a 60 s / 10 s span measured
 * from our own clock, and a server snapshot is treated as expiring one window after
 * its observation. Both choices can only over-wait, never under-count.
 */

export interface RateSentinelLimits {
  /** REQUEST_WEIGHT per minute for this IP. Read it from exchangeInfo.rateLimits. */
  ipWeightPer1m: number;
  /** ORDERS per 10 seconds, per account. */
  ordersPer10s: number;
  /** ORDERS per minute, per account. */
  ordersPer1m: number;
}

export interface RateSentinelRequest {
  /** IP weight this request costs. */
  weight: number;
  /** Orders this request places (0 or omitted for non-order requests). */
  orders?: number;
}

export interface RateSentinelResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
}

export interface RateSentinelOptions {
  limits: RateSentinelLimits;
  /** Clock injection. Default: `Date.now`. */
  now?: () => number;
  /** Lock after a 429 with no Retry-After header. Default 60 000 ms. */
  default429BackoffMs?: number;
  /** First 418 ban without Retry-After. Default 120 000 ms (doc: 2 minutes). */
  ban418BaseMs?: number;
  /** Ceiling for repeat 418 bans. Default 3 days (doc). */
  ban418MaxMs?: number;
}

export interface RateSentinelSnapshot {
  lockedUntilMs: number;
  consecutive418: number;
  serverIpWeight1m: number | undefined;
  serverOrders10s: number | undefined;
  serverOrders1m: number | undefined;
}

const WEIGHT_WINDOW_MS = 60_000;
const ORDERS_10S_MS = 10_000;
const ORDERS_1M_MS = 60_000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

interface Entry {
  at: number;
  n: number;
}

function header(headers: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Minimum wait until `need` more units fit under `limit` in a rolling window of
 * `windowMs`. Entries expire at `at + windowMs`. Returns Infinity when the request
 * cannot fit even into an empty window.
 */
export function windowWaitMs(
  entries: readonly Entry[],
  windowMs: number,
  need: number,
  limit: number,
  at: number,
): number {
  if (need > limit) return Number.POSITIVE_INFINITY;
  const live = entries.filter((e) => e.at + windowMs > at).sort((a, b) => a.at - b.at);
  let total = live.reduce((sum, e) => sum + e.n, 0);
  if (total + need <= limit) return 0;
  for (const e of live) {
    total -= e.n;
    if (total + need <= limit) return Math.max(0, e.at + windowMs - at);
  }
  return Number.POSITIVE_INFINITY;
}

export class DualBucketRateSentinel {
  private readonly limits: RateSentinelLimits;
  private readonly now: () => number;
  private readonly default429BackoffMs: number;
  private readonly ban418BaseMs: number;
  private readonly ban418MaxMs: number;

  private lockedUntil = 0;
  private consecutive418 = 0;

  private serverWeight: { at: number; n: number } | undefined;
  private serverOrders10s: { at: number; n: number } | undefined;
  private serverOrders1m: { at: number; n: number } | undefined;

  private localWeight: Entry[] = [];
  private localOrders: Entry[] = [];

  constructor(options: RateSentinelOptions) {
    for (const [name, value] of Object.entries(options.limits)) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(`DualBucketRateSentinel: ${name} must be a positive number, got ${value}`);
      }
    }
    this.limits = { ...options.limits };
    this.now = options.now ?? Date.now;
    this.default429BackoffMs = options.default429BackoffMs ?? 60_000;
    this.ban418BaseMs = options.ban418BaseMs ?? 120_000;
    this.ban418MaxMs = options.ban418MaxMs ?? THREE_DAYS_MS;
  }

  /**
   * How long to wait before this request may be sent. 0 means send now.
   * Infinity means the request can never fit (its weight or order count exceeds
   * the limit), and the caller must reject it, not wait.
   */
  waitMs(request: RateSentinelRequest, at: number = this.now()): number {
    if (at < this.lockedUntil) return this.lockedUntil - at;

    const weightEntries: Entry[] = [...this.localWeight];
    if (this.serverWeight) weightEntries.push({ at: this.serverWeight.at, n: this.serverWeight.n });
    const weightWait = windowWaitMs(weightEntries, WEIGHT_WINDOW_MS, request.weight, this.limits.ipWeightPer1m, at);

    const orders = request.orders ?? 0;
    if (orders === 0) return weightWait;

    const orders10sEntries: Entry[] = this.localOrders.filter((e) => e.at + ORDERS_10S_MS > at);
    if (this.serverOrders10s) orders10sEntries.push({ at: this.serverOrders10s.at, n: this.serverOrders10s.n });
    const wait10s = windowWaitMs(orders10sEntries, ORDERS_10S_MS, orders, this.limits.ordersPer10s, at);

    const orders1mEntries: Entry[] = [...this.localOrders];
    if (this.serverOrders1m) orders1mEntries.push({ at: this.serverOrders1m.at, n: this.serverOrders1m.n });
    const wait1m = windowWaitMs(orders1mEntries, ORDERS_1M_MS, orders, this.limits.ordersPer1m, at);

    return Math.max(weightWait, wait10s, wait1m);
  }

  /** Record a request that has been dispatched. Call once per send. */
  record(request: RateSentinelRequest, at: number = this.now()): void {
    this.localWeight.push({ at, n: request.weight });
    if (request.orders && request.orders > 0) this.localOrders.push({ at, n: request.orders });
    this.prune(at);
  }

  /** Feed a response. Updates server snapshots, lock state, and the 418 ban counter. */
  observe(response: RateSentinelResponse, at: number = this.now()): void {
    const used = parseCount(header(response.headers, 'x-mbx-used-weight-1m'));
    if (used !== undefined) {
      this.serverWeight = { at, n: used };
      this.localWeight = this.localWeight.filter((e) => e.at > at);
    }
    const count10s = parseCount(header(response.headers, 'x-mbx-order-count-10s'));
    if (count10s !== undefined) {
      this.serverOrders10s = { at, n: count10s };
      this.localOrders = this.localOrders.filter((e) => e.at > at);
    }
    const count1m = parseCount(header(response.headers, 'x-mbx-order-count-1m'));
    if (count1m !== undefined) {
      this.serverOrders1m = { at, n: count1m };
      this.localOrders = this.localOrders.filter((e) => e.at > at);
    }

    const retryAfterMs = this.retryAfterMs(response.headers);

    if (response.status === 429) {
      this.lockedUntil = Math.max(this.lockedUntil, at + (retryAfterMs ?? this.default429BackoffMs));
    } else if (response.status === 418) {
      this.consecutive418 += 1;
      const exponential = this.ban418BaseMs * 2 ** (this.consecutive418 - 1);
      const backoff = Math.min(this.ban418MaxMs, exponential);
      this.lockedUntil = Math.max(this.lockedUntil, at + (retryAfterMs ?? backoff));
    } else if (response.status >= 200 && response.status < 300) {
      this.consecutive418 = 0;
    }
  }

  snapshot(): RateSentinelSnapshot {
    return {
      lockedUntilMs: this.lockedUntil,
      consecutive418: this.consecutive418,
      serverIpWeight1m: this.serverWeight?.n,
      serverOrders10s: this.serverOrders10s?.n,
      serverOrders1m: this.serverOrders1m?.n,
    };
  }

  private retryAfterMs(headers: Readonly<Record<string, string | undefined>>): number | undefined {
    const seconds = parseCount(header(headers, 'retry-after'));
    return seconds === undefined ? undefined : seconds * 1000;
  }

  private prune(at: number): void {
    this.localWeight = this.localWeight.filter((e) => e.at + WEIGHT_WINDOW_MS > at);
    this.localOrders = this.localOrders.filter((e) => e.at + ORDERS_1M_MS > at);
  }
}
