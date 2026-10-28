/**
 * Agentic futures trading — the five-state regime classifier.
 *
 * A regime is the *context* every downstream decision is made in; the
 * classifier refuses to guess (returns CHAOS) when inputs conflict.
 * The decision tree is pure (`classifyFromInputs`) so it can be tested
 * exhaustively; `classifyRegime` fetches the inputs through the SDK.
 */
import type { BinanceClient } from '../client/BinanceClient.js';
import { atr, ema, percentile, type Bar } from './indicators.js';

export type Regime = 'TREND_UP' | 'TREND_DOWN' | 'RANGE' | 'SQUEEZE' | 'CHAOS';

/** The five inputs the decision tree consumes, all normalized. */
export interface RegimeInputs {
  /** 15m EMA(20) — trend fast leg. */
  e20: number;
  /** 15m EMA(50) — trend slow leg. */
  e50: number;
  /** Percentile (0..1) of current 15-bar ATR within its own recent distribution. */
  atrPct: number;
  /** Z-score of the latest funding rate within its 90-period history. */
  fundingZ: number;
  /** Relative change in open-interest value over the lookback (e.g. +0.03 = +3%). */
  oiSlope: number;
}

/**
 * The deterministic decision tree.
 *
 * - CHAOS wins first: ATR in its top 15% or funding beyond ±2σ means the
 *   tape is unreadable and every setup is skipped.
 * - SQUEEZE: ATR in its bottom 20% — nothing to trade, but breakout watch.
 * - TREND: ATR at or above its 40th percentile with OI flat-or-rising, EMA
 *   structure agreeing, funding not at an extreme against the direction.
 * - RANGE: moderate ATR with OI quiet (|slope| <= 2%) — sweep-fade country.
 * - Anything conflicting falls through to CHAOS: refuse to guess.
 */
export function classifyFromInputs(i: RegimeInputs): Regime {
  if (i.atrPct >= 0.85 || Math.abs(i.fundingZ) >= 2) return 'CHAOS';
  if (i.atrPct <= 0.2) return 'SQUEEZE';
  if (i.atrPct >= 0.4 && i.oiSlope >= -0.01) {
    if (i.e20 > i.e50 && i.fundingZ < 2) return 'TREND_UP';
    if (i.e20 < i.e50 && i.fundingZ > -2) return 'TREND_DOWN';
  }
  if (i.atrPct <= 0.6 && Math.abs(i.oiSlope) <= 0.02) return 'RANGE';
  return 'CHAOS';
}

/**
 * Classify a symbol's regime from live data: 300 x 15m klines (EMA structure
 * and the ATR distribution), 90 funding settlements (z-score) and 12h of 5m
 * open-interest history (slope).
 */
export async function classifyRegime(
  client: BinanceClient,
  symbol: string,
): Promise<Regime> {
  const bars: Bar[] = await client.futures.market.klines(symbol, '15m', { limit: 300 });
  if (bars.length < 20) return 'CHAOS'; // not enough history to classify honestly

  const closes = bars.map((b) => b.close);
  const e20 = ema(closes, 20).at(-1)!;
  const e50 = ema(closes, 50).at(-1)!;

  // ATR percentile: current 15-bar ATR vs. non-overlapping-ish 15-bar windows
  // sampled every 5 bars across the series (windows that end at least one
  // window before the end, so the baseline does not include the present).
  const win = 15;
  const atrNow = atr(bars.slice(-win), win);
  const atrHist: number[] = [];
  for (let i = 0; i + 2 * win <= bars.length; i += 5) {
    atrHist.push(atr(bars.slice(i, i + win), win));
  }
  const atrPct = percentile(atrNow, atrHist);

  // Funding z-score over the last 90 settlements.
  const funding = await client.futures.data.fundingRateHistory(symbol, { limit: 90 });
  const fr = funding.map((f) => f.fundingRate);
  let fundingZ = 0;
  if (fr.length > 0) {
    const last = fr.at(-1)!;
    const mean = fr.reduce((a, b) => a + b, 0) / fr.length;
    const variance = fr.reduce((a, b) => a + (b - mean) ** 2, 0) / fr.length;
    const sd = Math.sqrt(variance);
    fundingZ = sd > 0 ? (last - mean) / sd : 0;
  }

  // Open-interest slope over 12h of 5m periods.
  const oi = await client.futures.data.openInterestHist(symbol, '5m', 12 * 12);
  let oiSlope = 0;
  if (oi.length >= 2 && oi[0].sumOpenInterestValue > 0) {
    oiSlope = (oi.at(-1)!.sumOpenInterestValue - oi[0].sumOpenInterestValue)
      / oi[0].sumOpenInterestValue;
  }

  return classifyFromInputs({ e20, e50, atrPct, fundingZ, oiSlope });
}
