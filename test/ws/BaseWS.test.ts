import { createServer as httpCreateServer } from 'node:http';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseWS, WsState } from '../../src/ws/BaseWS.js';

/**
 * Test server that mimics Binance's combined-stream contract:
 * - streams embedded in the URL are active on connect
 * - SUBSCRIBE/UNSUBSCRIBE/LIST_SUBSCRIPTIONS control frames are acked
 *   with {"result":null| [...], "id":n}
 */
class BinanceLikeServer {
  server: WebSocketServer;
  port = 0;
  connections: WsSocket[] = [];
  subscribed = new Set<string>();
  controlFrames: Record<string, unknown>[] = [];

  constructor() {
    this.server = new WebSocketServer({ port: 0 });
    this.server.on('connection', (socket, req) => {
      this.connections.push(socket);
      const url = new URL(req.url ?? '/', 'http://localhost');
      const streams = (url.searchParams.get('streams') ?? '').split('/').filter(Boolean);
      for (const s of streams) this.subscribed.add(s);

      socket.on('message', (raw) => {
        const frame = JSON.parse(raw.toString()) as { method: string; params: string[]; id: number };
        this.controlFrames.push(frame);
        if (frame.method === 'SUBSCRIBE') {
          frame.params.forEach((s) => this.subscribed.add(s));
          socket.send(JSON.stringify({ result: null, id: frame.id }));
        } else if (frame.method === 'UNSUBSCRIBE') {
          frame.params.forEach((s) => this.subscribed.delete(s));
          socket.send(JSON.stringify({ result: null, id: frame.id }));
        } else if (frame.method === 'LIST_SUBSCRIPTIONS') {
          socket.send(JSON.stringify({ result: [...this.subscribed], id: frame.id }));
        }
      });
    });
  }

  get url(): string {
    return `ws://localhost:${this.port}/stream`;
  }

  async start(): Promise<this> {
    await new Promise<void>((resolve) => this.server.once('listening', resolve));
    this.port = (this.server.address() as { port: number }).port;
    return this;
  }

  stop(): void {
    for (const socket of this.connections) socket.terminate();
    this.server.close();
  }

  send(stream: string, data: unknown): void {
    const frame = JSON.stringify({ stream, data });
    for (const socket of this.connections) if (socket.readyState === socket.OPEN) socket.send(frame);
  }
}

