/**
 * Paper-mode exit management — the state machine the session loop drives.
 *
 * The paper simulator only rests MARKET/LIMIT orders, so the session loop
 * closes positions itself from the entry's protective levels. The original
 * loop computed every partial exit from the *original* entry quantity and
 * closed `closeFraction(1)` for terminal exits — which submits the whole
 * original size again after partial take-profits. Because the simulator
 * treats an oversized opposing fill as "reduce, then flip the remainder",
 * that sequence leaves a *reversed* position instead of a flat one.
 *
 * This module fixes the accounting: partial exits (TP1/TP2) take their
 * fraction of the ORIGINAL entry size, and terminal exits (stop, time stop,
 * trailing stop) close exactly the REMAINING quantity. Every terminal path
 * leaves the position flat — the quantities are pure and unit-testable, and
 * `applyExit` only runs after the order actually filled.
 */
import { DEFAULT_PROFILE, type AgentProfile } from './config.js';
import type { Dir } from './signals.js';
import type { EntryResult } from './execute.js';

/** A position the paper session loop is managing toward an exit. */
export interface ManagedPosition {
  symbol: string;
  side: Dir;
  /** Original entry quantity (exchange-ready string). */
  quantity: string;
  /** Quantity still open — decremented by every applied exit. */
  remaining: number;
  openedAt: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp1Done: boolean;
  tp2Done: boolean;
  /** Extremum since entry (high for longs, low for shorts), for the trail. */
  highWater: number;
}

/** One exit the loop should submit now (`null` = hold). */
export interface ExitDecision {
  reason: 'stop' | 'time-stop' | 'trail' | 'tp1' | 'tp2';
  /** Absolute quantity to close — a partial fraction of the original size, or the whole remaining quantity for terminal exits. */
  quantity: number;
  /** True when this exit ends the trade (stop / time stop / trailing stop). */
  terminal: boolean;
}

/** Wrap a fresh {@link EntryResult} into a manageable position. */
export function toManagedPosition(res: EntryResult): ManagedPosition {
  return {
    symbol: res.symbol,
    side: res.side,
    quantity: res.quantity,
    remaining: Number(res.quantity),
    openedAt: Date.now(),
    stopPrice: res.stopPrice,
    tp1Price: res.tp1Price,
    tp2Price: res.tp2Price,
    tp1Done: false,
    tp2Done: false,
    highWater: res.entryPrice,
  };
}

/** Fold a newly observed price into the trailing-stop extremum. */
export function updateHighWater(pos: ManagedPosition, price: number): void {
  pos.highWater = pos.side === 'LONG'
    ? Math.max(pos.highWater, price)
    : Math.min(pos.highWater, price);
}

/**
 * Next exit action for a managed position at `price`, or `null` when nothing
 * triggers. Priority: hard stop → time stop → TP1 → TP2 → trailing stop.
 *
 * Terminal exits close **exactly the remaining quantity** (never more — an
 * over-sized opposing fill is what flips a paper position); partial exits
 * take their fraction of the *original* size, bounded by what remains.
 */
export function nextExitAction(
  pos: ManagedPosition,
  price: number,
  now = Date.now(),
  profile: AgentProfile = DEFAULT_PROFILE,
): ExitDecision | null {
  const long = pos.side === 'LONG';

  const stopHit = long ? price <= pos.stopPrice : price >= pos.stopPrice;
  if (stopHit) return { reason: 'stop', quantity: pos.remaining, terminal: true };

  if (now - pos.openedAt > profile.timeStopHours * 3_600_000) {
    return { reason: 'time-stop', quantity: pos.remaining, terminal: true };
  }

  const original = Number(pos.quantity);
  if (!pos.tp1Done && (long ? price >= pos.tp1Price : price <= pos.tp1Price)) {
    return { reason: 'tp1', quantity: Math.min(original * 0.4, pos.remaining), terminal: false };
  }
  if (!pos.tp2Done && (long ? price >= pos.tp2Price : price <= pos.tp2Price)) {
    return { reason: 'tp2', quantity: Math.min(original * 0.3, pos.remaining), terminal: false };
  }

  const trailHit = pos.tp2Done
    && (long
      ? price <= pos.highWater * (1 - profile.trailCallbackPct / 100)
      : price >= pos.highWater * (1 + profile.trailCallbackPct / 100));
  if (trailHit) return { reason: 'trail', quantity: pos.remaining, terminal: true };

  return null;
}

/**
 * Book a successfully-filled exit: decrement the remaining quantity and mark
 * partial levels done. Call this only after the order actually filled, so a
 * rejected exit is retried with the same remaining quantity (and the same
 * intent id) on the next cycle.
 */
export function applyExit(pos: ManagedPosition, decision: ExitDecision): void {
  pos.remaining -= decision.quantity;
  if (pos.remaining <= 1e-12) pos.remaining = 0;
  if (decision.reason === 'tp1') pos.tp1Done = true;
  if (decision.reason === 'tp2') pos.tp2Done = true;
}
