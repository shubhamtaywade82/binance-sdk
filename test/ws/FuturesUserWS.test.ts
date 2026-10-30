import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FuturesUserWS } from '../../src/ws/FuturesUserWS.js';

describe('FuturesUserWS', () => {
  let server: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(() => {
    server.close();
  });

  it('emits typed ACCOUNT_UPDATE events', async () => {
    server.on('connection', (socket) => {
      socket.send(
        JSON.stringify({
          e: 'ACCOUNT_UPDATE', E: 1, T: 1,
          a: {
            m: '100', B: [{ a: 'USDT', wb: '100', cw: '90', bc: '0' }],
            P: [{ s: 'BTCUSDT', pa: '0.5', ep: '60000', cr: '0', up: '500', mt: 'isolated', iw: '300', ps: 'LONG' }],
          },
        }),
      );
    });

    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => 'lk',
    });
    const received = new Promise<{ a: { B: { a: string }[] } }>((resolve) => {
      client.once('ACCOUNT_UPDATE', (event: { a: { B: { a: string }[] } }) => resolve(event));
    });
    client.connect();

    const event = await received;
    expect(event.a.B[0]?.a).toBe('USDT');
    client.close();
  });

  it('emits ORDER_TRADE_UPDATE events and userData', async () => {
    server.on('connection', (socket) => {
      socket.send(
        JSON.stringify({
          e: 'ORDER_TRADE_UPDATE', E: 1, T: 1,
          o: {
            s: 'BTCUSDT', c: 'c1', i: 1, S: 'BUY', o: 'LIMIT', f: 'GTC', q: '0.01', p: '60000', ap: '0',
            sp: '0', x: 'NEW', X: 'NEW', l: '0', z: '0', L: '0', n: '0', N: 'USDT', T: 1, t: 0,
            b: '0', a: '0', m: false, R: false, wt: 'CONTRACT_PRICE', ot: 'LIMIT', ps: 'BOTH',
          },
        }),
      );
    });

    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => 'lk',
    });
    const received = new Promise<{ o: { s: string } }>((resolve) => {
      client.once('ORDER_TRADE_UPDATE', (event: { o: { s: string } }) => resolve(event));
    });
    client.connect();

    const event = await received;
    expect(event.o.s).toBe('BTCUSDT');
    client.close();
  });

  it('emits error when no listenKey is available', async () => {
    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => null,
    });
    const received = new Promise<Error>((resolve) => client.once('error', (err: Error) => resolve(err)));
    client.connect();

    const err = await received;
    expect(err.message).toContain('listenKey');
    client.close();
  });
});

describe('FuturesUserWS (v3.5.1 private routing and event safety)', () => {
  let server: WebSocketServer;
  let port: number;
  let connectionUrls: string[];

  beforeEach(async () => {
    connectionUrls = [];
    server = new WebSocketServer({ port: 0 });
    server.on('connection', (socket, request) => {
      connectionUrls.push(request.url ?? '');
      socket.on('message', () => {
        /* frames acknowledged */
      });
    });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(() => {
    server.close();
  });

  function eventFrame(fixture: Record<string, unknown>): Record<string, unknown> {
    return fixture;
  }

  it('connects on /ws?listenKey=<key> (query form), never the legacy /public/ws path', async () => {
    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}/private`,
      getListenKey: () => 'lk-test-123',
    });
    client.connect();
    await new Promise<void>((resolve) => client.once('open', resolve));
    expect(connectionUrls[0]).toBe('/private/ws?listenKey=lk-test-123');
    expect(connectionUrls[0]).not.toMatch(/\/public\/ws\//);
    client.close();
  });

  it('subscribes events via the query parameter, slash-joined', async () => {
    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => 'lk',
      privateEvents: ['ORDER_TRADE_UPDATE', 'ACCOUNT_UPDATE', 'MARGIN_CALL'],
    });
    client.connect();
    await new Promise<void>((resolve) => client.once('open', resolve));
    expect(connectionUrls[0]).toBe(
      '/ws?listenKey=lk&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE/MARGIN_CALL',
    );
    client.close();
  });

  it('redacts the listen key from connection lifecycle events (never logged)', async () => {
    const { EventBus } = await import('../../src/core/events.js');
    const observed = new EventBus();
    const events: { name: string; payload: Record<string, unknown> }[] = [];
    observed.on('*', ((event: { name: string; payload: Record<string, unknown> }) => {
      events.push({ name: event.name, payload: event.payload });
    }) as never);
    const wired = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}/private`,
      getListenKey: () => 'supersecretlistenkey-abcdef',
      events: observed,
    });
    wired.connect();
    await new Promise<void>((resolve) => wired.once('open', resolve));
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('supersecretlistenkey-abcdef');
    expect(serialized).toContain('<redacted>');
    wired.close();
  });

  it('parses ACCOUNT_CONFIG_UPDATE (leverage and multi-assets mode)', async () => {
    server.once('connection', (socket) => {
      socket.send(
        JSON.stringify(
          eventFrame({
            e: 'ACCOUNT_CONFIG_UPDATE', E: 1611646737479, T: 1611646737476,
            ac: { s: 'BTCUSDT', l: '5' },
          }),
        ),
      );
    });
    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => 'lk',
    });
    const received = new Promise<{ ac?: { s: string; l: unknown }; ai?: { j: boolean } }>((resolve) =>
      client.once('ACCOUNT_CONFIG_UPDATE', (event) => resolve(event as never)),
    );
    client.connect();
    const event = await received;
    expect(event.ac?.s).toBe('BTCUSDT');
    client.close();
  });

  it('parses listenKeyExpired', async () => {
    server.once('connection', (socket) => {
      socket.send(
        JSON.stringify({ e: 'listenKeyExpired', E: 1736996475556, listenKey: 'expired-key' }),
      );
    });
    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => 'lk',
    });
    const received = new Promise<{ listenKey: string }>((resolve) =>
      client.once('listenKeyExpired', (event) => resolve(event as never)),
    );
    client.connect();
    const event = await received;
    expect(event.listenKey).toBe('expired-key');
    client.close();
  });

  it('surfaces unknown event types as unknownEvent + userData instead of errors', async () => {
    server.once('connection', (socket) => {
      socket.send(JSON.stringify({ e: 'ALGO_UPDATE', E: 1, i: 'algo-1' }));
      socket.send(JSON.stringify({ e: 'STRATEGY_UPDATE', E: 2 }));
    });
    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => 'lk',
    });
    const unknown: unknown[] = [];
    const userData: unknown[] = [];
    const errors: Error[] = [];
    client.on('unknownEvent', (event) => unknown.push(event));
    client.on('userData', (event) => userData.push(event));
    client.on('error', (err) => errors.push(err));
    client.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    expect(unknown).toHaveLength(2);
    expect((unknown[0] as { e: string }).e).toBe('ALGO_UPDATE');
    expect(userData).toHaveLength(2);
    // A new upstream event type is not an error — the stream keeps processing.
    expect(errors).toHaveLength(0);
    client.close();
  });

  it('still errors on shapeless frames (genuine protocol garbage)', async () => {
    server.once('connection', (socket) => {
      socket.send(JSON.stringify({ nothing: 'here' }));
    });
    const client = new FuturesUserWS({
      baseUserUrl: `ws://localhost:${port}`,
      getListenKey: () => 'lk',
    });
    const errors: Error[] = [];
    client.on('error', (err) => errors.push(err));
    client.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    expect(errors[0]?.message).toMatch(/missing event type/);
    client.close();
  });
});
