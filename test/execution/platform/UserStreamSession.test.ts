import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/core/events.js';
import { UserStreamSession } from '../../../src/execution/platform/UserStreamSession.js';
import type { ListenKeyApi } from '../../../src/execution/platform/types.js';
import {
  accountUpdateFrame,
  orderTradeUpdateFrame,
  startMockUserStreamServer,
  type MockUserStreamServer,
} from './helpers.js';

function mockListenKeyApi(): ListenKeyApi & {
  create: ReturnType<typeof vi.fn>;
  keepAlive: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  let counter = 0;
  return {
    create: vi.fn(async () => `key-${(counter += 1)}`),
    keepAlive: vi.fn(async () => {
      /* ok */
    }),
    close: vi.fn(async () => {
      /* ok */
    }),
  };
}

/** Localhost WS delivery needs a few I/O turns — setImmediate alone races TCP. */
function deliveryDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('UserStreamSession', () => {
  let server: MockUserStreamServer;
  let api: ReturnType<typeof mockListenKeyApi>;

  beforeEach(async () => {
    server = await startMockUserStreamServer();
    api = mockListenKeyApi();
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  function makeSession(overrides: Record<string, unknown> = {}): UserStreamSession {
    return new UserStreamSession({
      product: 'usdm',
      listenKeyApi: api,
      userStreamUrl: server.baseUrl,
      connection: { reconnectDelayMs: 10, maxReconnectDelayMs: 50, rotationMs: 0, staleMs: 0 },
      ...overrides,
    });
  }

  it('starts: creates the key, connects on /<key>, goes live', async () => {
    const session = makeSession();
    const key = await session.start();
    await session.waitForOpen(2000);

    expect(key).toBe('key-1');
    expect(session.listenKey).toBe('key-1');
    expect(session.sessionState).toBe('live');
    expect(server.connectionPaths).toEqual(['/key-1']);
    session.close();
  });

  it('start() is idempotent while live: one create, same key', async () => {
    const session = makeSession();
    const first = await session.start();
    await session.waitForOpen(2000);
    const second = await session.start();
    expect(second).toBe(first);
    expect(api.create).toHaveBeenCalledTimes(1);
    session.close();
  });

  it('emits userData frames with decimal strings preserved', async () => {
    const session = makeSession();
    await session.start();
    await session.waitForOpen(2000);

    const events: unknown[] = [];
    session.on('userData', (event: unknown) => events.push(event));
    server.send(
      orderTradeUpdateFrame({
        cumulativeQty: '123.456',
        avgPrice: '50000.1',
      }),
    );
    server.send(accountUpdateFrame({ amount: '0.001' }));

    await deliveryDelay();
    expect(events).toHaveLength(2);
    const order = events[0] as { e: string; o: { z: string; ap: string } };
    expect(order.e).toBe('ORDER_TRADE_UPDATE');
    // Raw decimal strings survive — never coerced through Number.
    expect(order.o.z).toBe('123.456');
    expect(order.o.ap).toBe('50000.1');
    session.close();
  });

  it('emits events by type name (ORDER_TRADE_UPDATE, ACCOUNT_UPDATE)', async () => {
    const session = makeSession();
    await session.start();
    await session.waitForOpen(2000);

    const seen: string[] = [];
    session.on('ORDER_TRADE_UPDATE', () => seen.push('order'));
    session.on('ACCOUNT_UPDATE', () => seen.push('account'));
    server.send(orderTradeUpdateFrame({}));
    server.send(accountUpdateFrame({}));
    await deliveryDelay();
    expect(seen).toEqual(['order', 'account']);
    session.close();
  });

  it('passes unknown-but-shaped event types through, and surfaces garbage as error', async () => {
    const session = makeSession();
    await session.start();
    await session.waitForOpen(2000);

    const userData: unknown[] = [];
    const errors: Error[] = [];
    session.on('userData', (event: unknown) => userData.push(event));
    session.on('error', (err: Error) => errors.push(err));

    server.send({ e: 'TRADE_LITE', T: 123, something: 'new event type' });
    server.send('this is not json');
    server.send({ nope: 'no event type either' });
    await deliveryDelay();

    // Unknown event type passes through untouched.
    expect((userData[0] as { e: string }).e).toBe('TRADE_LITE');
    // Shapeless frames produce errors without killing the stream.
    expect(errors).toHaveLength(1);

    // The stream still delivers afterwards.
    server.send(orderTradeUpdateFrame({ clientOrderId: 'after-garbage' }));
    await deliveryDelay();
    expect(userData).toHaveLength(2);
    session.close();
  });

  it('reconnects transparently after a server drop', async () => {
    const session = makeSession();
    await session.start();
    await session.waitForOpen(2000);

    const states: string[] = [];
    session.on('sessionState', (state: string) => states.push(state));

    server.dropClients();
    // The reconnect may complete before we can sample the intermediate state —
    // wait for the replacement connection to land, then assert on the recorded
    // transitions.
    await vi.waitFor(
      () => {
        expect(server.connectionPaths.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 2000 },
    );
    await session.waitForOpen(2000);
    expect(session.sessionState).toBe('live');
    expect(states).toContain('reconnecting');
    // Same listen key on the replacement connection.
    expect(server.connectionPaths.filter((p) => p === '/key-1').length).toBeGreaterThanOrEqual(2);
    session.close();
  });

  it('runs the 30-minute keep-alive and rotates the key after repeated failures', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rotated: string[] = [];
    const session = makeSession({ keepAliveIntervalMs: 60_000, keepAliveFailuresBeforeRotation: 3 });
    await session.start();
    // Advance timers past the open handshake (real socket events with
    // shouldAdvanceTime auto-advance).
    await vi.advanceTimersByTimeAsync(5);

    session.on('session.rotated', (info: { reason: string }) => rotated.push(info.reason));

    // Healthy keep-alives: three ticks, all renewing key-1.
    await vi.advanceTimersByTimeAsync(180_000);
    expect(api.keepAlive).toHaveBeenCalledTimes(3);
    expect(api.keepAlive).toHaveBeenLastCalledWith('key-1');
    expect(rotated).toHaveLength(0);

    // Three failing keep-alives in a row → rotation onto key-2.
    api.keepAlive.mockRejectedValue(new Error('listen key expired') as never);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(session.listenKey).toBe('key-2');
    expect(rotated).toHaveLength(1);
    expect(rotated[0]).toMatch(/keep-alive-failure-3/);
    // The connection re-established on the new key.
    await vi.waitFor(() => {
      expect(server.connectionPaths).toContain('/key-2');
    });
    session.close();
  });

  it('rotates the key after a reconnect storm (server accepts-then-kills every connection)', async () => {
    // The accept-then-kill signature is what a dead listen key looks like on
    // the wire: the ws client's 'open' fires (handshake completed) so the
    // reconnect-attempt counter resets every cycle — only flap detection
    // (open → die without delivering a single frame) escapes the loop.
    const session = makeSession({
      flapWindowMs: 5_000,
      flapFailuresBeforeRotation: 2,
    });
    await session.start();
    await session.waitForOpen(2000);

    const rotated: string[] = [];
    session.on('session.rotated', (info: { reason: string }) => rotated.push(info.reason));

    server.setRejectNewConnections(true);
    server.dropClients();

    await vi.waitFor(
      () => {
        expect(rotated.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 4000 },
    );
    // While the server keeps killing connections every key fails too, so the
    // session keeps rotating — the invariant is "off the dead key", not a
    // specific key number.
    expect(session.listenKey).not.toBe('key-1');
    expect(api.create.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(rotated[0]).toMatch(/flapping-connection-/);

    // Recovery: accept connections again, let the reconnect machinery land.
    server.setRejectNewConnections(false);
    await session.waitForOpen(4000);
    expect(session.sessionState).toBe('live');
    session.close();
  }, 10000);

  it('close() stops keep-alive, deletes the key, is idempotent, and start() after close rejects', async () => {
    const session = makeSession();
    await session.start();
    await session.waitForOpen(2000);

    const states: string[] = [];
    session.on('sessionState', (state: string) => states.push(state));
    session.close();
    session.close(); // idempotent

    expect(session.sessionState).toBe('closed');
    expect(api.close).toHaveBeenCalledTimes(1);
    expect(api.close).toHaveBeenCalledWith('key-1');
    await expect(session.start()).rejects.toThrow(/closed/);

    // No further keep-alive ticks after close (fake clock).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(api.keepAlive).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('publishes session lifecycle events to the observability bus', async () => {
    const events = new EventBus();
    const bus: string[] = [];
    events
      .scoped('execution')
      .on('session.started', (event: { payload: Record<string, unknown> }) => {
        bus.push(`started:${String(event.payload.listenKey)}`);
      });
    events.scoped('execution').on('session.closed', () => bus.push('closed'));

    const session = makeSession({ events });
    await session.start();
    session.close();
    expect(bus).toEqual(['started:key-1', 'closed']);
  });

  it('satisfies the execution manager user-stream contract (userData on/off)', async () => {
    const session = makeSession();
    await session.start();
    await session.waitForOpen(2000);

    const seen: unknown[] = [];
    const listener = (event: unknown): void => {
      seen.push(event);
    };
    session.on('userData', listener);
    server.send(orderTradeUpdateFrame({}));
    await deliveryDelay();
    session.off('userData', listener);
    server.send(orderTradeUpdateFrame({ clientOrderId: 'after-detach' }));
    await deliveryDelay();

    expect(seen).toHaveLength(1);
    session.close();
  });
});
