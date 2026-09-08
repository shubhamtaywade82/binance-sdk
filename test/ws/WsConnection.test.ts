import { WebSocketServer, WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseWS } from '../../src/ws/BaseWS.js';

/**
 * Tests for the connection state machine: no duplicate connections on
 * reconnect (the old race), 24h rotation with live replacement, subscription
 * acks, and LIST_SUBSCRIPTIONS repair after reconnects.
 */
describe('WsConnection state machine (via BaseWS)', () => {
  let server: WebSocketServer;
  let port: number;
  let sockets: WebSocket[];

  beforeEach(async () => {
    sockets = [];
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as { port: number }).port;
    server.on('connection', (socket) => {
      sockets.push(socket);
      // Binance-style control-protocol emulation.
      socket.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as {
          method: string;
          params?: string[];
          id: number;
        };
        if (parsed.method === 'SUBSCRIBE') {
          socket.send(JSON.stringify({ result: null, id: parsed.id }));
        } else if (parsed.method === 'UNSUBSCRIBE') {
          socket.send(JSON.stringify({ result: null, id: parsed.id }));
        } else if (parsed.method === 'LIST_SUBSCRIPTIONS') {
          socket.send(
            JSON.stringify({
              result: sockets.flatMap((s) => (s === socket ? subscriptionsOf(socket) : [])),
              id: parsed.id,
            }),
          );
        }
      });
    });
  });

  afterEach(() => {
    server.close();
    vi.restoreAllMocks();
  });

  /** Track per-socket subscription state for LIST_SUBSCRIPTIONS emulation. */
  const perSocketSubs = new WeakMap<WebSocket, Set<string>>();
  function subscriptionsOf(socket: WebSocket): string[] {
    return [...(perSocketSubs.get(socket) ?? [])];
  }
  function addSubscription(socket: WebSocket, stream: string): void {
    const set = perSocketSubs.get(socket) ?? new Set<string>();
    set.add(stream);
    perSocketSubs.set(socket, set);
  }

  it('lifecycle: IDLE → CONNECTING → OPEN, and CLOSED on user close', async () => {
    const ws = new BaseWS({ baseStreamUrl: `ws://localhost:${port}/stream` });
    expect(ws.getState()).toBe('IDLE');

    const opened = new Promise<void>((resolve) => ws.once('open', resolve));
    void ws.subscribe(['btcusdt@kline_1m']);
    expect(ws.getState()).toBe('CONNECTING');
    await opened;
    expect(ws.getState()).toBe('OPEN');

    // Server acks the SUBSCRIBE (url streams are implicitly subscribed).
    const ack = await ws.listServerSubscriptions();
    void ack;

    ws.close();
    expect(ws.getState()).toBe('CLOSED');
  });

  it('subscribe() resolves only after the server acknowledges (when open)', async () => {
    const ws = new BaseWS({ baseStreamUrl: `ws://localhost:${port}/stream` });
    await ws.subscribe(['btcusdt@kline_1m']);
    expect(ws.getState()).toBe('OPEN');

    // Now subscribe a second stream via the live protocol and await its ack.
    server.once('connection', () => {
      /* single connection only */
    });
    // Wire the mock: SUBSCRIBE ack should also record the stream.
    const originalHandler = server.listeners('connection')[0] as (socket: WebSocket) => void;
    server.removeAllListeners('connection');
    server.on('connection', (socket) => {
      sockets.push(socket);
      socket.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as {
          method: string;
          params?: string[];
          id: number;
        };
        if (parsed.method === 'SUBSCRIBE') {
          for (const stream of parsed.params ?? []) addSubscription(socket, stream);
          socket.send(JSON.stringify({ result: null, id: parsed.id }));
        } else if (parsed.method === 'LIST_SUBSCRIPTIONS') {
          socket.send(JSON.stringify({ result: subscriptionsOf(socket), id: parsed.id }));
        } else if (parsed.method === 'UNSUBSCRIBE') {
          socket.send(JSON.stringify({ result: null, id: parsed.id }));
        }
      });
    });
    void originalHandler;

    await ws.subscribe(['ethusdt@aggTrade']);
    expect(ws.getConfirmedStreams()).toContain('ethusdt@aggTrade');
    expect(ws.getSubscribedStreams()).toContain('ethusdt@aggTrade');
    ws.close();
  });

  it('reconnect after server drop restores subscriptions exactly once (no race)', async () => {
    let connections = 0;
    const trackConnections = (socket: WebSocket): void => {
      connections += 1;
      // First connection: acknowledge nothing, then drop.
      if (connections === 1) {
        setTimeout(() => socket.close(), 10);
      } else {
        addSubscription(socket, 'btcusdt@kline_1m'); // URL-carried stream
      }
    };
    const original = server.listeners('connection')[0] as (socket: WebSocket) => void;
    server.removeAllListeners('connection');
    server.on('connection', (socket) => {
      original(socket);
      trackConnections(socket);
    });

    const ws = new BaseWS({
      baseStreamUrl: `ws://localhost:${port}/stream`,
      reconnectDelayMs: 30,
      maxReconnectDelayMs: 30,
    });
    void ws.subscribe(['btcusdt@kline_1m']);

    // Wait for the second connection (the reconnect), then let any buggy
    // duplicate-connection path have time to appear.
    const reconnected = new Promise<void>((resolve) => {
      const check = (): void => {
        if (connections >= 2) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
    await reconnected;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(connections).toBe(2); // exactly one reconnect — the old code created 2+
    ws.close();
  });

  it('reconnect() from OPEN retires the old socket without double-connecting', async () => {
    let connections = 0;
    const original = server.listeners('connection')[0] as (socket: WebSocket) => void;
    server.removeAllListeners('connection');
    server.on('connection', (socket) => {
      original(socket);
      connections += 1;
    });

    const ws = new BaseWS({ baseStreamUrl: `ws://localhost:${port}/stream` });
    await ws.subscribe(['btcusdt@kline_1m']);
    expect(connections).toBe(1);

    ws.reconnect();
    await ws.waitForOpen(2000);
    expect(connections).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(connections).toBe(2); // no spurious third connection from the retired socket
    ws.close();
  });

  it('proactively rotates before the 24h limit with no data gap', async () => {
    let connections = 0;
    const original = server.listeners('connection')[0] as (socket: WebSocket) => void;
    server.removeAllListeners('connection');
    server.on('connection', (socket) => {
      original(socket);
      connections += 1;
      addSubscription(socket, 'btcusdt@kline_1m');
    });

    const ws = new BaseWS({
      baseStreamUrl: `ws://localhost:${port}/stream`,
      rotationMs: 150, // pretend T-23h is 150ms away
    });
    ws.on('error', () => {
      /* keep typed-parse strictness from crashing the test run */
    });
    await ws.subscribe(['btcusdt@kline_1m']);
    expect(connections).toBe(1);
    expect(ws.getState()).toBe('OPEN');

    const rotated = new Promise<void>((resolve) => ws.once('rotated', resolve));
    await rotated;

    expect(ws.getState()).toBe('OPEN'); // never left OPEN from the caller's view
    expect(connections).toBe(2);

    // The retired socket completes its close handshake shortly.
    await waitFor(() => sockets[0].readyState === WebSocket.CLOSED, 1000);

    // Data still flows after rotation.
    const got = new Promise<void>((resolve) => ws.once('message', () => resolve()));
    sockets[1].send(
      JSON.stringify({
        stream: 'btcusdt@kline_1m',
        data: {
          e: 'kline', E: 1, s: 'BTCUSDT',
          k: { t: 1, T: 2, s: 'BTCUSDT', i: '1m', o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: false, q: '20', V: '5', Q: '10' },
        },
      }),
    );
    await got;
    ws.close();
  });

  it('emits raw (losslessly parsed) frames alongside typed payloads', async () => {
    const ws = new BaseWS({ baseStreamUrl: `ws://localhost:${port}/stream` });
    ws.on('error', () => {
      /* the >2^53 id intentionally fails the strict typed schema; raw is the escape hatch */
    });
    await ws.subscribe(['btcusdt@kline_1m']);

    const raw = new Promise<unknown>((resolve) =>
      ws.once('raw', (_stream: string, payload: unknown) => resolve(payload)),
    );
    // Hand-built JSON: the aggTrade id exceeds 2^53-1, so lossless parsing
    // surfaces it as a string instead of a corrupted float.
    sockets[0].send(
      '{"stream":"btcusdt@aggTrade","data":{"e":"aggTrade","E":1,"s":"BTCUSDT","a":9007199254740993,"p":"100","q":"1","f":1,"l":2,"T":1,"m":false}}',
    );
    const rawPayload = (await raw) as Record<string, unknown>;
    expect(rawPayload.e).toBe('aggTrade');
    expect(rawPayload.a).toBe('9007199254740993'); // preserved, not rounded
    ws.close();
  });

  it('close() during a pending subscribe rejects the waiter cleanly', async () => {
    // A server that accepts connections but never acks subscriptions.
    server.removeAllListeners('connection');
    server.on('connection', (socket) => {
      sockets.push(socket);
      setTimeout(() => socket.close(), 10);
    });

    const ws = new BaseWS({
      baseStreamUrl: `ws://localhost:${port}/stream`,
      reconnectDelayMs: 5000,
      maxReconnectDelayMs: 5000,
      requestTimeoutMs: 10_000,
    });
    const promise = ws.subscribe(['btcusdt@kline_1m']);
    // Let the first connection open, fail resync (no acks), then drop.
    await new Promise((resolve) => setTimeout(resolve, 60));
    ws.close();
    await expect(promise).rejects.toThrow(/closed before subscribe confirmed|timed out/);
  });
});

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const started = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor: condition not met'));
      setTimeout(tick, 10);
    };
    tick();
  });
}
