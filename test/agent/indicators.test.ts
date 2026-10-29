import { describe, expect, it } from 'vitest';
import {
  atr, closedBars, ema, percentile, sessionVwap, takerRatio, type Bar,
} from '../../src/agent/indicators.js';

function bar(over: Partial<Bar> & { openTime: number; close: number }): Bar {
  return {
    open: over.close, high: over.close, low: over.close, volume: 100,
    quoteAssetVolume: 100 * over.close, takerBuyBaseVolume: 50,
    ...over,
  } as Bar;
}

describe('ema', () => {
  it('seeds with the first value and converges toward later values', () => {
    const out = ema([10, 10, 10, 10], 3);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(10);
    // A single spike pulls the EMA partway, never fully, toward the spike.
    const spiked = ema([10, 10, 20], 3);
    const k = 2 / 4;
    const expected = (10 * k + 10 * (1 - k)) * (1 - k) + 20 * k;
    expect(spiked[2]).toBeCloseTo(expected, 10);
    expect(spiked[2]).toBeGreaterThan(10);
    expect(spiked[2]).toBeLessThan(20);
  });

  it('returns [] for empty input', () => {
    expect(ema([], 5)).toEqual([]);
  });
});

describe('atr', () => {
  it('computes the mean true range across the window', () => {
    const bars: Bar[] = [
      bar({ openTime: 1, close: 100 }),
      bar({ openTime: 2, close: 110, high: 112, low: 108 }),
      bar({ openTime: 3, close: 105, high: 106, low: 100 }),
    ];
    // TR1 = max(112-108, |112-100|, |108-100|) = 12
    // TR2 = max(106-100, |106-110|, |100-110|) = 10
    expect(atr(bars, 14)).toBeCloseTo(11, 10);
  });

  it('handles single- and zero-bar inputs', () => {
    expect(atr([], 14)).toBe(0);
    expect(atr([bar({ openTime: 1, close: 100, high: 105, low: 95 })], 14)).toBe(10);
  });
});

describe('percentile (midrank convention)', () => {
  it('ranks current within history as a fraction, counting itself as half', () => {
    // Midrank: (strictlyBelow + 0.5 x ties) / n — the observation counts as
    // half of one sample, so inclusive data never pins the rank at 1.
    expect(percentile(5, [1, 2, 3, 4, 5])).toBeCloseTo(0.9, 10);
    expect(percentile(0, [1, 2, 3])).toBeCloseTo(0, 10);
    expect(percentile(2.5, [1, 2, 3, 4])).toBeCloseTo(0.5, 10);
  });

  it('both tails are reachable — the crowd-extreme gates can actually fire', () => {
    // With n=6 the old (count <= current)/n convention floored every rank at
    // 1/6 ≈ 0.167, so the scorer's posPct <= 0.1 / >= 0.9 gates were dead code.
    // The scorer's current value IS the last history element, so the extremes
    // are the history's own min/max.
    const history = [1.2, 1.3, 1.4, 1.5, 1.6, 1.7];
    expect(percentile(1.2, history)).toBeCloseTo(1 / 12, 10); // ≈ 0.083 ≤ 0.1 ✓
    expect(percentile(1.7, history)).toBeCloseTo(11 / 12, 10); // ≈ 0.917 ≥ 0.9 ✓
    // Values outside the history reach the full 0..1 range.
    expect(percentile(1.1, history)).toBe(0);
    expect(percentile(1.8, history)).toBe(1);
  });

  it('handles ties symmetrically', () => {
    // below:1, ties:2 -> (1 + 0.5 x 2) / 4 = 0.5 — dead centre, as ties should be.
    expect(percentile(2, [1, 2, 2, 3])).toBeCloseTo(0.5, 10);
  });

  it('returns 0.5 for empty history', () => {
    expect(percentile(1, [])).toBe(0.5);
  });
});

describe('closedBars', () => {
  const base = { open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, quoteAssetVolume: 15, takerBuyBaseVolume: 5 };

  it('drops the trailing bar whose closeTime is still in the future', () => {
    const bars = [
      { ...base, openTime: 1, closeTime: 100 },
      { ...base, openTime: 2, closeTime: 900 }, // forming: closes at 900, now = 500
    ];
    const closed = closedBars(bars as Bar[], 500);
    expect(closed).toHaveLength(1);
    expect(closed[0].openTime).toBe(1);
  });

  it('keeps every bar when the last one already closed', () => {
    const bars = [
      { ...base, openTime: 1, closeTime: 100 },
      { ...base, openTime: 2, closeTime: 400 },
    ];
    expect(closedBars(bars as Bar[], 500)).toHaveLength(2);
  });

  it('keeps bars without closeTime (hand-built test data stays usable)', () => {
    const bars = [{ ...base, openTime: 1 }, { ...base, openTime: 2 }] as Bar[];
    expect(closedBars(bars, 500)).toHaveLength(2);
  });
});

describe('sessionVwap', () => {
  it('weights typical price by volume, ignoring bars before sinceMs', () => {
    const bars: Bar[] = [
      bar({ openTime: 1, close: 50, volume: 1000 }), // before window -> excluded
      bar({ openTime: 2, close: 100, high: 110, low: 90, volume: 100 }),
      bar({ openTime: 3, close: 200, high: 210, low: 190, volume: 300 }),
    ];
    // typical1 = 100, typical2 = 200 -> (100*100 + 200*300) / 400 = 175
    expect(sessionVwap(bars, 2)).toBeCloseTo(175, 10);
  });

  it('falls back to the last close when nothing qualifies', () => {
    const bars = [bar({ openTime: 1, close: 42 })];
    expect(sessionVwap(bars, 10)).toBe(42);
    expect(sessionVwap([], 10)).toBe(0);
  });
});

describe('takerRatio', () => {
  it('is buy pressure over sell pressure', () => {
    const bars: Bar[] = [
      bar({ openTime: 1, close: 100, volume: 100, takerBuyBaseVolume: 60 }),
      bar({ openTime: 2, close: 100, volume: 100, takerBuyBaseVolume: 60 }),
    ];
    // buy = 120, sell = 200 - 120 = 80 -> 1.5
    expect(takerRatio(bars, 3)).toBeCloseTo(1.5, 10);
  });

  it('is 1 when there is no volume', () => {
    expect(takerRatio([], 3)).toBe(1);
    expect(takerRatio([bar({ openTime: 1, close: 1, volume: 0, takerBuyBaseVolume: 0 })], 3)).toBe(1);
  });
});
