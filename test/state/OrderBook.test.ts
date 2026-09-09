import { Decimal } from '../../src/core/decimal.js';
import { describe, expect, it } from 'vitest';
import { OrderBook } from '../../src/state/OrderBook.js';

const SNAPSHOT = {
  lastUpdateId: 100,
  bids: [
    ['99.5', '1'],
    ['99.0', '2'],
    ['98.5', '3'],
  ] as [string, string][],
  asks: [
    ['100.5', '1'],
    ['101.0', '2'],
    ['101.5', '3'],
  ] as [string, string][],
};

describe('OrderBook', () => {
  it('builds from a snapshot and computes top-of-book analytics', () => {
    const book = new OrderBook('BTCUSDT');
    book.applySnapshot(SNAPSHOT);

    expect(book.isSynced).toBe(true);
    expect(book.bestBid()).toEqual({ price: '99.5', quantity: '1' });
    expect(book.bestAsk()).toEqual({ price: '100.5', quantity: '1' });
    expect(book.midPrice()).toBe('100');
    expect(book.metrics().spread).toBe('1');

    const metrics = book.metrics();
    expect(metrics.spreadBps).toBeCloseTo(100, 5); // 1 / 100 * 10_000
    // microprice = (bid*askQty + ask*bidQty) / (bidQty + askQty) = (99.5+100.5)/2
    expect(metrics.microprice).toBe('100');
  });

  it('applies diffs in order: updates, inserts, and removes levels', () => {
    const book = new OrderBook('BTCUSDT');
    book.applySnapshot(SNAPSHOT);

    const applied = book.applyDiff({
      U: 101,
      u: 102,
      bids: [['99.5', '5']], // update: qty 1 -> 5
      asks: [['101.5', '0'], ['102.0', '7']], // remove + insert
    });
    expect(applied).toBe(true);

    expect(book.bestBid()).toEqual({ price: '99.5', quantity: '5' });
    expect(book.getBids()).toEqual([
      { price: '99.5', quantity: '5' },
      { price: '99', quantity: '2' }, // canonical: trailing zeros stripped
      { price: '98.5', quantity: '3' },
    ]);
    expect(book.getAsks(5)).toEqual([
      { price: '100.5', quantity: '1' },
      { price: '101', quantity: '2' }, // canonical: trailing zeros stripped
      { price: '102', quantity: '7' },
    ]);
  });

  it('detects gaps via pu (futures) and sequence discontinuity', () => {
    const book = new OrderBook('BTCUSDT');
    book.applySnapshot(SNAPSHOT);

    // pu mismatch → desync
    expect(
      book.applyDiff({ U: 103, u: 104, pu: 999, bids: [], asks: [] }),
    ).toBe(false);
    expect(book.isSynced).toBe(false);

    // resync clears it
    book.applySnapshot(SNAPSHOT);
    expect(book.isSynced).toBe(true);

    // dropped event (U jumps past lastUpdateId+1) → desync
    expect(book.applyDiff({ U: 105, u: 106, bids: [], asks: [] })).toBe(false);
  });

  it('ignores stale events entirely', () => {
    const book = new OrderBook('BTCUSDT');
    book.applySnapshot(SNAPSHOT);
    expect(book.applyDiff({ U: 90, u: 100, bids: [['99.5', '9']], asks: [] })).toBe(true);
    expect(book.bestBid()?.quantity).toBe('1'); // unchanged
  });

  it('depthWithinPct and imbalance use exact decimal math', () => {
    const book = new OrderBook('BTCUSDT');
    book.applySnapshot(SNAPSHOT);
    // within 1% of mid (100): bids 99.0..99.5 (qty 3), asks 100.5..101.0 (qty 3)
    expect(book.depthWithinPct('bids', 1)).toBe('3');
    expect(book.depthWithinPct('asks', 1)).toBe('3');
    const metrics = book.metrics(1);
    expect(metrics.imbalance).toBe(0);
    expect(metrics.levelCount).toEqual({ bids: 3, asks: 3 });
  });

  it('vwap walks top levels size-weighted', () => {
    const book = new OrderBook('BTCUSDT');
    book.applySnapshot(SNAPSHOT);
    // bids top-2: 99.5×1, 99.0×2 → (99.5 + 198) / 3 = 99.166666…
    expect(Decimal.from(book.vwap('bids', 2) ?? '').round(6).toString()).toBe('99.166667');
    // asks top-2: 100.5×1, 101.0×2 → 302.5 / 3 = 100.833333…
    expect(Decimal.from(book.vwap('asks', 2) ?? '').round(6).toString()).toBe('100.833333');
  });

  it('accepts numeric level objects as well as string tuples', () => {
    const book = new OrderBook('X');
    book.applySnapshot({
      lastUpdateId: 1,
      bids: [{ price: 10, qty: 1.5 }],
      asks: [{ price: 11, qty: 2.5 }],
    });
    expect(book.bestBid()).toEqual({ price: '10', quantity: '1.5' });
    expect(book.bestAsk()).toEqual({ price: '11', quantity: '2.5' });
  });

  it('one-sided books report null-derived fields instead of throwing', () => {
    const book = new OrderBook('X');
    book.applySnapshot({ lastUpdateId: 1, bids: [['10', '1']], asks: [] });
    expect(book.midPrice()).toBeNull();
    expect(book.microprice()).toBeNull();
    const metrics = book.metrics();
    expect(metrics.spread).toBeNull();
    expect(metrics.imbalance).toBeNull();
  });
});
