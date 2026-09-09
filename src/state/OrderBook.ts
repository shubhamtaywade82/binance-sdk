import { Decimal, type DecimalInput } from '../core/decimal.js';

/**
 * Local L2 order-book state: REST snapshot + diff-depth stream → live book.
 *
 * The legacy SDK streamed `@depth` updates but threw them away — callers who
 * needed book state had to poll REST. This engine maintains the canonical
 * algorithm locally:
 *
 *   1. subscribe to `<symbol>@depth@100ms|500ms`
 *   2. fetch a REST depth snapshot
 *   3. apply every diff whose event ids bracket the snapshot's `lastUpdateId`
 *   4. detect gaps (via `pu` / sequence discontinuities) and demand a resync
 *
 * All arithmetic (spread, microprice, imbalance, VWAP) runs on exact decimals.
 */

/** Raw Binance level tuple: [price, quantity]. */
export type RawLevel = readonly [string, string] | { price: DecimalInput; qty: DecimalInput };

export interface BookSnapshotInput {
  lastUpdateId: number;
  bids: readonly RawLevel[];
  asks: readonly RawLevel[];
}

export interface DiffInput {
  /** First update id in this event. */
  U: number;
  /** Final update id in this event (inclusive). */
  u: number;
  /** Previous final update id (Binance futures). */
  pu?: number;
  bids: readonly RawLevel[];
  asks: readonly RawLevel[];
}

export interface BookLevel {
  price: string;
  quantity: string;
}

export interface OrderBookMetrics {
  bestBid: string | null;
  bestAsk: string | null;
  midPrice: string | null;
  /** ask − bid (null when the book is one-sided). */
  spread: string | null;
  /** Spread in basis points of mid. */
  spreadBps: number | null;
  microprice: string | null;
  /** Total bid/ask quantity within `depthPct` of mid (quote-agnostic, base units). */
  bidDepth: string;
  askDepth: string;
  /**
   * Order-flow imbalance proxy: (bidDepth − askDepth) / (bidDepth + askDepth)
   * within the measurement window; −1..1.
   */
  imbalance: number | null;
  levelCount: { bids: number; asks: number };
  lastUpdateId: number | null;
  synced: boolean;
}

interface InternalLevel {
  price: Decimal;
  quantity: Decimal;
}

function toLevel(raw: RawLevel): { price: Decimal; quantity: Decimal } {
  if ('price' in raw) {
    return { price: Decimal.from(raw.price), quantity: Decimal.from(raw.qty) };
  }
  return { price: Decimal.from(raw[0]), quantity: Decimal.from(raw[1]) };
}

/**
 * One symbol's live book. Levels are kept sorted (bids descending, asks
 * ascending) with binary-search insertion so queries stay O(log n) per level.
 */
export class OrderBook {
  private bids: InternalLevel[] = [];
  private asks: InternalLevel[] = [];
  private lastUpdateId: number | null = null;
  private synced = false;
  /** Set when a gap is detected; cleared by the next snapshot. */
  private desynced = false;

  constructor(readonly symbol: string) {}

  get isSynced(): boolean {
    return this.synced && !this.desynced;
  }

  getLastUpdateId(): number | null {
    return this.lastUpdateId;
  }

  applySnapshot(snapshot: BookSnapshotInput): void {
    this.bids = snapshot.bids
      .map(toLevel)
      .filter((level) => level.quantity.isPositive())
      .sort((a, b) => b.price.cmp(a.price));
    this.asks = snapshot.asks
      .map(toLevel)
      .filter((level) => level.quantity.isPositive())
      .sort((a, b) => a.price.cmp(b.price));
    this.lastUpdateId = snapshot.lastUpdateId;
    this.desynced = false;
    this.synced = true;
  }

  /**
   * Apply a diff event. Returns `false` when a sequence gap was detected —
   * the caller must fetch a fresh snapshot (the diff is dropped either way).
   */
  applyDiff(diff: DiffInput): boolean {
    if (!this.synced) return false;

    // Futures: pu must equal our previous final update id.
    if (diff.pu !== undefined && this.lastUpdateId !== null && diff.pu !== this.lastUpdateId) {
      this.desynced = true;
      return false;
    }
    // Entirely stale event.
    if (this.lastUpdateId !== null && diff.u <= this.lastUpdateId) return true;
    // Gap: we missed at least one diff since the snapshot/last event.
    if (this.lastUpdateId !== null && diff.U > this.lastUpdateId + 1) {
      this.desynced = true;
      return false;
    }

    this.applySide(this.bids, diff.bids, /* descending= */ true);
    this.applySide(this.asks, diff.asks, /* descending= */ false);
    this.lastUpdateId = diff.u;
    return true;
  }

