import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreContext } from '../../../src/core/context.js';
import { ExecutionPlatform } from '../../../src/execution/platform/ExecutionPlatform.js';
import { ExecutionManager } from '../../../src/execution/ExecutionManager.js';
import { BinanceApiError, NetworkError } from '../../../src/errors/index.js';
import { USDMClient } from '../../../src/products/usdm/USDMClient.js';
import type { FuturesTrading } from '../../../src/resources/FuturesTrading.js';
import {
  accountUpdateFrame,
  orderTradeUpdateFrame,
  startMockUserStreamServer,
  type MockUserStreamServer,
} from './helpers.js';

const server = setupServer();
beforeAll(() =>
  // The ws library performs its WebSocket handshake through Node's http
  // module, so MSW sees the local mock-server upgrades as HTTP requests.
  // Localhost traffic is the WS test fixture — bypass it, error on anything
  // else genuinely unhandled.
  server.listen({
    onUnhandledRequest: (request, print) => {
      if (request.url.startsWith('http://127.0.0.1')) return;
      print.error();
    },
  }),
);
afterEach(async () => {
  // Session close fires the listen-key DELETE asynchronously; give those
  // fire-and-forget requests a beat to complete before wiping handlers,
  // otherwise MSW reports them as unhandled.
  await new Promise((resolve) => setTimeout(resolve, 30));
  server.resetHandlers();
});
afterAll(() => server.close());

const LISTEN_KEY_URL = 'https://fapi.binance.com/fapi/v1/listenKey';

function mockListenKeyHandlers(overrides: { createStatus?: number } = {}): void {
  server.use(
    http.post(LISTEN_KEY_URL, () =>
      overrides.createStatus
        ? HttpResponse.json({ code: -1000, msg: 'UNKNOWN' }, { status: overrides.createStatus })
        : HttpResponse.json({ listenKey: 'rest-key-1' }),
    ),
    http.put(LISTEN_KEY_URL, () => HttpResponse.json({})),
    http.delete(LISTEN_KEY_URL, () => HttpResponse.json({})),
  );
}

function mockTrading(): FuturesTrading {
  return {
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
  } as unknown as FuturesTrading;
}

function ackResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderId: 12345,
    symbol: 'BTCUSDT',
    status: 'NEW',
    clientOrderId: 'nbsdk-live-1',
    price: '50000',
    avgPrice: '0',
    origQty: '1',
    executedQty: '0',
    cumQuote: '0',
    type: 'LIMIT',
    reduceOnly: false,
    side: 'BUY',
    positionSide: 'BOTH',
    timeInForce: 'GTC',
    time: 1,
    updateTime: 1,
    ...overrides,
  };
}

