import { compareDecimals, formatFixed, normalizeFixed, parseFixed, subtractFixed } from '../core/fixedpoint.js';

/**
 * Partial book depth: each frame is a full top-N snapshot, not a diff, so there is
 * no sequence to reconcile. Stream name verified:
 * `<symbol>@depth<levels>@<updateSpeed>`, levels 5, 10, or 20; the 100 ms speed is
 * the documented option. The default cadence is 1000 ms.
 *
 * Frames carry `lastUpdateId`, `bids`, and `asks`. A frame with a lower
 * lastUpdateId than the current one is stale and is rejected. A crossed top of
 * book is reported as CROSSED, not silently accepted.
 */

export const PARTIAL_DEPTH_LEVELS = [5, 10, 20] as const;
export type PartialDepthLevels = (typeof PARTIAL_DEPTH_LEVELS)[number];
export type PartialDepthUpdateSpeed = 100 | 1000;

export function partialDepthStreamName(
  symbol: string,
  levels: PartialDepthLevels,
  updateSpeedMs: PartialDepthUpdateSpeed = 1000,
): string {
  if (!(PARTIAL_DEPTH_LEVELS as readonly number[]).includes(levels)) {
    throw new RangeError(`partial depth levels must be one of ${PARTIAL_DEPTH_LEVELS.join(', ')}, got ${levels}`);
  }
  const base = `${symbol.toLowerCase()}@depth${levels}`;
  return updateSpeedMs === 100 ? `${base}@100ms` : base;
}

export interface PartialDepthLevel {
  price: string;
  quantity: string;
}

export interface PartialDepthFrame {
  lastUpdateId: number;
  bids: ReadonlyArray<readonly [string, string]>;
  asks: ReadonlyArray<readonly [string, string]>;
}

export interface PartialDepthSnapshot {
  lastUpdateId: number;
  /** Bids, best (highest) first. */
  bids: PartialDepthLevel[];
  /** Asks, best (lowest) first. */
  asks: PartialDepthLevel[];
}

export type PartialDepthApplyResult =
  | { status: 'ACCEPTED'; snapshot: PartialDepthSnapshot }
  | { status: 'STALE'; lastUpdateId: number; currentLastUpdateId: number }
  | { status: 'CROSSED'; snapshot: PartialDepthSnapshot };

function cleanSide(levels: ReadonlyArray<readonly [string, string]>): PartialDepthLevel[] {
  const cleaned: PartialDepthLevel[] = [];
  for (const [price, quantity] of levels) {
    const qty = parseFixed(quantity);
    // A zero quantity means the level is absent. A negative quantity is malformed.
    if (qty.units < 0n) throw new RangeError(`negative quantity ${quantity} at price ${price}`);
    if (qty.units === 0n) continue;
    parseFixed(price);
    cleaned.push({ price, quantity });
  }
  return cleaned;
}

export class PartialDepthBook {
  private current: PartialDepthSnapshot | undefined;

  apply(frame: PartialDepthFrame): PartialDepthApplyResult {
    if (!Number.isSafeInteger(frame.lastUpdateId) || frame.lastUpdateId < 0) {
      throw new RangeError(`lastUpdateId must be a non-negative integer, got ${frame.lastUpdateId}`);
    }
    if (this.current && frame.lastUpdateId < this.current.lastUpdateId) {
      return {
        status: 'STALE',
        lastUpdateId: frame.lastUpdateId,
        currentLastUpdateId: this.current.lastUpdateId,
      };
    }

    const bids = cleanSide(frame.bids).sort((a, b) => compareDecimals(b.price, a.price));
    const asks = cleanSide(frame.asks).sort((a, b) => compareDecimals(a.price, b.price));
    const snapshot: PartialDepthSnapshot = { lastUpdateId: frame.lastUpdateId, bids, asks };
    this.current = snapshot;

    const topBid = bids[0];
    const topAsk = asks[0];
    if (topBid && topAsk && compareDecimals(topBid.price, topAsk.price) >= 0) {
      return { status: 'CROSSED', snapshot };
    }
    return { status: 'ACCEPTED', snapshot };
  }

  get snapshot(): PartialDepthSnapshot | undefined {
    return this.current;
  }

  /** Exact spread (best ask − best bid), or undefined when a side is empty. */
  spread(): string | undefined {
    const bid = this.current?.bids[0];
    const ask = this.current?.asks[0];
    if (!bid || !ask) return undefined;
    const diff = normalizeFixed(subtractFixed(parseFixed(ask.price), parseFixed(bid.price)));
    return formatFixed(diff, diff.scale);
  }
}
