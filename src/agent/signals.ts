/**
 * Agentic futures trading — the confluence scorer.
 *
 * Chapter-7 scoring matrix: each confluence factor scores its full weight
 * or zero, and one factor (book imbalance against the trade) is a hard
 * veto that zeroes the whole signal. The scorer is pure
 * (`scoreFromInputs`); `scoreSymbol` fetches the inputs through the SDK.
 */
import type { BinanceClient } from '../client/BinanceClient.js';
import {
  atr, ema, percentile, sessionVwap, takerRatio, type Bar,
} from './indicators.js';
import type { Regime } from './regime.js';

export type Dir = 'LONG' | 'SHORT';
export type Setup = 'CONTINUATION' | 'SWEEP_FADE';

export interface Signal {
  direction: Dir;
  setup: Setup;
  /** Confluence score, 0-95 against the chapter-7 matrix. */
  score: number;
  /** Hard vetoes — any entry with vetoes is refused regardless of score. */
  vetoes: string[];
  /** Reference entry (last 5m close); used for R math until the fill is known. */
  entryHint: number;
  /** Protective-stop reference for sizing and the hard-stop leg. */
  stopHint: number;
}

/** Normalized inputs to the pure scorer. */
export interface SignalInputs {
  regime: Regime;
  /** Last 5m close (entry reference). */
  close: number;
  /** 5m ATR(14). */
  a5: number;
  /** 15m EMA(20) > EMA(50). */
  e20up: boolean;
  /** Session VWAP. */
  vwap: number;
  /** Top-of-book bid/ask quantity imbalance (bids / asks). */
  imbalance: number;
  /** Taker buy/sell ratio over the last three 5m bars. */
  taker: number;
  /** Open interest rising across the setup window. */
  oiRise: boolean;
  /** Mean funding rate over the last three settlements. */
  avgFunding: number;
  /** Percentile (0..1) of top-trader long/short position ratio within 6h. */
  posPct: number;
  /** Last 5m bar low (long stop reference). */
  lastLow: number;
  /** Last 5m bar high (short stop reference). */
  lastHigh: number;
}

/**
 * The pure scorer. Direction comes from the regime (trend) or from crowd
 * positioning extremes (fade); RANGE regimes trade the sweep fade only.
 * Returns `null` when no direction applies or the stop is too wide to
 * size responsibly (> 1.2 ATR from the reference entry).
 */
export function scoreFromInputs(i: SignalInputs): Signal | null {
  const trendDir: Dir | null =
    i.regime === 'TREND_UP' ? 'LONG' : i.regime === 'TREND_DOWN' ? 'SHORT' : null;
  const dir: Dir | null = trendDir
    ?? (i.posPct >= 0.9 ? 'SHORT' : i.posPct <= 0.1 ? 'LONG' : null);
  if (!dir) return null;

  const long = dir === 'LONG';
  const vetoes: string[] = [];
  let score = 0;

  if ((long && i.e20up) || (!long && !i.e20up)) score += 20; // EMA structure
  if ((long && i.close > i.vwap) || (!long && i.close < i.vwap)) score += 15; // VWAP side
  if ((long && i.imbalance >= 1.5) || (!long && i.imbalance <= 1 / 1.5)) score += 10;
  else if ((long && i.imbalance <= 1 / 1.5) || (!long && i.imbalance >= 1.5)) {
    vetoes.push('BOOK_IMBALANCE_OPPOSITE'); // hard veto
  }
  if ((long && i.taker >= 1.15) || (!long && i.taker <= 0.87)) score += 15; // taker flow
  if (i.oiRise) score += 15; // OI shift
  if (Math.abs(i.avgFunding) < 0.0005) score += 10; // funding posture
  if ((long && i.posPct <= 0.1) || (!long && i.posPct >= 0.9)) score += 10; // crowd skew

  const setup: Setup = i.regime === 'RANGE' ? 'SWEEP_FADE' : 'CONTINUATION';
  const stopHint = long ? i.lastLow - 0.1 * i.a5 : i.lastHigh + 0.1 * i.a5;
  if (Math.abs(i.close - stopHint) > 1.2 * i.a5) return null; // stop too wide

  return { direction: dir, setup, score, vetoes, entryHint: i.close, stopHint };
}

/**
 * Score a symbol: 5m/15m klines, top-20 book depth, 1h of 5m OI history,
 * 6h of top-trader position ratio and the last funding settlements.
 * `dayStartMs` anchors the session VWAP (e.g. UTC midnight).
 */
export async function scoreSymbol(
  client: BinanceClient,
  symbol: string,
  regime: Regime,
  dayStartMs: number,
): Promise<Signal | null> {
  const bars5: Bar[] = await client.futures.market.klines(symbol, '5m', { limit: 120 });
  const bars15: Bar[] = await client.futures.market.klines(symbol, '15m', { limit: 60 });
  const last = bars5.at(-1);
  if (!last || bars15.length === 0) return null;

  const c15 = bars15.map((b) => b.close);
  const e20 = ema(c15, 20).at(-1)!;
  const e50 = ema(c15, 50).at(-1)!;
  const a5 = atr(bars5, 14);

  const book = await client.futures.market.depth(symbol, 20);
  const bidQty = book.bids.reduce((s, l) => s + l.qty, 0);
  const askQty = book.asks.reduce((s, l) => s + l.qty, 0);
  const imbalance = askQty > 0 ? bidQty / askQty : 1;

  const oi = await client.futures.data.openInterestHist(symbol, '5m', 12);
  const oiRise = oi.length >= 2 && oi.at(-1)!.sumOpenInterest > oi[0].sumOpenInterest;

  const topPos = await client.futures.data.topLongShortPositionRatio(symbol, '1h', 6);
  const posNow = topPos.at(-1)?.longShortRatio;
  const posPct = posNow === undefined ? 0.5 : percentile(posNow, topPos.map((t) => t.longShortRatio));

  const fr = await client.futures.data.fundingRateHistory(symbol, { limit: 3 });
  const avgFunding = fr.length > 0
    ? fr.reduce((s, f) => s + f.fundingRate, 0) / fr.length
    : 0;

  return scoreFromInputs({
    regime,
    close: last.close,
    a5,
    e20up: e20 > e50,
    vwap: sessionVwap(bars5, dayStartMs),
    imbalance,
    taker: takerRatio(bars5, 3),
    oiRise,
    avgFunding,
    posPct,
    lastLow: last.low,
    lastHigh: last.high,
  });
}
