import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreContext } from '../../../src/core/context.js';
import { BookEngine } from '../../../src/state/platform/BookEngine.js';
import { USDMClient } from '../../../src/products/usdm/USDMClient.js';
import { startMockWsServer, type MockWsServer } from '../../ws/platform/helpers.js';

const server = setupServer();
beforeAll(() =>
  server.listen({
    onUnhandledRequest: (request, print) => {
      if (request.url.startsWith('http://127.0.0.1')) return;
      print.error();
    },
  }),
);
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  server.resetHandlers();
});
afterAll(() => server.close());

const USDM_DEPTH = 'https://fapi.binance.com/fapi/v1/depth';
const SPOT_DEPTH = 'https://api.binance.com/api/v3/depth';

/** Futures-style depth frame for the combined stream. */
function usdmDepthFrame(input: {
  U: number;
  u: number;
  pu?: number;
  s?: string;
  bids?: [string, string][];
  asks?: [string, string][];
}): Record<string, unknown> {
  return {
    e: 'depthUpdate',
    E: Date.now(),
    s: input.s ?? 'BTCUSDT',
    U: input.U,
    u: input.u,
    ...(input.pu !== undefined ? { pu: input.pu } : {}),
    b: input.bids ?? [],
    a: input.asks ?? [],
  };
}

function snapshotJson(lastUpdateId: number, bids: [string, string][], asks: [string, string][]) {
  return HttpResponse.json({ lastUpdateId, bids, asks });
}

