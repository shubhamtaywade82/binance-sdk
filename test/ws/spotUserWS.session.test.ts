import { WebSocketServer, type WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpotUserWS } from '../../src/ws/SpotUserWS.js';

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('SpotUserWS session-authenticated stream', () => {
  let server: WebSocketServer;
  let url: string;
  let sockets: WebSocket[];
  let requests: Array<{ connection: number; id: number; method: string; params: Record<string, unknown> }>;

  beforeEach(async () => {
    sockets = [];
    requests = [];
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    url = `ws://localhost:${(server.address() as { port: number }).port}`;
    server.on('connection', (socket) => {
      const connection = sockets.push(socket) - 1;
      socket.on('message', (raw) => {
        const req = JSON.parse(raw.toString()) as { id: number; method: string; params: Record<string, unknown> };
        requests.push({ connection, ...req });
        socket.send(JSON.stringify({ id: req.id, status: 200, result: { subscriptionId: 5 } }));
      });
    });
  });

  afterEach(() => server.close());

  it('subscribes with the unsigned userDataStream.subscribe when the session is authenticated', async () => {
    const ws = new SpotUserWS({ wsApiUrl: url, signSubscription: () => null, sessionAuthenticated: () => true });
    await expect(ws.start()).resolves.toBe(5);
    const subscribe = requests.find((r) => r.method === 'userDataStream.subscribe');
    expect(subscribe).toBeDefined();
    expect(subscribe?.params).toEqual({});
    expect(requests.some((r) => r.method === 'userDataStream.subscribe.signature')).toBe(false);
    ws.close();
  });

  it('resubscribes when the stream reports eventStreamTerminated', async () => {
    const ws = new SpotUserWS({ wsApiUrl: url, signSubscription: () => null, sessionAuthenticated: () => true });
    const terminated: unknown[] = [];
    ws.on('eventStreamTerminated', (frame) => terminated.push(frame));
    await ws.start();
    sockets[0]?.send(JSON.stringify({ event: { e: 'eventStreamTerminated' } }));
    await waitFor(() => requests.filter((r) => r.method === 'userDataStream.subscribe').length === 2);
    expect(terminated).toHaveLength(1);
    ws.close();
  });

  it('rolls over to a new connection on serverShutdown and resubscribes there', async () => {
    const ws = new SpotUserWS({ wsApiUrl: url, signSubscription: () => null, sessionAuthenticated: () => true });
    const shutdowns: unknown[] = [];
    ws.on('serverShutdown', (frame) => shutdowns.push(frame));
    await ws.start();
    sockets[0]?.send(JSON.stringify({ event: { e: 'serverShutdown', E: 1, T: 2 } }));
    await waitFor(() => sockets.length === 2 && requests.some((r) => r.connection === 1 && r.method === 'userDataStream.subscribe'));
    expect(shutdowns).toHaveLength(1);
    ws.close();
  });

  it('a session-less instance still needs credentials to start', async () => {
    const ws = new SpotUserWS({ wsApiUrl: url, signSubscription: () => null });
    await expect(ws.start()).rejects.toThrow(/requires an API key/);
  });
});
