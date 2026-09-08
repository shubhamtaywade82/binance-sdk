import { WebSocketServer, WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseWS } from '../../src/ws/BaseWS.js';

describe('BaseWS', () => {
  let server: WebSocketServer;
  let port: number;
  let sockets: WebSocket[];

  beforeEach(async () => {
    sockets = [];
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(() => {
    server.close();
  });

  it('emits a parsed payload for a combined-stream kline message', async () => {
    server.on('connection', (socket) => {
      socket.send(
        JSON.stringify({
          stream: 'btcusdt@kline_1m',
          data: {
            e: 'kline', E: 1, s: 'BTCUSDT',
            k: { t: 1, T: 2, s: 'BTCUSDT', i: '1m', o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: false, q: '20', V: '5', Q: '10' },
          },
        }),
      );
    });

    const client = new BaseWS({ baseStreamUrl: `ws://localhost:${port}/stream` });
    const received = new Promise<{ stream: string; payload: { k: { o: number } } }>((resolve) => {
      client.once('message', (stream: string, payload: { k: { o: number } }) => resolve({ stream, payload }));
    });
    client.subscribe(['btcusdt@kline_1m']);

    const result = await received;
    expect(result.stream).toBe('btcusdt@kline_1m');
    expect(result.payload.k.o).toBe(1);
    client.close();
  });

  it('also emits on the stream-name-specific event', async () => {
    server.on('connection', (socket) => {
      socket.send(
        JSON.stringify({
          stream: 'ethusdt@markPrice@1s',
          data: { e: 'markPriceUpdate', E: 1, s: 'ETHUSDT', p: '2500', i: '2499', P: '2500', r: '0.0001', T: 1 },
        }),
      );
    });

    const client = new BaseWS({ baseStreamUrl: `ws://localhost:${port}/stream` });
    const received = new Promise<{ p: number }>((resolve) => {
      client.once('ethusdt@markPrice@1s', (payload: { p: number }) => resolve(payload));
    });
    client.subscribe(['ethusdt@markPrice@1s']);

    const result = await received;
    expect(result.p).toBe(2500);
    client.close();
  });

  it('reconnects after the server drops the connection', async () => {
    let connections = 0;
    server.on('connection', (socket) => {
      connections += 1;
      if (connections === 1) socket.close();
    });

    const client = new BaseWS({
      baseStreamUrl: `ws://localhost:${port}/stream`,
      reconnectDelayMs: 20,
      maxReconnectDelayMs: 20,
    });
    client.subscribe(['btcusdt@kline_1m']);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (connections >= 2) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    expect(connections).toBeGreaterThanOrEqual(2);
    client.close();
  });

  it('fire-and-forget subscribe + close never produces an unhandled rejection', async () => {
    // Regression: close() during a pending subscribe rejected the promise the
    // caller was ignoring — an unhandled rejection that terminates the process
    // (Node default). CI crashed on this exact scenario.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    // A server that accepts connections but never acks subscriptions, so the
    // subscribe waiter is still pending when the test closes the client.
    server.removeAllListeners('connection');
    server.on('connection', (socket) => {
      sockets.push(socket);
    });

    const { EventBus } = await import('../../src/core/events.js');
    const events = new EventBus();
    const rejections: Array<Record<string, unknown>> = [];
    events.scoped('ws:market').on('*', (event) => {
      if (event.name === 'ws.subscribe.rejected') rejections.push(event.payload);
    });

    const client = new BaseWS({
      baseStreamUrl: `ws://localhost:${port}/stream`,
      events,
      name: 'market',
    });
    void client.subscribe(['btcusdt@kline_1m']); // ignored promise — the legacy pattern

    await new Promise((resolve) => setTimeout(resolve, 50));
    client.close(); // pending waiter is rejected here

    // Give the microtask queue a chance to report any unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toEqual([]);
    expect(rejections.length).toBeGreaterThanOrEqual(0); // guard fired, not crashed
    expect(client.getState()).toBe('CLOSED');
  });

  it('fire-and-forget unsubscribe failure is guarded the same way', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    // Server that answers SUBSCRIBE / LIST_SUBSCRIPTIONS but never UNSUBSCRIBE.
    server.removeAllListeners('connection');
    server.on('connection', (socket) => {
      sockets.push(socket);
      socket.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as { method: string; id: number };
        if (parsed.method === 'UNSUBSCRIBE') return; // never answered → request timeout
        const result = parsed.method === 'LIST_SUBSCRIPTIONS' ? [] : null;
        socket.send(JSON.stringify({ result, id: parsed.id }));
      });
    });

    const client = new BaseWS({
      baseStreamUrl: `ws://localhost:${port}/stream`,
      requestTimeoutMs: 40,
    });
    await client.subscribe(['btcusdt@kline_1m']);
    void client.unsubscribe(['btcusdt@kline_1m']); // ignored, will time out

    await new Promise((resolve) => setTimeout(resolve, 120));
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toEqual([]);
    client.close();
  });
});
