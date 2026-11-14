import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { FuturesUserWS } from '../../src/ws/FuturesUserWS.js';
import { CoinMUserWS } from '../../src/ws/CoinMUserWS.js';
import type { UserDataOrderTradeUpdate, UserDataUnknownEvent } from '../../src/types/userdata.types.js';

const orderFrame = {
  e: 'ORDER_TRADE_UPDATE',
  E: 1,
  T: 1,
  o: {
    s: 'BTCUSDT', c: 'autoclose-77', i: 9, S: 'SELL', o: 'MARKET', f: 'GTC',
    q: '0.002', p: '0', ap: '60010.5', sp: '0', x: 'CALCULATED', X: 'FILLED',
    l: '0.002', z: '0.002', L: '60010.5', n: '0.1', N: 'USDT', T: 1, t: 5, b: '0', a: '0',
    m: false, R: true, wt: 'CONTRACT_PRICE', ot: 'MARKET', ps: 'BOTH', pm: 'QUEUE_5', er: 5,
  },
};

describe.each([
  ['FuturesUserWS', (url: string) => new FuturesUserWS({ baseUserUrl: url, getListenKey: () => 'lk' })],
  ['CoinMUserWS', (url: string) => new CoinMUserWS({ baseUserUrl: url, getListenKey: () => 'lk' })],
])('%s.onUserEvent', (_name, build) => {
  let server: WebSocketServer;
  let url: string;

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    url = `ws://localhost:${(server.address() as { port: number }).port}`;
  });

  afterEach(() => {
    server.close();
  });

  it('delivers modelled events to a typed handler', async () => {
    server.on('connection', (socket) => socket.send(JSON.stringify(orderFrame)));
    const client = build(url);

    const received = await new Promise<UserDataOrderTradeUpdate>((resolve) => {
      client.onUserEvent('ORDER_TRADE_UPDATE', (event) => {
        expectTypeOf(event).toEqualTypeOf<UserDataOrderTradeUpdate>();
        resolve(event);
      });
      client.connect();
    });

    expect(received.o.pm).toBe('QUEUE_5');
    expect(received.o.er).toBe(5);
    expect(received.o.x).toBe('CALCULATED');
    client.close();
  });

  it('delivers unmodelled event names as UserDataUnknownEvent', async () => {
    server.on('connection', (socket) => socket.send(JSON.stringify({ e: 'ALGO_UPDATE', E: 2, i: 'algo-9' })));
    const client = build(url);

    const received = await new Promise<UserDataUnknownEvent>((resolve) => {
      client.onUserEvent('ALGO_UPDATE', (event) => {
        expectTypeOf(event).toEqualTypeOf<UserDataUnknownEvent>();
        resolve(event);
      });
      client.connect();
    });

    expect(received.e).toBe('ALGO_UPDATE');
    client.close();
  });

  it('returns the instance so listeners can be chained', () => {
    const client = build(url);
    const returned = client.onUserEvent('ORDER_TRADE_UPDATE', () => undefined);
    expect(returned).toBe(client);
  });
});
