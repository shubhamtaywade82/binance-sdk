import { describe, expect, it, vi } from 'vitest';
import { RateLimitTracker } from '../../src/client/RateLimitTracker.js';

describe('RateLimitTracker', () => {
  it('parses used-weight and order-count headers', () => {
    const tracker = new RateLimitTracker();
    tracker.update({ 'x-mbx-used-weight-1m': '120', 'x-mbx-order-count-10s': '3', 'content-type': 'application/json' });

    const usage = tracker.getUsage();
    expect(usage.usedWeight).toBe(120);
    expect(usage.usedWeightByInterval['1m']).toBe(120);
    expect(usage.orderCountByInterval['10s']).toBe(3);
  });

  it('ignores updates with no rate-limit headers', () => {
    const tracker = new RateLimitTracker();
    tracker.update({ 'x-mbx-used-weight-1m': '50' });
    tracker.update({ 'content-type': 'application/json' });

    expect(tracker.getUsage().usedWeightByInterval['1m']).toBe(50);
  });

  it('does not throttle below the safety margin', () => {
    const tracker = new RateLimitTracker({ weightLimitPerMinute: 1000, safetyMargin: 0.8 });
    tracker.update({ 'x-mbx-used-weight-1m': '500' });
    expect(tracker.getThrottleDelayMs()).toBe(0);
  });

  it('throttles once usage crosses the safety margin', () => {
    const tracker = new RateLimitTracker({ weightLimitPerMinute: 1000, safetyMargin: 0.8 });
    tracker.update({ 'x-mbx-used-weight-1m': '850' });
    expect(tracker.getThrottleDelayMs()).toBeGreaterThan(0);
  });

  it('never throttles when safetyMargin is 1 or greater', () => {
    const tracker = new RateLimitTracker({ weightLimitPerMinute: 1000, safetyMargin: 1 });
    tracker.update({ 'x-mbx-used-weight-1m': '999' });
    expect(tracker.getThrottleDelayMs()).toBe(0);
  });

  it('ignores stale usage snapshots older than a minute', () => {
    const tracker = new RateLimitTracker({ weightLimitPerMinute: 1000, safetyMargin: 0.8 });
    tracker.update({ 'x-mbx-used-weight-1m': '900' });

    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);
    expect(tracker.getThrottleDelayMs()).toBe(0);
    vi.useRealTimers();
  });
});
