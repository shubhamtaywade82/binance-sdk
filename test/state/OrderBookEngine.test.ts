import { describe, expect, it, vi } from 'vitest';
import { OrderBookEngine } from '../../src/state/OrderBookEngine.js';
import type { BookSnapshotInput } from '../../src/state/OrderBook.js';
import type { BaseWS } from '../../src/ws/BaseWS.js';
import { EventBus } from '../../src/core/events.js';

/** Minimal BaseWS stub: records subscribe/unsubscribe calls and lets tests
 *  emit synthetic 'message' events to the engine. */
function fakeWs(): BaseWS & {
  emitMessage: (stream: string, payload: unknown) => void;
  subscribed: string[][];
  unsubscribed: string[][];
} {
  const listeners = new Map<string, ((stream: string, payload: unknown) => void)[]>();
  const subscribed: string[][] = [];
  const unsubscribed: string[][] = [];
  const ws = {
    on: (event: string, fn: (stream: string, payload: unknown) => void) => {
      if (event === 'message') {
        const arr = listeners.get('message') ?? [];
        arr.push(fn);
        listeners.set('message', arr);
      }
    },
    off: (event: string, fn: (stream: string, payload: unknown) => void) => {
      if (event === 'message') {
        const arr = (listeners.get('message') ?? []).filter((f) => f !== fn);
        listeners.set('message', arr);
      }
    },
    subscribe: vi.fn(async (streams: string[]) => { subscribed.push(streams); }),
    unsubscribe: vi.fn(async (streams: string[]) => { unsubscribed.push(streams); }),
    emitMessage: (stream: string, payload: unknown) => {
      for (const fn of listeners.get('message') ?? []) fn(stream, payload);
    },
    subscribed,
    unsubscribed,
  };
  return ws as unknown as BaseWS & typeof ws;
}

function snapshotInput(lastUpdateId = 100): BookSnapshotInput {
  return {
    lastUpdateId,
    bids: [['50000', '1'], ['49900', '2']],
    asks: [['50100', '0.5'], ['50200', '1.5']],
  };
}

