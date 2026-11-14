import {
  addFixed,
  compareFixed,
  formatFixed,
  multiplyFixed,
  normalizeFixed,
  parseFixed,
  type FixedDecimal,
} from '../core/fixedpoint.js';

/**
 * Sub-minute synthetic candles from aggregate trades. Every price and quantity
 * is exact (fixed-point), so OHLC and volume are not subject to float drift.
 *
 * Trades must arrive in non-decreasing timestamp order. An out-of-order trade is
 * rejected instead of being folded into the wrong bucket. A bar closes when a
 * trade lands in a later bucket, or when `flush()` is called.
 *
 * Output prices and volumes are canonical decimals, with trailing zeros removed
 * (`"100.10"` is emitted as `"100.1"`). The value is exact either way.
 */

export interface AggTradeInput {
  price: string;
  quantity: string;
  timestampMs: number;
}

export interface Bar {
  bucketStartMs: number;
  open: string;
  high: string;
  low: string;
  close: string;
  /** Sum of quantities (base volume). */
  volume: string;
  /** Sum of price × quantity (quote volume). */
  quoteVolume: string;
  trades: number;
}

interface OpenBar {
  start: number;
  open: FixedDecimal;
  high: FixedDecimal;
  low: FixedDecimal;
  close: FixedDecimal;
  volume: FixedDecimal;
  quoteVolume: FixedDecimal;
  trades: number;
}

function render(value: FixedDecimal): string {
  const normalized = normalizeFixed(value);
  return formatFixed(normalized, normalized.scale);
}

function toBar(bar: OpenBar): Bar {
  return {
    bucketStartMs: bar.start,
    open: render(bar.open),
    high: render(bar.high),
    low: render(bar.low),
    close: render(bar.close),
    volume: render(bar.volume),
    quoteVolume: render(bar.quoteVolume),
    trades: bar.trades,
  };
}

export class AggTradeBarBuilder {
  private readonly bucketMs: number;
  private current: OpenBar | undefined;
  private lastTimestampMs = Number.NEGATIVE_INFINITY;

  constructor(bucketMs: number) {
    if (!Number.isSafeInteger(bucketMs) || bucketMs < 1) {
      throw new RangeError(`bucketMs must be a positive integer, got ${bucketMs}`);
    }
    this.bucketMs = bucketMs;
  }

  /** Feed one trade. Returns the bar closed by this trade (0 or 1 entries). */
  push(trade: AggTradeInput): Bar[] {
    if (!Number.isSafeInteger(trade.timestampMs) || trade.timestampMs < 0) {
      throw new RangeError(`trade timestampMs must be a non-negative integer, got ${trade.timestampMs}`);
    }
    if (trade.timestampMs < this.lastTimestampMs) {
      throw new RangeError(
        `out-of-order trade: ${trade.timestampMs} is before ${this.lastTimestampMs}`,
      );
    }
    const price = parseFixed(trade.price);
    const quantity = parseFixed(trade.quantity);
    if (price.units <= 0n) throw new RangeError(`trade price must be > 0, got ${trade.price}`);
    if (quantity.units <= 0n) throw new RangeError(`trade quantity must be > 0, got ${trade.quantity}`);

    this.lastTimestampMs = trade.timestampMs;
    const start = Math.floor(trade.timestampMs / this.bucketMs) * this.bucketMs;
    const notional = multiplyFixed(price, quantity);

    const closed: Bar[] = [];
    if (this.current && this.current.start !== start) {
      closed.push(toBar(this.current));
      this.current = undefined;
    }

    if (!this.current) {
      this.current = {
        start,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        quoteVolume: notional,
        trades: 1,
      };
    } else {
      const bar = this.current;
      if (compareFixed(price, bar.high) > 0) bar.high = price;
      if (compareFixed(price, bar.low) < 0) bar.low = price;
      bar.close = price;
      bar.volume = addFixed(bar.volume, quantity);
      bar.quoteVolume = addFixed(bar.quoteVolume, notional);
      bar.trades += 1;
    }
    return closed;
  }

  /** Close and return the open bar, if any. */
  flush(): Bar[] {
    if (!this.current) return [];
    const bar = toBar(this.current);
    this.current = undefined;
    return [bar];
  }
}
