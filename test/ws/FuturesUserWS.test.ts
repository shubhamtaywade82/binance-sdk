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

  it('delivers new and unrecognised event types without raising an error', async () => {
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ e: 'ALGO_UPDATE', E: 1, T: 1, o: { aid: 5, X: 'NEW', pm: 'TOP' } }));
      socket.send(JSON.stringify({ e: 'GRID_UPDATE', E: 2, T: 2, gu: {} }));
    });

    const client = new FuturesUserWS({ baseUserUrl: `ws://localhost:${port}`, getListenKey: () => 'lk' });
    const errors: unknown[] = [];
    client.on('error', (err) => errors.push(err));
    const seen: string[] = [];
    const algo = new Promise<{ o: { pm?: string } }>((resolve) => {
      client.onUserEvent('ALGO_UPDATE', (event) => resolve(event));
    });
    const both = new Promise<void>((resolve) => {
      client.on('userData', (event: { e: string }) => {
        seen.push(event.e);
        if (seen.length === 2) resolve();
      });
    });
    client.connect();

    expect((await algo).o.pm).toBe('TOP');
    await both;
    expect(seen).toEqual(['ALGO_UPDATE', 'GRID_UPDATE']);
    expect(errors).toEqual([]);
    client.close();
  });
});