describe('BookEngine (v3 state platform, usdm family)', () => {
  let ws: MockWsServer;
  let core: CoreContext;

  beforeEach(async () => {
    ws = await startMockWsServer();
    // maxRetries: 0 — REST failures fail fast (the default backoff chain
    // alone outlives a test timeout).
    core = new CoreContext({ apiKey: 'k', apiSecret: 's', wsBase: `${ws.url}/stream`, maxRetries: 0 });
  });
  afterEach(() => {
    core.closeWebSockets();
    return ws.close();
  });

  it('watch → subscribe, snapshot, go live; diffs fold with exact decimals', async () => {
    server.use(http.get(USDM_DEPTH, () => snapshotJson(100, [['42000', '5']], [['42200', '4']])));

    const engine = new BookEngine({ product: 'usdm', core });
    const book = await engine.watch('BTCUSDT');

    expect(book.state).toBe('live');
    expect(book.symbol).toBe('BTCUSDT');
    expect(book.bestBid).toEqual({ price: '42000', quantity: '5' });
    expect(book.bestAsk).toEqual({ price: '42200', quantity: '4' });
    expect(book.metrics().spread).not.toBeNull();
    // The stream the book rides is a pooled platform subscription.
    expect(core.ws.usdm.getSubscription('btcusdt@depth@100ms')).toBeDefined();

    const updates: { bestBid: string | null }[] = [];
    book.on('update', (event) => updates.push(event));
    ws.emitStream('btcusdt@depth@100ms', usdmDepthFrame({ U: 101, u: 105, pu: 100, bids: [['42010', '6']] }));
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].bestBid).toBe('42010');
    expect(book.bestBid).toEqual({ price: '42010', quantity: '6' });

    engine.close();
    expect(book.state).toBe('closed');
    expect(core.ws.usdm.getSubscription('btcusdt@depth@100ms')).toBeUndefined();
  });

  it('buffers diffs that arrive while the snapshot request is in flight', async () => {
    let releaseSnapshot: (() => void) | undefined;
    let snapshotRequested = false;
    server.use(
      http.get(USDM_DEPTH, async () => {
        snapshotRequested = true;
        await new Promise<void>((resolve) => {
          releaseSnapshot = resolve;
        });
        return snapshotJson(100, [['42000', '5']], [['42200', '4']]);
      }),
    );

    const engine = new BookEngine({ product: 'usdm', core });
    const watching = engine.watch('BTCUSDT');
    // Wait for the snapshot request to be in flight (subscribe already done).
    await vi.waitFor(() => expect(snapshotRequested).toBe(true));
    // Diffs land while the REST snapshot is pending — they must buffer.
    ws.emitStream('btcusdt@depth@100ms', usdmDepthFrame({ U: 101, u: 105, pu: 100, bids: [['42010', '6']] }));
    ws.emitStream('btcusdt@depth@100ms', usdmDepthFrame({ U: 106, u: 110, pu: 105, asks: [['42190', '2']] }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    releaseSnapshot?.();

    const book = await watching;
    expect(book.state).toBe('live');
    // Buffered tail applied on top of the snapshot: no blind window.
    expect(book.lastUpdateId).toBe(110);
    expect(book.bestBid).toEqual({ price: '42010', quantity: '6' });
    expect(book.bestAsk).toEqual({ price: '42190', quantity: '2' });
    engine.close();
  });

  it('a sequence gap desyncs, and the engine resnapshots the book back to live', async () => {
    let current = { id: 100, bids: [['42000', '5']] as [string, string][], asks: [['42200', '4']] as [string, string][] };
    server.use(http.get(USDM_DEPTH, () => snapshotJson(current.id, current.bids, current.asks)));

    // Resync delay long enough that the desync state is observable before
    // the engine's own repair lands (the repair is what we test next).
    const engine = new BookEngine({ product: 'usdm', core, resyncDelayMs: 200 });
    const book = await engine.watch('BTCUSDT');
    expect(book.state).toBe('live');

    const desyncs: { reason?: string }[] = [];
    book.on('desync', (event) => desyncs.push(event));
    const resynced: unknown[] = [];
    book.on('resynced', (event) => resynced.push(event));

    // Skip a sequence id — the pu check trips.
    ws.emitStream('btcusdt@depth@100ms', usdmDepthFrame({ U: 112, u: 115, pu: 111 }));
    await vi.waitFor(() => expect(desyncs).toHaveLength(1));
    expect(desyncs[0].reason).toBe('sequence-gap');
    expect(book.state).toBe('desynced');

    // Fresh REST state for the resync pass.
    current = { id: 115, bids: [['42001', '7']], asks: [['42201', '3']] };
    await vi.waitFor(() => expect(book.state).toBe('live'), { timeout: 2000 });
    expect(resynced).toHaveLength(1);
    expect(book.lastUpdateId).toBe(115);
    expect(book.bestBid).toEqual({ price: '42001', quantity: '7' });
    engine.close();
  });

  it('watch returns the existing book for a live symbol (per-symbol singletons)', async () => {
    server.use(http.get(USDM_DEPTH, () => snapshotJson(100, [['42000', '5']], [['42200', '4']])));
    const engine = new BookEngine({ product: 'usdm', core });
    const first = await engine.watch('BTCUSDT');
    const again = await engine.watch('btcusdt');
    expect(again).toBe(first);
    expect(engine.symbols()).toEqual(['BTCUSDT']);
    engine.close();
  });

  it('a failing snapshot rejects watch and leaves no half-wired state', async () => {
    server.use(http.get(USDM_DEPTH, () => HttpResponse.json({ code: -1000, msg: 'boom' }, { status: 500 })));
    const engine = new BookEngine({ product: 'usdm', core });
    await expect(engine.watch('BTCUSDT')).rejects.toThrow();
    expect(engine.getBook('BTCUSDT')).toBeUndefined();
    expect(engine.symbols()).toEqual([]);
    // The subscription was released (server-level UNSUBSCRIBE sent).
    expect(core.ws.usdm.getSubscription('btcusdt@depth@100ms')).toBeUndefined();
    engine.close();
  });

  it('unwatch closes the book and releases the stream; rewatch works', async () => {
    server.use(http.get(USDM_DEPTH, () => snapshotJson(100, [['42000', '5']], [['42200', '4']])));
    const engine = new BookEngine({ product: 'usdm', core });
    const book = await engine.watch('BTCUSDT');
    await engine.unwatch('BTCUSDT');
    expect(book.state).toBe('closed');
    expect(engine.getBook('BTCUSDT')).toBeUndefined();
    expect(core.ws.usdm.getSubscription('btcusdt@depth@100ms')).toBeUndefined();

    const fresh = await engine.watch('BTCUSDT');
    expect(fresh).not.toBe(book);
    expect(fresh.state).toBe('live');
    engine.close();
  });

  it('manages several symbols on the same pooled family', async () => {
    server.use(http.get(USDM_DEPTH, () => snapshotJson(100, [['42000', '5']], [['42200', '4']])));
    const engine = new BookEngine({ product: 'usdm', core });
    const [btc, eth] = await Promise.all([engine.watch('BTCUSDT'), engine.watch('ETHUSDT')]);
    expect(engine.symbols().sort()).toEqual(['BTCUSDT', 'ETHUSDT']);
    ws.emitStream('ethusdt@depth@100ms', usdmDepthFrame({ U: 101, u: 102, pu: 100, s: 'ETHUSDT', asks: [['3000', '1']] }));
    await vi.waitFor(() => expect(eth.bestAsk).toEqual({ price: '3000', quantity: '1' }));
    expect(btc.bestBid).toEqual({ price: '42000', quantity: '5' });
    engine.close();
    expect(btc.state).toBe('closed');
    expect(eth.state).toBe('closed');
  });
});