  private applySide(levels: InternalLevel[], updates: readonly RawLevel[], descending: boolean): void {
    for (const raw of updates) {
      const { price, quantity } = toLevel(raw);
      const index = findIndex(levels, price, descending);
      if (quantity.isZero()) {
        if (index >= 0) levels.splice(index, 1);
        continue;
      }
      if (index >= 0) {
        levels[index] = { price, quantity };
      } else {
        const insertionPoint = ~index;
        levels.splice(insertionPoint, 0, { price, quantity });
      }
    }
  }

  bestBid(): BookLevel | null {
    return this.bids.length
      ? { price: this.bids[0].price.toString(), quantity: this.bids[0].quantity.toString() }
      : null;
  }

  bestAsk(): BookLevel | null {
    return this.asks.length
      ? { price: this.asks[0].price.toString(), quantity: this.asks[0].quantity.toString() }
      : null;
  }

  midPrice(): string | null {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return null;
    return Decimal.from(bid.price).add(ask.price).div(2).toString();
  }

  /** Size-weighted fair price — leans toward the side with more resting size. */
  microprice(): string | null {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    if (!bid || !ask) return null;
    const bidQty = Decimal.from(bid.quantity);
    const askQty = Decimal.from(ask.quantity);
    const total = bidQty.add(askQty);
    if (total.isZero()) return this.midPrice();
    const bidPrice = Decimal.from(bid.price);
    const askPrice = Decimal.from(ask.price);
    return bidPrice.mul(askQty).add(askPrice.mul(bidQty)).div(total).toString();
  }

  getBids(limit = 20): BookLevel[] {
    return this.bids
      .slice(0, limit)
      .map((level) => ({ price: level.price.toString(), quantity: level.quantity.toString() }));
  }

  getAsks(limit = 20): BookLevel[] {
    return this.asks
      .slice(0, limit)
      .map((level) => ({ price: level.price.toString(), quantity: level.quantity.toString() }));
  }

  /** Cumulative quantity on one side within `withinPct` percent of mid. */
  depthWithinPct(side: 'bids' | 'asks', withinPct: number): string {
    const mid = this.midPrice();
    if (mid === null) return '0';
    const levels = side === 'bids' ? this.bids : this.asks;
    const threshold = Decimal.from(mid).mul(1 - withinPct / 100);
    let total = Decimal.ZERO;
    for (const level of levels) {
      const inRange =
        side === 'bids' ? level.price.gte(threshold) : level.price.lte(Decimal.from(mid).mul(1 + withinPct / 100));
      if (!inRange) break;
      total = total.add(level.quantity);
    }
    return total.toString();
  }

  /** VWAP of the top `levels` resting orders on one side (size-weighted). */
  vwap(side: 'bids' | 'asks', levels = 5): string | null {
    const book = side === 'bids' ? this.bids.slice(0, levels) : this.asks.slice(0, levels);
    if (!book.length) return null;
    let notional = Decimal.ZERO;
    let qty = Decimal.ZERO;
    for (const level of book) {
      notional = notional.add(level.price.mul(level.quantity));
      qty = qty.add(level.quantity);
    }
    if (qty.isZero()) return null;
    return notional.div(qty).toString();
  }

  /** Composite snapshot of derived analytics. */
  metrics(depthPct = 0.5): OrderBookMetrics {
    const bid = this.bestBid();
    const ask = this.bestAsk();
    const mid = this.midPrice();
    const spread =
      bid && ask ? Decimal.from(ask.price).sub(bid.price).toString() : null;
    const spreadBps =
      spread !== null && mid !== null && Decimal.from(mid).isPositive()
        ? (Decimal.from(spread).div(mid).toNumber() * 10_000)
        : null;
    const bidDepth = this.depthWithinPct('bids', depthPct);
    const askDepth = this.depthWithinPct('asks', depthPct);
    const bidDepthD = Decimal.from(bidDepth);
    const askDepthD = Decimal.from(askDepth);
    const totalDepth = bidDepthD.add(askDepthD);
    const imbalance = totalDepth.isZero()
      ? null
      : bidDepthD.sub(askDepthD).div(totalDepth).toNumber();
    return {
      bestBid: bid?.price ?? null,
      bestAsk: ask?.price ?? null,
      midPrice: mid,
      spread,
      spreadBps,
      microprice: this.microprice(),
      bidDepth,
      askDepth,
      imbalance,
      levelCount: { bids: this.bids.length, asks: this.asks.length },
      lastUpdateId: this.lastUpdateId,
      synced: this.isSynced,
    };
  }
}

/**
 * Binary search on a sorted side. Returns the index of an exact price match,
 * or the bitwise-complement of the insertion point.
 */
function findIndex(
  levels: readonly InternalLevel[],
  price: Decimal,
  descending: boolean,
): number {
  let low = 0;
  let high = levels.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const comparison = levels[mid].price.cmp(price);
    const adjusted = descending ? -comparison : comparison;
    if (adjusted === 0) return mid;
    if (adjusted < 0) low = mid + 1;
    else high = mid - 1;
  }
  return ~low;
}
