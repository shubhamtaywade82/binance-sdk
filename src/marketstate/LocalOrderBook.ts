import { EventEmitter } from 'node:events';
import { addExact, cmpExact, divExact, mulExact, parseExact, subExact, toExactString, toNumber } from '../util/decimal.js';

/** A quantity string is "remove this level" iff it represents zero exactly. */
function isZeroQuantity(qty: string): boolean {
  return /^0*(\.0*)?$/.test(qty.trim());
}

/**
 * Canonical decimal string: same value, one representation ('60000.10' and
 * '60000.1' both become '60000.1'). REST snapshots arrive number-parsed while
 * WS diffs carry raw exchange strings — canonicalizing keys on entry is what
 * stops the same price from existing twice under different formatting.
 */
function canonical(value: string): string {
  return toExactString(parseExact(value));
}

/** A price level with its exact decimal quantities, as the exchange transmits them. */
export interface BookLevel {
  price: string;
  quantity: string;
}

export type OrderBookSide = 'bids' | 'asks';

export interface OrderBookSnapshot {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

export interface OrderBookDiff {
  /** First update id in the event. */
  U?: number;
  /** Final update id in the event (inclusive). */
  u: number;
  /** The final update id of the *previous* event (futures diff streams only). */
  pu?: number;
  bids: [string, string][];
  asks: [string, string][];
}

export interface LocalOrderBookOptions {
  /**
   * Sequence semantics per product:
   * - 'futures': diffs carry `pu` (previous final update id); a diff applies when
   *   `pu === lastUpdateId` (or `U <= lastUpdateId+1 <= u` for the first diff).
   * - 'spot': a diff applies when `U <= lastUpdateId+1 <= u`.
   */
  variant: 'futures' | 'spot';
  /** Price/quantity sort tolerance is not needed — comparisons are exact. */
}

export interface BookTop {
  bestBid: BookLevel | null;
  bestAsk: BookLevel | null;
}

/**
 * Maintains coherent L2 order-book state from a REST depth snapshot plus the
 * WebSocket depth diff stream, following Binance's documented synchronization
 * procedure:
 *
 * 1. Open the diff stream; buffer events.
 * 2. Fetch the snapshot (lastUpdateId).
 * 3. Drop buffered events with `u < lastUpdateId + 1` (futures: `u < lastUpdateId`).
 * 4. The first applied diff must bridge the snapshot (`U <= lastUpdateId+1 <= u`).
 * 5. Apply every subsequent diff in order; any gap emits 'desync' and the book
 *    stops dispatching until a fresh snapshot is applied.
 *
 * All bookkeeping uses exact decimal strings — no float rounding in price
 * levels, ordering, or quantity arithmetic. Analytical outputs (spread,
 * imbalance, microprice) are converted to number at the API boundary.
 */
export class LocalOrderBook extends EventEmitter {
  private readonly bids = new Map<string, string>();
  private readonly asks = new Map<string, string>();
  private lastUpdateId = 0;
  private syncedFlag = false;
  private readonly buffer: OrderBookDiff[] = [];
  private readonly variant: 'futures' | 'spot';

  constructor(options: LocalOrderBookOptions) {
    super();
    this.variant = options.variant;
  }

  /** Whether the book is currently in sync (snapshot applied, no sequence gaps). */
  get synced(): boolean {
    return this.syncedFlag;
  }

  get lastUpdateIdSynced(): number {
    return this.lastUpdateId;
  }

  /** Number of buffered diffs awaiting a snapshot. */
  get bufferedDiffCount(): number {
    return this.buffer.length;
  }