describe('BookEngine (spot family)', () => {
  let ws: MockWsServer;
  let core: CoreContext;

  beforeEach(async () => {
    ws = await startMockWsServer();
    core = new CoreContext({ apiKey: 'k', apiSecret: 's', wsBase: `${ws.url}/stream` });
  });
  afterEach(() => {
    core.closeWebSockets();
    return ws.close();
  });

  it('spot books ride the spot family and detect gaps without pu (U-based)', async () => {
    server.use(http.get(SPOT_DEPTH, () => snapshotJson(50, [['2000', '3']], [['2010', '3']])));
    const engine = new BookEngine({ product: 'spot', core });
    const book = await engine.watch('ETHUSDT');

    // Spot rides the spot family, not usdm.
    expect(core.ws.spot.getSubscription('ethusdt@depth@100ms')).toBeDefined();
    expect(core.ws.usdm.activeStreams()).not.toContain('ethusdt@depth@100ms');

    // Spot diffs carry no pu — continuity is U-based.
    ws.emitStream('ethusdt@depth@100ms', {
      e: 'depthUpdate',
      E: Date.now(),
      s: 'ETHUSDT',
      U: 51,
      u: 55,
      b: [['2001', '2']] as [string, string][],
      a: [],
    });
    await vi.waitFor(() => expect(book.bestBid?.price).toBe('2001'));

    let current = 55;
    server.use(http.get(SPOT_DEPTH, () => snapshotJson(current, [['2001', '2']], [['2010', '3']])));
    ws.emitStream('ethusdt@depth@100ms', {
      e: 'depthUpdate',
      E: Date.now(),
      s: 'ETHUSDT',
      U: 60,
      u: 62,
      b: [],
      a: [['2011', '1']] as [string, string][],
    });
    await vi.waitFor(() => expect(book.state).toBe('desynced'));
    current = 62;
    await vi.waitFor(() => expect(book.state).toBe('live'), { timeout: 2000 });
    expect(book.lastUpdateId).toBe(62);
    engine.close();
  });
});

describe('USDMClient books integration', () => {
  let ws: MockWsServer;
  let core: CoreContext;

  beforeEach(async () => {
    ws = await startMockWsServer();
    core = new CoreContext({ apiKey: 'k', apiSecret: 's', wsBase: `${ws.url}/stream` });
  });
  afterEach(() => {
    core.closeWebSockets();
    return ws.close();
  });

  it('usdm.books is a lazy, stable BookEngine closed by client.close()', async () => {
    const usdm = new USDMClient(core);
    expect(usdm.books).toBeInstanceOf(BookEngine);
    expect(usdm.books).toBe(usdm.books); // stable identity

    server.use(http.get(USDM_DEPTH, () => snapshotJson(100, [['42000', '5']], [['42200', '4']])));
    const book = await usdm.books.watch('BTCUSDT');
    expect(book.state).toBe('live');

    usdm.close();
    expect(book.state).toBe('closed');
    expect(usdm.books.isClosed).toBe(true);
  });
});
