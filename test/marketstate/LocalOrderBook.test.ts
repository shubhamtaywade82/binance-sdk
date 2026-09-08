import { describe, expect, it } from 'vitest';
import { LocalOrderBook } from '../../src/marketstate/LocalOrderBook.js';

const SNAP = {
  lastUpdateId: 100,
  bids: [
    ['100.50', '1.5'],
    ['100.40', '2'],
    ['100.30', '3'],
  ] as [string, string][],
  asks: [
    ['100.6', '1'],
    ['100.70', '2.5'],
    ['100.80', '0.75'],
  ] as [string, string][],
};

function futuresBook(): LocalOrderBook {
  const book = new LocalOrderBook({ variant: 'futures' });
  book.applySnapshot(SNAP);
  return book;
}

describe('LocalOrderBook — futures sequence semantics', () => {
  it('applies a snapshot and exposes best bid/ask, spread and mid', () => {
    const book = futuresBook();
    expect(book.synced).toBe(true);
    expect(book.bestBid()).toEqual({ price: '100.5', quantity: '1.5' });
    expect(book.bestAsk()).toEqual({ price: '100.6', quantity: '1' });
    expect(book.spread()).toBeCloseTo(0.1);
    expect(book.mid()).toBeCloseTo(100.55);
  });

  it('buffers diffs received before the snapshot and replays them in order', () => {
    const book = new LocalOrderBook({ variant: 'futures' });
    expect(book.applyDiff({ U: 101, u: 105, pu: 100, bids: [], asks: [['100.60', '2']] })).toBe(false);
    expect(book.bufferedDiffCount).toBe(1);

    book.applySnapshot(SNAP);
    // The buffered diff bridged the snapshot (pu === lastUpdateId) and applied.
    expect(book.synced).toBe(true);
    expect(book.bestAsk()).toEqual({ price: '100.6', quantity: '2' });
    expect(book.lastUpdateIdSynced).toBe(105);
  });

  it('applies a contiguous diff and updates levels exactly', () => {
    const book = futuresBook();
    book.applyDiff({
      U: 101, u: 110, pu: 100,
      bids: [['100.50', '0']],           // best bid removed
      asks: [['100.65', '4.25']],        // new level inserted
    });

    expect(book.bestBid()).toEqual({ price: '100.4', quantity: '2' });
    expect(book.bestAsk()).toEqual({ price: '100.6', quantity: '1' });
    expect(book.depth(2).asks).toEqual([
      { price: '100.6', quantity: '1' },
      { price: '100.65', quantity: '4.25' },
    ]);
  });

  it('drops stale diffs (u < lastUpdateId)', () => {
    const book = futuresBook();
    expect(book.applyDiff({ U: 90, u: 100, pu: 89, bids: [['99', '1']], asks: [] })).toBe(true);
    expect(book.bestBid()?.price).toBe('100.5'); // untouched (canonical)
  });

  it('emits desync on a sequence gap and stops applying until re-snapshot', () => {
    const book = futuresBook();
    const desyncs: unknown[] = [];
    book.on('desync', (d) => desyncs.push(d));

    // Gap: pu is 150 but we are at 100.
    const applied = book.applyDiff({ U: 151, u: 160, pu: 150, bids: [], asks: [] });

    expect(applied).toBe(false);
    expect(book.synced).toBe(false);
    expect(desyncs).toHaveLength(1);

    // Later diffs buffer while desynced.
    expect(book.applyDiff({ U: 161, u: 165, pu: 160, bids: [], asks: [] })).toBe(false);
    expect(book.bufferedDiffCount).toBe(1);

    // Re-snapshot resynchronizes and replays the buffered diff.
    book.applySnapshot({ ...SNAP, lastUpdateId: 160 });
    expect(book.synced).toBe(true);
    expect(book.lastUpdateIdSynced).toBe(165);
  });
});