  /** Replace all state with a REST snapshot; buffered diffs are replayed if contiguous. */
  applySnapshot(snapshot: OrderBookSnapshot): void {
    this.bids.clear();
    this.asks.clear();
    this.lastUpdateId = snapshot.lastUpdateId;
    for (const [price, qty] of snapshot.bids) {
      if (!isZeroQuantity(qty)) this.bids.set(canonical(price), canonical(qty));
    }
    for (const [price, qty] of snapshot.asks) {
      if (!isZeroQuantity(qty)) this.asks.set(canonical(price), canonical(qty));
    }

    this.syncedFlag = true;
    const buffered = this.buffer.splice(0, this.buffer.length);
    for (const diff of buffered) {
      if (!this.applyDiff(diff)) break; // a gap in the buffer stops replay
    }
    this.emit('snapshot', snapshot.lastUpdateId);
    this.emit('synced');
  }

  /**
   * Apply one diff. Returns true if applied (or dropped as stale), false if
   * buffered pending a snapshot. A sequence gap desynchronizes the book:
   * 'desync' is emitted and the caller should fetch a fresh snapshot.
   */
  applyDiff(diff: OrderBookDiff): boolean {
    if (!this.syncedFlag) {
      this.buffer.push(diff);
      if (this.buffer.length > 10_000) this.buffer.shift();
      return false;
    }

    // Stale diff: entirely before our synced point.
    if (this.isStale(diff)) return true;

    // The first bridging condition after a snapshot (or any event that fails
    // the continuity check) determines applicability.
    if (!this.isContiguous(diff)) {
      this.syncedFlag = false;
      this.emit('desync', {
        lastUpdateId: this.lastUpdateId,
        diff,
        reason: 'sequence-gap',
      });
      return false;
    }

    this.applyLevels(this.bids, diff.bids);
    this.applyLevels(this.asks, diff.asks);
    this.lastUpdateId = diff.u;
    this.emit('update', diff);
    return true;
  }

  /** Best (highest) bid level. */
  bestBid(): BookLevel | null {
    const entries = [...this.bids.entries()];
    if (entries.length === 0) return null;
    let best = entries[0]!;
    for (const entry of entries) {
      if (cmpExact(parseExact(entry[0]), parseExact(best[0])) > 0) best = entry;
    }
    return { price: best[0], quantity: best[1] };
  }

  /** Best (lowest) ask level. */
  bestAsk(): BookLevel | null {
    const entries = [...this.asks.entries()];
    if (entries.length === 0) return null;
    let best = entries[0]!;
    for (const entry of entries) {
      if (cmpExact(parseExact(entry[0]), parseExact(best[0])) < 0) best = entry;
    }
    return { price: best[0], quantity: best[1] };
  }

  /** Top of book on both sides. */
  top(): BookTop {
    return { bestBid: this.bestBid(), bestAsk: this.bestAsk() };
  }

  /** best ask − best bid, as a number (null when either side is empty). */
  spread(): number | null {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return null;
    return toNumber(subExact(parseExact(ask.price), parseExact(bid.price)));
  }

  /** (best bid + best ask) / 2, as a number. */
  mid(): number | null {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return null;
    return toNumber(divExact(addExact(parseExact(bid.price), parseExact(ask.price)), parseExact(2)));
  }

  /**
   * Size-weighted mid: (bid*askQty + ask*bidQty) / (bidQty+askQty). Tracks the
   * true equilibrium price better than the plain mid when book sizes are
   * skewed. Returns a number.
   */
  microprice(): number | null {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return null;
    const bidPrice = parseExact(bid.price);
    const askPrice = parseExact(ask.price);
    const bidQty = parseExact(bid.quantity);
    const askQty = parseExact(ask.quantity);
    const denominator = addExact(bidQty, askQty);
    if (toNumber(denominator) === 0) return this.mid();
    const numerator = addExact(mulExact(bidPrice, askQty), mulExact(askPrice, bidQty));
    return toNumber(divExact(numerator, denominator));
  }

  /**
   * Bid-side share of the total quantity across the top `n` levels each side.
   * > 0.5 = bid-heavy; < 0.5 = ask-heavy. Null when the book is empty.
   */
  imbalance(n = 5): number | null {
    const { bids, asks } = this.depth(n);
    let bidQty = parseExact(0);
    let askQty = parseExact(0);
    for (const level of bids) bidQty = addExact(bidQty, parseExact(level.quantity));
    for (const level of asks) askQty = addExact(askQty, parseExact(level.quantity));
    const total = addExact(bidQty, askQty);
    if (toNumber(total) === 0) return null;
    return toNumber(divExact(bidQty, total));
  }

