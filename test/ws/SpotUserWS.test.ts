import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpotUserWS, createSpotUserDataSigner } from '../../src/ws/SpotUserWS.js';
import { Credentials } from '../../src/core/credentials.js';
import { parseSpotUserDataEvent } from '../../src/types/spot.types.js';

describe('parseSpotUserDataEvent', () => {
  it('dispatches on the event type', () => {
    expect(parseSpotUserDataEvent({ e: 'executionReport', s: 'BTCUSDT' }).e).toBe('executionReport');
    expect(parseSpotUserDataEvent({ e: 'balanceUpdate', a: 'USDT' }).e).toBe('balanceUpdate');
    expect(parseSpotUserDataEvent({ e: 'outboundAccountPosition' }).e).toBe('outboundAccountPosition');
    expect(parseSpotUserDataEvent({ e: 'listStatus' }).e).toBe('listStatus');
    expect(() => parseSpotUserDataEvent({ e: 'nope' })).toThrow();
  });
});

describe('SpotUserWS', () => {
  let server: WebSocketServer;
  let port: number;
  const requests: Array<{ id: number; method: string; params: Record<string, unknown> }> = [];

  beforeEach(async () => {
    requests.length = 0;
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(() => server.close());

  function credentials(apiKey?: string): Credentials {
    return new Credentials({ apiKey, apiSecret: apiKey ? 's' : undefined });
  }

  function acceptSubscriptions(reply: (id: number) => unknown): void {
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const req = JSON.parse(raw.toString());
        requests.push(req);
        socket.send(JSON.stringify(reply(req.id)));
      });
    });
  }

  it('subscribes with a signed request and emits unwrapped executionReport events', async () => {
    acceptSubscriptions((id) => ({ id, status: 200, result: { subscriptionId: 7 } }));
    const client = new SpotUserWS({
      wsApiUrl: `ws://localhost:${port}`,
      signSubscription: createSpotUserDataSigner(credentials('k')),
    });
    const received = new Promise<{ s: string }>((resolve) => {
      client.once('executionReport', (event: { s: string }) => resolve(event));
    });

    expect(await client.start()).toBe(7);
    expect(requests[0].method).toBe('userDataStream.subscribe.signature');
    expect(Object.keys(requests[0].params).sort()).toEqual(['apiKey', 'signature', 'timestamp']);

    for (const socket of server.clients) {
      socket.send(JSON.stringify({ subscriptionId: 7, event: { e: 'executionReport', s: 'BTCUSDT', E: 1, c: 'c1', S: 'BUY' } }));
    }
    expect((await received).s).toBe('BTCUSDT');
    client.close();
  });

  it('rejects start when Binance refuses the subscription', async () => {
    acceptSubscriptions((id) => ({ id, status: 400, error: { code: -1022, msg: 'Signature for this request is not valid.' } }));
    const client = new SpotUserWS({
      wsApiUrl: `ws://localhost:${port}`,
      signSubscription: createSpotUserDataSigner(credentials('k')),
    });
    client.on('error', () => {
      /* also emitted; asserted via start() */
    });

    await expect(client.start()).rejects.toThrow('-1022');
    client.close();
  });

  it('rejects start without signing credentials', async () => {
    const client = new SpotUserWS({
      wsApiUrl: `ws://localhost:${port}`,
      signSubscription: createSpotUserDataSigner(credentials()),
    });
    await expect(client.start()).rejects.toThrow('API key');
  });
});
