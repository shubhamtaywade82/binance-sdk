import { describe, expect, it } from 'vitest';
import { exponentialBackoff, fixedBackoff, linearBackoff } from '../../../src/ws/platform/ReconnectPolicy.js';

describe('ReconnectPolicy', () => {
  it('exponential: raw shape without jitter (deterministic mode)', () => {
    const policy = exponentialBackoff({ baseMs: 1000, maxMs: 30_000, jitter: false });
    expect(policy.delayForMs(0)).toBe(1000);
    expect(policy.delayForMs(1)).toBe(2000);
    expect(policy.delayForMs(2)).toBe(4000);
    expect(policy.delayForMs(4)).toBe(16_000);
    expect(policy.delayForMs(10)).toBe(30_000); // capped
    expect(policy.delayForMs(20)).toBe(30_000);
  });

  it('exponential: equal jitter bounds — always within [raw/2, raw]', () => {
    const policy = exponentialBackoff({
      baseMs: 1000,
      maxMs: 30_000,
      random: () => 0,
    });
    // random()=0 → raw/2 (minimum of the jitter window)
    expect(policy.delayForMs(0)).toBe(500);
    expect(policy.delayForMs(3)).toBe(4000);

    const full = exponentialBackoff({ baseMs: 1000, random: () => 0.9999 });
    expect(full.delayForMs(0)).toBeLessThan(1000);
    expect(full.delayForMs(0)).toBeGreaterThanOrEqual(500);
  });

  it('exponential: never below half, never above raw, across attempts', () => {
    const policy = exponentialBackoff({ baseMs: 700, maxMs: 5_000, random: () => 0.42 });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const raw = Math.min(700 * 2 ** attempt, 5_000);
      const delay = policy.delayForMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(Math.floor(raw / 2));
      expect(delay).toBeLessThanOrEqual(raw);
    }
  });

  it('exponential: tolerates negative attempt indices', () => {
    const policy = exponentialBackoff({ baseMs: 1000, jitter: false });
    expect(policy.delayForMs(-5)).toBe(1000);
  });

  it('fixed: constant delay regardless of attempt', () => {
    const policy = fixedBackoff(2500);
    expect(policy.delayForMs(0)).toBe(2500);
    expect(policy.delayForMs(9)).toBe(2500);
  });

  it('fixed: clamps negative delays to zero', () => {
    expect(fixedBackoff(-100).delayForMs(0)).toBe(0);
  });

  it('linear: base * (attempt + 1), capped at max', () => {
    const policy = linearBackoff({ baseMs: 500, maxMs: 2_000 });
    expect(policy.delayForMs(0)).toBe(500);
    expect(policy.delayForMs(1)).toBe(1000);
    expect(policy.delayForMs(2)).toBe(1500);
    expect(policy.delayForMs(3)).toBe(2000); // capped
    expect(policy.delayForMs(7)).toBe(2000);
  });
});