  /**
   * Volume-weighted average price over the top `n` levels of one side, as a
   * number. Useful for slippage/impact estimates.
   */
  vwap(side: OrderBookSide, n = 5): number | null {
    const levels = side === 'bids' ? this.depth(n).bids : this.depth(n).asks;
    if (levels.length === 0) return null;
    let notional = parseExact(0);
    let qty = parseExact(0);
    for (const level of levels) {
      notional = addExact(notional, mulExact(parseExact(level.price), parseExact(level.quantity)));
      qty = addExact(qty, parseExact(level.quantity));
    }
    if (toNumber(qty) === 0) return null;
    return toNumber(divExact(notional, qty));
  }

  /** Top `n` levels, bids descending, asks ascending. */
  depth(n: number): { bids: BookLevel[]; asks: BookLevel[] } {
    return { bids: this.bidsTop(n), asks: this.asksTop(n) };
  }

  /** All levels as plain arrays (bids sorted descending by price). */
  getBids(): BookLevel[] {
    return this.bidsTop(Number.POSITIVE_INFINITY);
  }

  /** All levels as plain arrays (asks sorted ascending by price). */
  getAsks(): BookLevel[] {
    return this.asksTop(Number.POSITIVE_INFINITY);
  }

  /** Serializable state (e.g. for persistence or debugging). */
  toObject(): { lastUpdateId: number; synced: boolean; bids: BookLevel[]; asks: BookLevel[] } {
    return {
      lastUpdateId: this.lastUpdateId,
      synced: this.syncedFlag,
      bids: this.getBids(),
      asks: this.getAsks(),
    };
  }

  /** Hard reset (no desync event). */
  clear(): void {
    this.bids.clear();
    this.asks.clear();
    this.buffer.splice(0, this.buffer.length);
    this.lastUpdateId = 0;
    this.syncedFlag = false;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private isStale(diff: OrderBookDiff): boolean {
    // Both variants drop events fully covered by the synced point:
    // - Spot docs: drop events where u <= lastUpdateId.
    // - Futures docs: drop events where u < lastUpdateId; u == lastUpdateId is
    //   a full replay of already-known state, so it is dropped as well.
    return diff.u <= this.lastUpdateId;
  }

  private isContiguous(diff: OrderBookDiff): boolean {
    const firstExpected = this.lastUpdateId + 1;
    const u = diff.U ?? diff.u;
    if (this.variant === 'futures' && diff.pu !== undefined) {
      // 100ms/250ms futures streams carry the previous event's final id.
      return diff.pu === this.lastUpdateId || (u <= firstExpected && diff.u >= firstExpected);
    }
    // Spot: U <= lastUpdateId+1 <= u.
    return u <= firstExpected && diff.u >= firstExpected;
  }

  private applyLevels(side: Map<string, string>, levels: [string, string][]): void {
    for (const [rawPrice, rawQty] of levels) {
      const price = canonical(rawPrice);
      const qty = canonical(rawQty);
      if (isZeroQuantity(qty)) {
        side.delete(price);
      } else {
        side.set(price, qty);
      }
    }
  }

  private bidsTop(n: number): BookLevel[] {
    const entries = [...this.bids.entries()];
    entries.sort((a, b) => cmpExact(parseExact(b[0]), parseExact(a[0])));
    return entries.slice(0, n === Number.POSITIVE_INFINITY ? undefined : n).map(([price, quantity]) => ({ price, quantity }));
  }

  private asksTop(n: number): BookLevel[] {
    const entries = [...this.asks.entries()];
    entries.sort((a, b) => cmpExact(parseExact(a[0]), parseExact(b[0])));
    return entries.slice(0, n === Number.POSITIVE_INFINITY ? undefined : n).map(([price, quantity]) => ({ price, quantity }));
  }
}
