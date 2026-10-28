/**
 * Agentic futures trading — deterministic math on klines.
 *
 * Pure functions only: no client, no clock, no I/O. Every consumer
 * (`regime.ts`, `signals.ts`) fetches klines through the SDK and feeds
 * them in, which keeps the math unit-testable and reproducible.
 */

/**
 * Structural subset of the SDK's `Kline` the indicators consume. Declared
 * locally (rather than imported) so the agent layer stays decoupled from
 * SDK type re-export churn — anything with these numeric fields works.
 */
export interface Bar {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteAssetVolume: number;
  takerBuyBaseVolume: number;
}

/** Exponential moving average over `values`; index i uses data up to and including i. */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * Average true range over the last `period` bars (Simple MA of the TR).
 * When fewer than `period + 1` bars are available the average is taken
 * over the terms that exist — an honest estimate, never an overstatement.
 */
export function atr(bars: Bar[], period = 14): number {
  if (bars.length === 0) return 0;
  if (bars.length === 1) return bars[0].high - bars[0].low;
  const start = Math.max(1, bars.length - period);
  let sum = 0;
  let terms = 0;
  for (let i = start; i < bars.length; i++) {
    const p = bars[i - 1];
    sum += Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - p.close),
      Math.abs(bars[i].low - p.close),
    );
    terms++;
  }
  return terms > 0 ? sum / terms : 0;
}

/** Percentile of `current` within `history`, as a 0..1 fraction. Empty history -> 0.5. */
export function percentile(current: number, history: number[]): number {
  if (history.length === 0) return 0.5;
  const below = history.filter((h) => h <= current).length;
  return below / history.length;
}

/** Volume-weighted average price of bars since `sinceMs`; last close when no bars qualify. */
export function sessionVwap(bars: Bar[], sinceMs: number): number {
  let pv = 0;
  let v = 0;
  for (const b of bars) {
    if (b.openTime < sinceMs) continue;
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * b.volume;
    v += b.volume;
  }
  return v > 0 ? pv / v : (bars.at(-1)?.close ?? 0);
}

/**
 * Taker buy/sell ratio over the last `lookback` bars.
 * > 1 = taker buy pressure, < 1 = taker sell pressure, 1 = balanced (or no volume).
 */
export function takerRatio(bars: Bar[], lookback = 3): number {
  let buy = 0;
  let tot = 0;
  for (const b of bars.slice(-lookback)) {
    buy += b.takerBuyBaseVolume;
    tot += b.volume;
  }
  const sell = tot - buy;
  return sell > 0 ? buy / sell : 1;
}
