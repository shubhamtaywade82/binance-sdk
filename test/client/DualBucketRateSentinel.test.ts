import { describe, expect, it } from 'vitest';
import { DualBucketRateSentinel, windowWaitMs } from '../../src/client/DualBucketRateSentinel.js';

const limits = { ipWeightPer1m: 100, ordersPer10s: 2, ordersPer1m: 50 };

describe('windowWaitMs', () => {
  it('returns 0 when the request fits', () => {
    expect(windowWaitMs([{ at: 0, n: 10 }], 60_000, 5, 100, 1000)).toBe(0);
  });

  it('waits until enough old units expire', () => {
    // 90 used at t=0 expires at 60 000. Need 20 with limit 100: wait for the t=0 entry to age out.
    expect(windowWaitMs([{ at: 0, n: 90 }], 60_000, 20, 100, 1000)).toBe(59_000);
  });

  it('is infinite when the request cannot fit even in an empty window', () => {
    expect(windowWaitMs([], 60_000, 101, 100, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it('ignores entries that have already expired', () => {
    expect(windowWaitMs([{ at: 0, n: 100 }], 60_000, 1, 100, 60_000)).toBe(0);
  });
});

describe('DualBucketRateSentinel', () => {
  it('rejects non-positive limits at construction', () => {
    expect(() => new DualBucketRateSentinel({ limits: { ...limits, ordersPer10s: 0 } })).toThrow(RangeError);
  });

  it('waits for the IP weight window after local usage', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.record({ weight: 90 }, 0);
    expect(s.waitMs({ weight: 20 }, 1000)).toBe(59_000);
    expect(s.waitMs({ weight: 5 }, 1000)).toBe(0);
  });

  it('enforces the 10-second order window separately from the minute window', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.record({ weight: 1, orders: 1 }, 0);
    s.record({ weight: 1, orders: 1 }, 0);
    expect(s.waitMs({ weight: 1, orders: 1 }, 5000)).toBe(5000);
    expect(s.waitMs({ weight: 1, orders: 1 }, 10_000)).toBe(0);
  });

  it('reconciles with the server header snapshot (lowercase header names accepted)', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.observe({ status: 200, headers: { 'x-mbx-used-weight-1m': '95' } }, 0);
    expect(s.waitMs({ weight: 10 }, 1000)).toBe(59_000);
    expect(s.snapshot().serverIpWeight1m).toBe(95);
  });

  it('uses the server order-count header for the 10-second window', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.observe({ status: 200, headers: { 'X-MBX-ORDER-COUNT-10S': '2' } }, 0);
    expect(s.waitMs({ weight: 1, orders: 1 }, 5000)).toBe(5000);
  });

  it('does not change state when order rejections carry no count headers', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.observe({ status: 400, headers: {} }, 0);
    expect(s.snapshot().serverOrders10s).toBeUndefined();
  });

  it('honours Retry-After on 429', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.observe({ status: 429, headers: { 'Retry-After': '3' } }, 0);
    expect(s.waitMs({ weight: 1 }, 1000)).toBe(2000);
  });

  it('falls back to the default 429 backoff without Retry-After', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.observe({ status: 429, headers: {} }, 0);
    expect(s.waitMs({ weight: 1 }, 0)).toBe(60_000);
  });

  it('doubles 418 bans from 2 minutes, capped at 3 days, and resets on success', () => {
    const s = new DualBucketRateSentinel({ limits });
    s.observe({ status: 418, headers: {} }, 0);
    expect(s.snapshot().lockedUntilMs).toBe(120_000);
    s.observe({ status: 418, headers: {} }, 200_000);
    expect(s.snapshot().lockedUntilMs).toBe(200_000 + 240_000);
    for (let i = 0; i < 20; i++) s.observe({ status: 418, headers: {} }, 0);
    expect(s.snapshot().lockedUntilMs).toBeLessThanOrEqual(3 * 24 * 60 * 60 * 1000);
    s.observe({ status: 200, headers: {} }, 1);
    expect(s.snapshot().consecutive418).toBe(0);
  });

  it('returns Infinity when a single request can never fit', () => {
    const s = new DualBucketRateSentinel({ limits });
    expect(s.waitMs({ weight: 101 }, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});