describe('BaseWS lifecycle state machine', () => {
  let binance: BinanceLikeServer;

  beforeEach(async () => {
    binance = await new BinanceLikeServer().start();
  });

  afterEach(() => {
    binance.stop();
    vi.restoreAllMocks();
  });

  it('starts IDLE and walks IDLE → CONNECTING → OPEN on subscribe', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url });
    expect(client.getState()).toBe(WsState.IDLE);

    const states: WsState[] = [];
    client.on('state', (s: WsState) => states.push(s));

    await client.subscribe(['btcusdt@kline_1m']);
    expect(client.getState()).toBe(WsState.OPEN);
    expect(states).toEqual([WsState.CONNECTING, WsState.OPEN]);
    expect(binance.subscribed).toContain('btcusdt@kline_1m');
    client.close();
    expect(client.getState()).toBe(WsState.CLOSED);
  });

  it('subscribe() on a live connection resolves only on the exchange ack', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url });
    await client.subscribe(['btcusdt@kline_1m']); // URL-embedded: resolved by handshake

    const before = binance.controlFrames.length;
    await client.subscribe(['ethusdt@ticker']);
    expect(binance.controlFrames.length).toBe(before + 1);
    const frame = binance.controlFrames.at(-1);
    expect(frame?.method).toBe('SUBSCRIBE');
    expect(frame?.params).toEqual(['ethusdt@ticker']);
    expect(binance.subscribed).toContain('ethusdt@ticker');
    client.close();
  });

  it('subscribe() rejects when the exchange rejects the subscription', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url });
    await client.subscribe(['btcusdt@kline_1m']);

    // Reject the next SUBSCRIBE the way Binance does for a bad stream name.
    binance.server.once('connection', () => undefined);
    const socket = binance.connections[0]!;
    const original = socket.listeners('message');
    socket.removeAllListeners('message');
    socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as { method: string; id: number };
      if (frame.method === 'SUBSCRIBE') {
        socket.send(JSON.stringify({ error: { code: 1, msg: 'invalid stream name' }, id: frame.id }));
      } else {
        for (const listener of original) listener(raw);
      }
    });

    await expect(client.subscribe(['bad-stream'])).rejects.toThrow(/invalid stream name/);
    // Unconfirmed stream is rolled back so reconnects don't carry it.
    expect(client.getStreams()).not.toContain('bad-stream');
    client.close();
  });

  it('listSubscriptions() returns the exchange-side view', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url });
    await client.subscribe(['btcusdt@kline_1m', 'ethusdt@ticker']);
    const subs = await client.listSubscriptions();
    expect(subs.sort()).toEqual(['btcusdt@kline_1m', 'ethusdt@ticker']);
    client.close();
  });

  it('unsubscribe() removes streams server-side', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url });
    await client.subscribe(['btcusdt@kline_1m', 'ethusdt@ticker']);
    await client.unsubscribe(['ethusdt@ticker']);
    expect(binance.subscribed.has('ethusdt@ticker')).toBe(false);
    expect(binance.subscribed.has('btcusdt@kline_1m')).toBe(true);
    client.close();
  });

  it('reconnect() produces exactly one new connection, not a reconnect storm (race fix)', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url, reconnectDelayMs: 50, maxReconnectDelayMs: 50 });
    await client.subscribe(['btcusdt@kline_1m']);
    expect(binance.connections.length).toBe(1);

    client.reconnect();
    await new Promise<void>((resolve) => client.once('open', resolve));

    // Give any rogue scheduled reconnects time to fire — none should.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(binance.connections.length).toBe(2);
    expect(client.getState()).toBe(WsState.OPEN);
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(binance.connections.length).toBe(2);
  });

  it('a server-side drop triggers backoff reconnect and restores subscriptions via the URL', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url, reconnectDelayMs: 20, maxReconnectDelayMs: 20 });
    await client.subscribe(['btcusdt@kline_1m', 'ethusdt@ticker']);

    binance.connections[0]!.close();
    await new Promise<void>((resolve) => client.once('open', resolve));
    expect(client.getState()).toBe(WsState.OPEN);

    // Both streams ride the reconnect URL — no manual restore needed.
    expect(binance.subscribed.has('btcusdt@kline_1m')).toBe(true);
    expect(binance.subscribed.has('ethusdt@ticker')).toBe(true);
    client.close();
  });

  it('close() stops reconnection entirely', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url, reconnectDelayMs: 20, maxReconnectDelayMs: 20 });
    await client.subscribe(['btcusdt@kline_1m']);
    client.close();

    binance.connections[0]?.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const count = binance.connections.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(binance.connections.length).toBe(count);
    expect(client.getState()).toBe(WsState.CLOSED);
  });

  it('proactively rotates the connection at connectionLifetimeMs without a data gap', async () => {
    const client = new BaseWS({
      baseStreamUrl: binance.url,
      connectionLifetimeMs: 250,
      rotationRetryMs: 100,
      reconnectDelayMs: 20,
    });
    client.on('error', () => undefined);
    const rotated = new Promise<void>((resolve) => client.once('rotated', resolve));
    await client.subscribe(['btcusdt@kline_1m']);

    // 'rotated' fires when the replacement socket is authoritative.
    await rotated;
    expect(binance.connections.length).toBe(2);
    expect(client.getState()).toBe(WsState.OPEN);

    // Data flows on the new connection, and the stream survived the rotation.
    const got = new Promise<void>((resolve) => {
      client.once('btcusdt@kline_1m', () => resolve());
    });
    binance.send('btcusdt@kline_1m', {
      e: 'kline', E: 1, s: 'BTCUSDT',
      k: { t: 9, T: 10, s: 'BTCUSDT', i: '1m', o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: false, q: '20', V: '5', Q: '10' },
    });
    await got;
    client.close();
  });

  it('a rotation attempt that fails pre-handshake keeps the old connection dispatching', async () => {
    // Raw HTTP server: the first upgrade completes, later ones get 403 before
    // any WebSocket handshake, so the replacement socket fails to OPEN.
    let upgrades = 0;
    const httpServer = httpCreateServer();
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (req, socket) => {
      upgrades += 1;
      if (upgrades === 1) {
        wss.handleUpgrade(req, socket, Buffer.alloc(0), (ws) => wss.emit('connection', ws, req));
      } else {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
      }
    });
    const subscribed = new Set<string>();
    wss.on('connection', (socket, req) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      for (const s of (url.searchParams.get('streams') ?? '').split('/').filter(Boolean)) {
        subscribed.add(s);
      }
      socket.on('message', (raw) => {
        const frame = JSON.parse(raw.toString()) as { method: string; params: string[]; id: number };
        if (frame.method === 'SUBSCRIBE') {
          frame.params.forEach((s) => subscribed.add(s));
          socket.send(JSON.stringify({ result: null, id: frame.id }));
        }
      });
    });
    httpServer.listen(0);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const port = (httpServer.address() as { port: number }).port;
    const url = `ws://localhost:${port}/stream`;

    const client = new BaseWS({ baseStreamUrl: url, connectionLifetimeMs: 60, rotationRetryMs: 10_000 });
    client.on('error', () => undefined); // the failed replacement surfaces as an error event
    await client.subscribe(['btcusdt@kline_1m']);
    expect(upgrades).toBe(1);

    const aborted = new Promise<void>((resolve) => client.once('rotation-aborted', () => resolve()));
    await aborted;
    expect(client.getState()).toBe(WsState.OPEN);

    // The old connection is still the authoritative one and still dispatches.
    const got = new Promise<void>((resolve) => client.once('btcusdt@kline_1m', () => resolve()));
    wss.clients.forEach((socket) =>
      socket.send(
        JSON.stringify({
          stream: 'btcusdt@kline_1m',
          data: {
            e: 'kline', E: 1, s: 'BTCUSDT',
            k: { t: 9, T: 10, s: 'BTCUSDT', i: '1m', o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: false, q: '20', V: '5', Q: '10' },
          },
        }),
      ),
    );
    await got;
    client.close();
    httpServer.close();
    wss.close();
  });

  it('emits a parsed payload for a combined-stream kline message (legacy behavior)', async () => {
    const client = new BaseWS({ baseStreamUrl: binance.url });
    client.on('error', () => undefined);
    const received = new Promise<{ stream: string; payload: { k: { o: number } } }>((resolve) => {
      client.once('message', (stream: string, payload: { k: { o: number } }) => resolve({ stream, payload }));
    });
    await client.subscribe(['btcusdt@kline_1m']);
    binance.send('btcusdt@kline_1m', {
      e: 'kline', E: 1, s: 'BTCUSDT',
      k: { t: 1, T: 2, s: 'BTCUSDT', i: '1m', o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: false, q: '20', V: '5', Q: '10' },
    });

    const result = await received;
    expect(result.stream).toBe('btcusdt@kline_1m');
    expect(result.payload.k.o).toBe(1);
    client.close();
  });
});
