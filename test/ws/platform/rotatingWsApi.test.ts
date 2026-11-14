import { WebSocketServer, type WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError } from '../../../src/errors/RateLimitError.js';
import { RotatingWsApiClient, withReturnRateLimits } from '../../../src/ws/platform/RotatingWsApiClient.js';

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('withReturnRateLimits', () => {
  it('appends returnRateLimits=false only when explicitly disabled', () => {
    expect(withReturnRateLimits('wss://ws-api.binance.com:443/ws-api/v3', false)).toBe(
      'wss://ws-api.binance.com:443/ws-api/v3?returnRateLimits=false',
    );
    expect(withReturnRateLimits('wss://h/x?a=1', false)).toBe('wss://h/x?a=1&returnRateLimits=false');
    expect(withReturnRateLimits('wss://h/x', true)).toBe('wss://h/x');
    expect(withReturnRateLimits('wss://h/x', undefined)).toBe('wss://h/x');
  });
});

describe('RotatingWsApiClient', () => {
  let server: WebSocketServer;
  let url: string;
  let sockets: WebSocket[];
  let frames: Array<{ connection: number; method: string; id: string }>;
  let closed: Set<number>;
  let held: Map<string, WebSocket>;

  beforeEach(async () => {
    sockets = [];
    frames = [];
    closed = new Set();
    held = new Map();
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    url = `ws://localhost:${(server.address() as { port: number }).port}/ws-api/v3`;
    server.on('connection', (socket) => {
      const connection = sockets.push(socket) - 1;
      socket.on('close', () => closed.add(connection));
      socket.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { id: string; method: string };
        frames.push({ connection, method: msg.method, id: msg.id });
        if (msg.method === 'hold') {
          held.set(msg.id, socket);
          return;
        }
        if (msg.method === 'ban') {
          socket.send(JSON.stringify({ id: msg.id, status: 418, error: { code: -1003, msg: 'banned' } }));
          return;
        }
        socket.send(JSON.stringify({ id: msg.id, status: 200, result: { connection } }));
      });
    });
  });

  afterEach(() => {
    server.close();
  });

  it('on serverShutdown: routes new requests to a new connection and drains the old one', async () => {
    const client = new RotatingWsApiClient({
      client: { baseUrl: url },
      drainPollMs: 10,
      drainTimeoutMs: 2000,
      rotateAfterMs: 60_000_000,
    });
    const rotations: string[] = [];
    client.on('rotated', (info: { reason: string }) => rotations.push(info.reason));

    const first = client.current;
    const inFlight = client.request('hold', {}, { signed: false });
    await waitFor(() => frames.some((f) => f.method === 'hold'));
    const holdId = frames.find((f) => f.method === 'hold')?.id as string;

    sockets[0]?.send(JSON.stringify({ event: { e: 'serverShutdown', E: 1, T: 2 } }));
    await waitFor(() => client.current !== first);
    expect(rotations).toEqual(['serverShutdown']);
    expect(client.drainingCount).toBe(1);

    const fresh = await client.request('ping', {}, { signed: false });
    expect(fresh.result).toEqual({ connection: 1 });

    // The in-flight request answers on the old connection, which is still open.
    held.get(holdId)?.send(JSON.stringify({ id: holdId, status: 200, result: { connection: 0 } }));
    await expect(inFlight).resolves.toMatchObject({ result: { connection: 0 } });

    await waitFor(() => closed.has(0));
    await waitFor(() => client.drainingCount === 0);
    client.close();
  });

  it('rotates on the lifetime timer', async () => {
    const client = new RotatingWsApiClient({ client: { baseUrl: url }, rotateAfterMs: 30, drainPollMs: 5 });
    const reasons: string[] = [];
    client.on('rotated', (info: { reason: string }) => reasons.push(info.reason));
    await client.request('ping', {}, { signed: false });
    await waitFor(() => reasons.includes('lifetime'));
    client.close();
  });

  it('refuses requests locally during a 418 lock, without sending a frame', async () => {
    const client = new RotatingWsApiClient({ client: { baseUrl: url }, rotateAfterMs: 60_000_000 });
    await expect(client.request('ban', {}, { signed: false })).rejects.toBeInstanceOf(RateLimitError);

    const framesBefore = frames.length;
    await expect(client.request('ping', {}, { signed: false })).rejects.toBeInstanceOf(RateLimitError);
    expect(frames.length).toBe(framesBefore);
    client.close();
  });

  it('resubscribes when the stream reports eventStreamTerminated', async () => {
    const resubscribe = vi.fn(async () => undefined);
    const client = new RotatingWsApiClient({
      client: { baseUrl: url },
      resubscribe,
      rotateAfterMs: 60_000_000,
    });
    await client.request('ping', {}, { signed: false });
    expect(resubscribe).not.toHaveBeenCalled();

    sockets[0]?.send(JSON.stringify({ event: { e: 'eventStreamTerminated' } }));
    await waitFor(() => resubscribe.mock.calls.length === 1);
    client.close();
  });

  it('does not subscribe on construction (only after rotation or termination)', async () => {
    const resubscribe = vi.fn(async () => undefined);
    const client = new RotatingWsApiClient({ client: { baseUrl: url }, resubscribe, rotateAfterMs: 60_000_000 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(resubscribe).not.toHaveBeenCalled();
    client.close();
  });
});