describe('LocalOrderBook — spot sequence semantics', () => {
  it('applies diffs when U <= lastUpdateId+1 <= u', () => {
    const book = new LocalOrderBook({ variant: 'spot' });
    book.applySnapshot(SNAP);

    expect(book.applyDiff({ U: 98, u: 102, bids: [['100.55', '2']], asks: [] })).toBe(true);
    expect(book.bestBid()).toEqual({ price: '100.55', quantity: '2' });
    expect(book.lastUpdateIdSynced).toBe(102);

    // Next diff must continue from 102.
    expect(book.applyDiff({ U: 103, u: 104, bids: [], asks: [['100.60', '0'], ['100.62', '5']] })).toBe(true);
    expect(book.bestAsk()?.price).toBe('100.62');

    // Gap → desync.
    expect(book.applyDiff({ U: 110, u: 112, bids: [], asks: [] })).toBe(false);
    expect(book.synced).toBe(false);
  });
});

describe('LocalOrderBook — microstructure analytics', () => {
  it('computes microprice exactly weighted by size', () => {
    const book = futuresBook();
    // bid 100.50 x 1.5, ask 100.60 x 1 → micro = (100.50*1 + 100.60*1.5)/2.5
    const expected = (100.5 * 1 + 100.6 * 1.5) / 2.5;
    expect(book.microprice()).toBeCloseTo(expected, 6);
  });

  it('computes depth imbalance over the top N levels', () => {
    const book = futuresBook();
    // top3 bid qty = 1.5+2+3 = 6.5, ask qty = 1+2.5+0.75 = 4.25
    expect(book.imbalance(3)).toBeCloseTo(6.5 / (6.5 + 4.25), 6);
  });

  it('computes VWAP per side over the top N levels', () => {
    const book = futuresBook();
    const bidVwap = (100.5 * 1.5 + 100.4 * 2 + 100.3 * 3) / 6.5;
    expect(book.vwap('bids', 3)).toBeCloseTo(bidVwap, 6);

    const askVwap = (100.6 * 1 + 100.7 * 2.5) / 3.5;
    expect(book.vwap('asks', 2)).toBeCloseTo(askVwap, 6);
  });

  it('orders levels correctly regardless of string formatting', () => {
    const book = new LocalOrderBook({ variant: 'futures' });
    book.applySnapshot({
      lastUpdateId: 1,
      bids: [['10.1', '1'], ['10.09', '1'], ['9.99', '1'], ['10.2', '1']],
      asks: [['10.3', '1'], ['10.11', '1'], ['10.29', '1']],
    });
    // String sort would place '10.09' after '10.1' and '10.11' before '10.29';
    // exact decimal sort keeps numeric order.
    expect(book.getBids().map((l) => l.price)).toEqual(['10.2', '10.1', '10.09', '9.99']);
    expect(book.getAsks().map((l) => l.price)).toEqual(['10.11', '10.29', '10.3']);
  });

  it('handles quantities that parse as zero in any format', () => {
    const book = futuresBook();
    book.applyDiff({ U: 101, u: 102, pu: 100, bids: [['100.40', '0.0']], asks: [['100.70', '0.000']] });
    expect(book.getBids().map((l) => l.price)).not.toContain('100.4');
    expect(book.getAsks().map((l) => l.price)).not.toContain('100.7');
  });

  it('merges levels that arrive under different formatting (number-parsed snapshot vs raw diff)', () => {
    // Regression: a snapshot level '60000.1' (from String(number)) and a diff
    // level '60000.10' (raw exchange string) are the SAME price and must not
    // exist as two levels.
    const book = new LocalOrderBook({ variant: 'futures' });
    book.applySnapshot({ lastUpdateId: 1, bids: [['60000.1', '1']], asks: [['60000.2', '1']] });
    book.applyDiff({ U: 2, u: 2, pu: 1, bids: [['60000.10', '2']], asks: [['60000.20', '0']] });

    expect(book.getBids()).toEqual([{ price: '60000.1', quantity: '2' }]);
    expect(book.getAsks()).toEqual([]);
    expect(book.bestBid()?.price).toBe('60000.1');
    expect(book.bestAsk()).toBeNull();
  });
});
