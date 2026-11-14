import { describe, expect, it } from 'vitest';
import { OrderBook } from '../../src/state/OrderBook.js';
import { PartialDepthBook, partialDepthStreamName } from '../../src/state/PartialDepthBook.js';

const snapshot = { lastUpdateId: 100, bids: [['60000', '1']] as const, asks: [['60010', '1']] as const };

describe('OrderBook usdm first-event rule', () => {
  it('accepts the bridging diff with U <= lastUpdateId <= u, even when its pu is older', () => {
    const book = new OrderBook('BTCUSDT', { product: 'usdm' });
    book.applySnapshot({ ...snapshot });
    // pu (90) != lastUpdateId (100), but the first event is exempt from the pu check.
    expect(book.applyDiff({ U: 95, u: 105, pu: 90, bids: [['60000', '2']], asks: [] })).toBe(true);
    expect(book.getLastUpdateId()).toBe(105);
    expect(book.isSynced).toBe(true);
  });

  it('drops diffs fully covered by the snapshot (u < lastUpdateId) without desyncing', () => {
    const book = new OrderBook('BTCUSDT', { product: 'usdm' });
    book.applySnapshot({ ...snapshot });
    expect(book.applyDiff({ U: 80, u: 99, pu: 79, bids: [['60000', '5']], asks: [] })).toBe(true);
    expect(book.getLastUpdateId()).toBe(100);
    expect(book.isSynced).toBe(true);
  });

  it('desyncs when the first diff starts after the snapshot (U > lastUpdateId)', () => {
    const book = new OrderBook('BTCUSDT', { product: 'usdm' });
    book.applySnapshot({ ...snapshot });
    // U = lastUpdateId + 1 is a gap under the futures rule, which requires U <= lastUpdateId.
    expect(book.applyDiff({ U: 101, u: 110, pu: 100, bids: [], asks: [] })).toBe(false);
    expect(book.isSynced).toBe(false);
  });

  it('enforces pu continuity from the second diff on', () => {
    const book = new OrderBook('BTCUSDT', { product: 'usdm' });
    book.applySnapshot({ ...snapshot });
    expect(book.applyDiff({ U: 95, u: 105, pu: 90, bids: [], asks: [] })).toBe(true);
    expect(book.applyDiff({ U: 106, u: 110, pu: 105, bids: [['60000', '3']], asks: [] })).toBe(true);
    expect(book.applyDiff({ U: 112, u: 115, pu: 111, bids: [], asks: [] })).toBe(false);
    expect(book.isSynced).toBe(false);
  });

  it('keeps the historical default behaviour when no product is given', () => {
    const book = new OrderBook('BTCUSDT');
    book.applySnapshot({ ...snapshot });
    // Without the usdm rule the pu check runs on the first diff, so a mismatch desyncs.
    expect(book.applyDiff({ U: 95, u: 105, pu: 90, bids: [], asks: [] })).toBe(false);
  });
});

describe('PartialDepthBook', () => {
  it('builds the verified stream names', () => {
    expect(partialDepthStreamName('BNBUSDT', 5, 100)).toBe('bnbusdt@depth5@100ms');
    expect(partialDepthStreamName('BNBUSDT', 20)).toBe('bnbusdt@depth20');
    expect(() => partialDepthStreamName('BNBUSDT', 7 as never)).toThrow(RangeError);
  });

  it('sorts levels, drops zero quantities, and returns an exact spread', () => {
    const book = new PartialDepthBook();
    const result = book.apply({
      lastUpdateId: 10,
      bids: [['99.5', '1'], ['100.25', '2'], ['100', '0']],
      asks: [['101', '1'], ['100.75', '3']],
    });
    expect(result.status).toBe('ACCEPTED');
    expect(book.snapshot?.bids.map((l) => l.price)).toEqual(['100.25', '99.5']);
    expect(book.snapshot?.asks.map((l) => l.price)).toEqual(['100.75', '101']);
    expect(book.spread()).toBe('0.5');
  });

  it('rejects an older frame as stale and keeps the current snapshot', () => {
    const book = new PartialDepthBook();
    book.apply({ lastUpdateId: 10, bids: [['1', '1']], asks: [['2', '1']] });
    const stale = book.apply({ lastUpdateId: 9, bids: [['1.5', '1']], asks: [['2', '1']] });
    expect(stale).toEqual({ status: 'STALE', lastUpdateId: 9, currentLastUpdateId: 10 });
    expect(book.snapshot?.bids[0]?.price).toBe('1');
  });

  it('reports a crossed top of book instead of accepting it silently', () => {
    const book = new PartialDepthBook();
    const result = book.apply({ lastUpdateId: 1, bids: [['101', '1']], asks: [['100', '1']] });
    expect(result.status).toBe('CROSSED');
  });

  it('rejects negative quantities and non-integer ids', () => {
    const book = new PartialDepthBook();
    expect(() => book.apply({ lastUpdateId: 1, bids: [['1', '-1']], asks: [] })).toThrow(RangeError);
    expect(() => book.apply({ lastUpdateId: 1.5, bids: [], asks: [] })).toThrow(RangeError);
  });
});