describe('OrderBookEngine — v2 multi-symbol local book', () => {
  it('subscribe() seeds from a REST snapshot and subscribes to the diff stream', async () => {
    const ws = fakeWs();
    const fetch = vi.fn(async () => snapshotInput(100));
    const engine = new OrderBookEngine({ ws, fetchSnapshot: fetch });
    const book = await engine.subscribe('btcusdt');
    expect(book).toBeDefined();
    expect(fetch).toHaveBeenCalledWith('BTCUSDT');
    expect(ws.subscribed).toEqual([['btcusdt@depth@100ms']]);
    expect(book.isSynced).toBe(true);
    expect(engine.metrics('BTCUSDT')?.bestBid).toBe('50000');
    engine.destroy();
  });

  it('subscribe() is idempotent on a symbol already tracked', async () => {
    const ws = fakeWs();
    const fetch = vi.fn(async () => snapshotInput(100));
    const engine = new OrderBookEngine({ ws, fetchSnapshot: fetch });
    const first = await engine.subscribe('BTCUSDT');
    const second = await engine.subscribe('btcusdt'); // case-insensitive
    expect(second).toBe(first);
    expect(ws.subscribed).toHaveLength(2); // both calls subscribe
    engine.destroy();
  });

  it('unsubscribe() drops the book and tells the ws', async () => {
    const ws = fakeWs();
    const fetch = vi.fn(async () => snapshotInput(100));
    const engine = new OrderBookEngine({ ws, fetchSnapshot: fetch });
    await engine.subscribe('BTCUSDT');
    await engine.unsubscribe('btcusdt');
    expect(ws.unsubscribed).toEqual([['btcusdt@depth@100ms']]);
    expect(engine.getBook('BTCUSDT')).toBeUndefined();
    engine.destroy();
  });

  it('metrics() and symbols() reflect the live book', async () => {
    const ws = fakeWs();
    const engine = new OrderBookEngine({ ws, fetchSnapshot: () => Promise.resolve(snapshotInput(100)) });
    await engine.subscribe('BTCUSDT');
    expect(engine.symbols()).toEqual(['BTCUSDT']);
    const m = engine.metrics('BTCUSDT');
    expect(m).toBeDefined();
    expect(m!.bestBid).toBe('50000');
    expect(m!.bestAsk).toBe('50100');
    engine.destroy();
  });

  it('applies in-order diffs that sequence-match the snapshot (pu == lastUpdateId)', async () => {
    const ws = fakeWs();
    const engine = new OrderBookEngine({ ws, fetchSnapshot: () => Promise.resolve(snapshotInput(100)) });
    const book = await engine.subscribe('BTCUSDT');
    // Diff at u=101, pu=100 — sequential. New bid at 50500 beats the old best of 50000.
    ws.emitMessage('btcusdt@depth', {
      e: 'depthUpdate', s: 'BTCUSDT', U: 101, u: 101, pu: 100,
      b: [['50500', '3']], a: [['49950', '0.25']],
    });
    expect(engine.metrics('BTCUSDT')?.bestBid).toBe('50500');
    expect(engine.metrics('BTCUSDT')?.bestAsk).toBe('49950');
    engine.destroy();
  });

  it('ignores messages on streams that are not @depth', async () => {
    const ws = fakeWs();
    const engine = new OrderBookEngine({ ws, fetchSnapshot: () => Promise.resolve(snapshotInput(100)) });
    await engine.subscribe('BTCUSDT');
    ws.emitMessage('btcusdt@aggTrade', { e: 'aggTrade', s: 'BTCUSDT' });
    // book unchanged
    expect(engine.metrics('BTCUSDT')?.bestBid).toBe('50000');
    engine.destroy();
  });

  it('ignores frames missing the depthUpdate event tag', async () => {
    const ws = fakeWs();
    const engine = new OrderBookEngine({ ws, fetchSnapshot: () => Promise.resolve(snapshotInput(100)) });
    await engine.subscribe('BTCUSDT');
    ws.emitMessage('btcusdt@depth', { e: 'kline', s: 'BTCUSDT' });
    expect(engine.metrics('BTCUSDT')?.bestBid).toBe('50000');
    engine.destroy();
  });

  it('emits orderBook.desync and triggers a resync when a diff does not sequence', async () => {
    const events = new EventBus();
    const desyncs: { symbol: string }[] = [];
    events.scoped('orderBook').on('orderBook.desync', (e) => desyncs.push((e as unknown as { payload: { symbol: string } }).payload));
    const synced: { symbol: string; lastUpdateId: number }[] = [];
    events.scoped('orderBook').on('orderBook.synced', (e) => synced.push((e as unknown as { payload: { symbol: string; lastUpdateId: number } }).payload));

    const ws = fakeWs();
    let snapshotCallCount = 0;
    const fetch = vi.fn(async () => {
      snapshotCallCount += 1;
      // First snapshot is pu=100; second (resync) is pu=200.
      return snapshotInput(snapshotCallCount === 1 ? 100 : 200);
    });
    const engine = new OrderBookEngine({ ws, fetchSnapshot: fetch, events, resyncDelayMs: 1 });

    await engine.subscribe('BTCUSDT');
    // Diff at pu=999 — does not sequence on the pu=100 snapshot.
    ws.emitMessage('btcusdt@depth', {
      e: 'depthUpdate', s: 'BTCUSDT', U: 1000, u: 1010, pu: 999,
      b: [['49950', '3']], a: [['50150', '0.25']],
    });
    expect(desyncs).toHaveLength(1);
    expect(desyncs[0]!.symbol).toBe('BTCUSDT');

    // Wait for the async resync to complete.
    await new Promise((r) => setTimeout(r, 25));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(synced.some((s) => s.lastUpdateId === 200)).toBe(true);
    engine.destroy();
  });

  it('emits orderBook.sync.failed when the REST snapshot rejects', async () => {
    const events = new EventBus();
    const failures: { symbol: string; message: string }[] = [];
    events.scoped('orderBook').on('orderBook.sync.failed', (e) =>
      failures.push((e as unknown as { payload: { symbol: string; message: string } }).payload),
    );
    const ws = fakeWs();
    const fetch = vi.fn(async () => { throw new Error('rest-down'); });
    const engine = new OrderBookEngine({ ws, fetchSnapshot: fetch, events });
    await expect(engine.subscribe('BTCUSDT')).resolves.toBeDefined();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.symbol).toBe('BTCUSDT');
    expect(failures[0]!.message).toBe('rest-down');
    engine.destroy();
  });

  it('destroy() detaches the ws listener and clears books', async () => {
    const ws = fakeWs();
    const engine = new OrderBookEngine({ ws, fetchSnapshot: () => Promise.resolve(snapshotInput(100)) });
    await engine.subscribe('BTCUSDT');
    engine.destroy();
    expect(engine.symbols()).toHaveLength(0);
    // Emitting a diff after destroy must not throw and must not change state.
    expect(() =>
      ws.emitMessage('btcusdt@depth', {
        e: 'depthUpdate', s: 'BTCUSDT', U: 101, u: 101, pu: 100,
        b: [['1', '1']], a: [['2', '2']],
      }),
    ).not.toThrow();
  });

  it('honors the 500ms update speed option', async () => {
    const ws = fakeWs();
    const engine = new OrderBookEngine({
      ws,
      fetchSnapshot: () => Promise.resolve(snapshotInput(100)),
      updateSpeed: '500ms',
    });
    await engine.subscribe('BTCUSDT');
    expect(ws.subscribed).toEqual([['btcusdt@depth@500ms']]);
    engine.destroy();
  });
});
