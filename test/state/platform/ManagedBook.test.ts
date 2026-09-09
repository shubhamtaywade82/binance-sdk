import { describe, expect, it } from 'vitest';
import { ManagedBook } from '../../../src/state/platform/ManagedBook.js';

/** Build one futures-style depth diff. */
function diff(input: {
  U: number;
  u: number;
  pu?: number;
  bids?: [string, string][];
  asks?: [string, string][];
}): { U: number; u: number; pu?: number; bids: [string, string][]; asks: [string, string][] } {
  return {
    U: input.U,
    u: input.u,
    pu: input.pu,
    bids: input.bids ?? [],
    asks: input.asks ?? [],
  };
}

function snapshot(lastUpdateId: number, bids: [string, string][], asks: [string, string][]) {
  return { lastUpdateId, bids, asks };
}

describe('ManagedBook (v3 state platform)', () => {
  it('buffers diffs before the snapshot and applies the overlapping tail', () => {
    const book = new ManagedBook('BTCUSDT');
    expect(book.state).toBe('syncing');

    // Diffs arrive while the REST snapshot is in flight — they buffer.
    book.receiveDiff(diff({ U: 96, u: 100, pu: 95, bids: [['42100', '1']] }));
    book.receiveDiff(diff({ U: 101, u: 105, pu: 100, bids: [['42150', '2']] }));
    // A better (lower) ask than the snapshot's — observable in bestAsk.
    book.receiveDiff(diff({ U: 106, u: 110, pu: 105, asks: [['42190', '3']] }));
    expect(book.state).toBe('syncing');

    const synced: unknown[] = [];
    book.on('synced', (event) => synced.push(event));
    book.applySnapshot(snapshot(100, [['42000', '5']], [['42200', '5']]));

    // u=100 diff is stale (fully covered by the snapshot); the two newer
    // diffs applied on top — the canonical Binance sync algorithm.
    expect(book.state).toBe('live');
    expect(book.isSynced).toBe(true);
    expect(synced).toHaveLength(1);
    expect((synced[0] as { buffered?: number }).buffered).toBe(2);
    expect(book.lastUpdateId).toBe(110);
    expect(book.bestBid).toEqual({ price: '42150', quantity: '2' });
    expect(book.bestAsk).toEqual({ price: '42190', quantity: '3' });
  });

  it('emits update events with top-of-book summaries on live diffs', () => {
    const book = new ManagedBook('ETHUSDT');
    book.applySnapshot(snapshot(10, [['3000', '4']], [['3010', '4']]));
    const updates: { bestBid: string | null; bestAsk: string | null }[] = [];
    book.on('update', (event) => updates.push(event));

    book.receiveDiff(diff({ U: 11, u: 11, pu: 10, bids: [['3001', '7']] }));
    expect(updates).toHaveLength(1);
    expect(updates[0].bestBid).toBe('3001');
    expect(updates[0].bestAsk).toBe('3010');
    expect(book.bids(5)).toContainEqual({ price: '3001', quantity: '7' });
  });

  it('detects sequence gaps: desync event, buffering until a fresh snapshot repairs', () => {
    const book = new ManagedBook('BTCUSDT');
    book.applySnapshot(snapshot(100, [['42000', '1']], [['42200', '1']]));

    const desyncs: { reason?: string }[] = [];
    book.on('desync', (event) => desyncs.push(event));
    // pu jumps: we missed a diff.
    book.receiveDiff(diff({ U: 106, u: 110, pu: 105 }));
    expect(book.state).toBe('desynced');
    expect(desyncs).toHaveLength(1);
    expect(desyncs[0].reason).toBe('sequence-gap');

    // While desynced, diffs buffer instead of applying.
    book.receiveDiff(diff({ U: 111, u: 112, pu: 110, bids: [['42001', '2']] }));

    const resynced: unknown[] = [];
    book.on('resynced', (event) => resynced.push(event));
    book.applySnapshot(snapshot(112, [['42000', '1']], [['42200', '1']]));
    // The resync snapshot already covers the buffered diff (u=112 <= 112):
    // it is stale by definition, dropped, not applied.
    expect(book.state).toBe('live');
    expect(resynced).toHaveLength(1);
    expect(book.lastUpdateId).toBe(112);
  });

  it('an interrupted book recovers without a snapshot when the sequence is intact', () => {
    const book = new ManagedBook('BTCUSDT');
    book.applySnapshot(snapshot(100, [['42000', '1']], [['42200', '1']]));
    book.markInterrupted();
    expect(book.state).toBe('desynced');

    const resynced: { reason?: string }[] = [];
    book.on('resynced', (event) => resynced.push(event));
    // The next diff continues exactly where the book left off — nothing was
    // missed; sequence continuity is proven, no resnapshot needed.
    book.receiveDiff(diff({ U: 101, u: 102, pu: 100, bids: [['42010', '3']] }));
    expect(book.state).toBe('live');
    expect(resynced).toHaveLength(1);
    expect(resynced[0].reason).toBe('sequence-restored');
    expect(book.bestBid).toEqual({ price: '42010', quantity: '3' });
  });

  it('an interrupted book stays desynced when the next diff reveals a gap', () => {
    const book = new ManagedBook('BTCUSDT');
    book.applySnapshot(snapshot(100, [['42000', '1']], [['42200', '1']]));
    book.markInterrupted();
    book.receiveDiff(diff({ U: 105, u: 106, pu: 104 }));
    expect(book.state).toBe('desynced');
    // Internally desynced now: subsequent diffs buffer, waiting for a snapshot.
    book.receiveDiff(diff({ U: 107, u: 108, pu: 106 }));
    expect(book.state).toBe('desynced');
  });

  it('a flush that cannot bridge to the buffer tail stays desynced (snapshot-stream race)', () => {
    const book = new ManagedBook('BTCUSDT');
    // Diff arrives, then a snapshot older than its sequence position.
    book.receiveDiff(diff({ U: 106, u: 110, pu: 105, bids: [['42001', '1']] }));
    const desyncs: { reason?: string }[] = [];
    book.on('desync', (event) => desyncs.push(event));
    book.applySnapshot(snapshot(100, [['42000', '1']], [['42200', '1']]));
    // The buffered diff's U=106 cannot follow lastUpdateId=100 — gap.
    expect(book.state).toBe('desynced');
    expect(desyncs[0].reason).toBe('snapshot-stream-race');
  });

  it('waitForSync resolves when live and rejects on timeout or close', async () => {
    const book = new ManagedBook('BTCUSDT');
    const pending = book.waitForSync(20);
    await expect(pending).rejects.toThrow(/not synced within 20ms/);

    book.applySnapshot(snapshot(1, [['1', '1']], [['2', '1']]));
    await expect(book.waitForSync()).resolves.toBeUndefined();

    // Desync → waitForSync is the recovery signal.
    book.markInterrupted();
    const recovery = book.waitForSync(50);
    book.receiveDiff(diff({ U: 2, u: 3, pu: 1, bids: [['1.5', '1']] }));
    await expect(recovery).resolves.toBeUndefined();

    // A wait registered while desynced rejects when the book closes instead.
    const interrupted = new ManagedBook('ETHUSDT');
    interrupted.applySnapshot(snapshot(1, [['1', '1']], [['2', '1']]));
    interrupted.markInterrupted();
    const pendingClose = interrupted.waitForSync();
    interrupted.close();
    await expect(pendingClose).rejects.toThrow(/closed/);
  });

  it('close is terminal and drops the buffer', () => {
    const book = new ManagedBook('BTCUSDT');
    book.receiveDiff(diff({ U: 96, u: 100, pu: 95 }));
    const closed: unknown[] = [];
    book.on('close', (event) => closed.push(event));
    book.close();
    book.close(); // idempotent
    expect(book.state).toBe('closed');
    expect(closed).toHaveLength(1);
    // A late snapshot after close is ignored.
    book.applySnapshot(snapshot(100, [['42000', '1']], [['42200', '1']]));
    expect(book.state).toBe('closed');
    expect(book.isSynced).toBe(false);
  });

  it('normalizes symbols to upper case and caps the diff buffer', () => {
    const book = new ManagedBook('btcusdt', { maxBufferedDiffs: 3 });
    expect(book.symbol).toBe('BTCUSDT');
    for (let i = 0; i < 10; i += 1) {
      book.receiveDiff(diff({ U: 110 + i, u: 110 + i, pu: 109 + i }));
    }
    // Only the newest 3 survive; the snapshot decides the rest.
    book.applySnapshot(snapshot(100, [['42000', '1']], [['42200', '1']]));
    // The tail is way ahead of the snapshot: sequence gap → desynced.
    expect(book.state).toBe('desynced');
  });
});