/** Localhost WS delivery needs a few I/O turns — setImmediate alone races TCP. */
function deliveryDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('ExecutionPlatform (v3 milestone 3)', () => {
  let ws: MockUserStreamServer;

  async function makeCore(): Promise<CoreContext> {
    return new CoreContext({
      apiKey: 'k',
      apiSecret: 's',
      wsUserBase: ws.baseUrl,
      maxRetries: 0,
      timeoutMs: 3000,
    });
  }

  beforeAll(async () => {
    ws = await startMockUserStreamServer();
  });

  afterAll(async () => {
    await ws.close();
  });

  it('starts a session over the shared context and feeds order + position trackers', async () => {
    mockListenKeyHandlers();
    const core = await makeCore();
    const platform = new ExecutionPlatform({ product: 'usdm', core });

    expect(platform.userSession).toBeNull();
    expect(platform.hasUserSession()).toBe(false);

    const session = await platform.startUserSession();
    await session.waitForOpen(2000);

    expect(platform.userSession).toBe(session);
    expect(session.listenKey).toBe('rest-key-1');
    expect(ws.connectionPaths.at(-1)).toBe('/rest-key-1');
    expect(core.hasHttp('fapiRoot')).toBe(true); // shared transport, built on demand

    ws.send(
      orderTradeUpdateFrame({
        clientOrderId: 'outside-1',
        executionType: 'TRADE',
        orderStatus: 'PARTIALLY_FILLED',
        lastQty: '0.0005',
        lastPrice: '50000.00',
        cumulativeQty: '0.0005',
        avgPrice: '50000.00',
        tradeId: 7001,
      }),
    );
    ws.send(accountUpdateFrame({ amount: '0.0005', entryPrice: '50000.00' }));
    await deliveryDelay();

    const order = platform.orders.get('outside-1')!;
    expect(order.status).toBe('PARTIALLY_FILLED');
    expect(order.executedQuantity).toBe('0.0005');
    expect(order.fills).toHaveLength(1);

    const position = platform.positions.get('BTCUSDT')!;
    expect(position.positionAmount).toBe('0.0005');
    expect(position.entryPrice).toBe('50000');

    platform.close();
    expect(platform.userSession).toBeNull();
  });

  it('auto-attaches the execution manager: ledger tracks live fills from the stream', async () => {
    mockListenKeyHandlers();
    const core = await makeCore();
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(
      ackResponse({ clientOrderId: 'nbsdk-live-1' }) as never,
    );
    const manager = new ExecutionManager(trading, {});
    const platform = new ExecutionPlatform({ product: 'usdm', core, executionManager: manager });

    await platform.startUserSession();
    await platform.userSession!.waitForOpen(2000);

    const execution = await manager.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      quantity: '1',
      price: '50000',
      intentId: 'intent-live',
      newClientOrderId: 'nbsdk-live-1',
    });
    expect(execution.status).toBe('NEW');

    // The user stream — not the REST ack — carries the fill.
    ws.send(
      orderTradeUpdateFrame({
        clientOrderId: 'nbsdk-live-1',
        executionType: 'TRADE',
        orderStatus: 'FILLED',
        lastQty: '1',
        lastPrice: '50001.00',
        cumulativeQty: '1',
        avgPrice: '50001.00',
        tradeId: 7002,
        commission: '0.0004',
      }),
    );
    await vi.waitFor(() => {
      expect(manager.getExecution('intent-live')!.status).toBe('FILLED');
    });

    const live = manager.getExecution('intent-live')!;
    expect(live.executedQuantity).toBe('1');
    expect(live.fills).toHaveLength(1);
    expect(live.fills[0]).toMatchObject({ price: '50001.00', quantity: '1' });

    // Detached when the session closes.
    platform.close();
    expect(manager.getExecutionByClientOrderId('nbsdk-live-1')).toBeDefined();
  });

  it('startUserSession is idempotent: one session, one listen key', async () => {
    mockListenKeyHandlers();
    const core = await makeCore();
    const platform = new ExecutionPlatform({ product: 'usdm', core });

    const pathsBefore = ws.connectionPaths.length;
    const first = await platform.startUserSession();
    await first.waitForOpen(2000); // connect is fire-and-forget — wait for it to land
    const second = await platform.startUserSession();
    expect(second).toBe(first);
    expect(ws.connectionPaths.length).toBe(pathsBefore + 1); // exactly one new connection
    platform.close();
  });

  it('propagates listen-key failures: session torn down, no session retained', async () => {
    mockListenKeyHandlers({ createStatus: 500 });
    const core = await makeCore();
    const platform = new ExecutionPlatform({ product: 'usdm', core });

    const socketsBefore = ws.sockets.length;
    await expect(platform.startUserSession()).rejects.toThrow(BinanceApiError);
    expect(platform.hasUserSession()).toBe(false);
    expect(platform.userSession).toBeNull();
    expect(ws.sockets.length).toBe(socketsBefore); // no WS connection was opened
  });

  it('exposes the semantic retry classifier', async () => {
    mockListenKeyHandlers();
    const core = await makeCore();
    const platform = new ExecutionPlatform({ product: 'usdm', core });

    expect(platform.classify(new NetworkError('down')).safety).toBe('reconciliation-required');
    expect(platform.classify(new BinanceApiError('no order', -2013, 400)).safety).toBe('safe');
    expect(platform.classify(new BinanceApiError('filter', -1013, 400)).safety).toBe('never-retry');
  });

  it('supports a spot product: REST routes and wsSpotUser endpoint', async () => {
    let seenCreateUrl = '';
    server.use(
      http.post('https://api.binance.com/api/v3/userDataStream', ({ request }) => {
        seenCreateUrl = request.url;
        return HttpResponse.json({ listenKey: 'spot-key-1' });
      }),
      http.put('https://api.binance.com/api/v3/userDataStream', () => HttpResponse.json({})),
      http.delete('https://api.binance.com/api/v3/userDataStream', () => HttpResponse.json({})),
    );
    const core = new CoreContext({
      apiKey: 'k',
      apiSecret: 's',
      wsUserBase: ws.baseUrl,
      maxRetries: 0,
    });
    const platform = new ExecutionPlatform({ product: 'spot', core });

    const session = await platform.startUserSession();
    await session.waitForOpen(2000);
    expect(session.listenKey).toBe('spot-key-1');
    expect(seenCreateUrl).toBe('https://api.binance.com/api/v3/userDataStream');
    expect(ws.connectionPaths.at(-1)).toBe('/spot-key-1');

    // Spot execution reports fold into the order tracker.
    ws.send({ e: 'executionReport', s: 'ETHBTC', c: 'spot-1', X: 'NEW', z: '0', Z: '0', i: 1, T: 1 });
    await deliveryDelay();
    expect(platform.orders.get('spot-1')!.status).toBe('NEW');

    platform.close();
  });

  it('USDMClient exposes the platform lazily and closes it with the client', async () => {
    mockListenKeyHandlers();
    const core = await makeCore();
    const usdm = new USDMClient(core);

    const platform = usdm.executionPlatform;
    expect(platform).toBe(usdm.executionPlatform); // cached identity
    expect(platform.product).toBe('usdm');
    expect(platform.hasUserSession()).toBe(false);
    expect(usdm.core).toBe(core);

    const session = await platform.startUserSession();
    await session.waitForOpen(2000);
    expect(session.listenKey).toBe('rest-key-1');

    // The product's execution manager is wired to the platform session.
    ws.send(orderTradeUpdateFrame({ clientOrderId: 'nbsdk-live-1', orderStatus: 'FILLED' }));
    await deliveryDelay();

    usdm.close();
    expect(platform.userSession).toBeNull();
  });
});
