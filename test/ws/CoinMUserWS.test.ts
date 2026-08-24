import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CoinMUserWS } from '../../src/ws/CoinMUserWS.js';

describe('CoinMUserWS', () => {
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

  it('emits typed ACCOUNT_UPDATE events for COIN-M', async () => {
    server.on('connection', (socket) => {
      socket.send(
        JSON.stringify({
          e: 'ACCOUNT_UPDATE', E: 1, T: 1,
          a: {
            m: '100', B: [{ a: 'BTC', wb: '1', cw: '1', bc: '0' }],
            P: [{ s: 'BTCUSD_PERP', pa: '10', ep: '60000', cr: '0', up: '0.01', mt: 'cross', ps: 'BOTH' }],
          },
        }),
      );
    });

    const client = new CoinMUserWS({ baseUserUrl: `ws://localhost:${port}`, getListenKey: () => 'lk' });
    const received = new Promise<{ a: { B: { a: string }[] } }>((resolve) => {
      client.once('ACCOUNT_UPDATE', (event: { a: { B: { a: string }[] } }) => resolve(event));
    });
    client.connect();

    const event = await received;
    expect(event.a.B[0]?.a).toBe('BTC');
    client.close();
  });

  it('emits error when no listenKey is available', async () => {
    const client = new CoinMUserWS({ baseUserUrl: `ws://localhost:${port}`, getListenKey: () => null });
    const received = new Promise<Error>((resolve) => client.once('error', (err: Error) => resolve(err)));
    client.connect();

    const err = await received;
    expect(err.message).toContain('listenKey');
    client.close();
  });
});
