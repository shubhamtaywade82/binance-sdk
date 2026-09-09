import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { WsApiClient } from '../../../src/ws/platform/WsApiClient.js';
import { startMockWsServer, type MockWsServer } from './helpers.js';
import { NetworkError } from '../../../src/errors/index.js';
import { EventBus } from '../../../src/core/events.js';

describe('WsApiClient (persistent multiplexed WS API)', () => {
  let server: MockWsServer;
  let client: WsApiClient;
  let events: EventBus;

  beforeEach(async () => {
    server = await startMockWsServer();
    events = new EventBus();
    client = new WsApiClient({
      baseUrl: server.url,
      name: 'testApi',
      requestTimeoutMs: 2_000,
      // Reconnect instantly for tests.
      reconnectPolicy: { delayForMs: () => 10 },
      delay: () => Promise.resolve(),
      events,
    });
  });

  afterEach(() => {
    client.close();
    return server.close();
  });

  it('auto-connects on first request and resolves the response envelope', async () => {
    expect(client.getState()).toBe('IDLE');
    const response = await client.request('time', {}, { signed: false });
    expect(response.status).toBe(200);
    expect(client.getState()).toBe('OPEN');
    expect(server.sockets).toHaveLength(1); // one persistent socket
    expect(server.apiRequests[0].method).toBe('time');
  });

  it('multiplexes concurrent requests over one socket (id routing)', async () => {
    const [a, b, c] = await Promise.all([
      client.request('time', {}, { signed: false }),
      client.request('exchangeInfo', { symbol: 'BTCUSDT' }, { signed: false }),
      client.request('depth', { symbol: 'BTCUSDT' }, { signed: false }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(c.status).toBe(200);
    expect((a.result as { method: string }).method).toBe('time');
    expect((b.result as { echoed: { symbol: string } }).echoed.symbol).toBe('BTCUSDT');
    expect((c.result as { method: string }).method).toBe('depth');
    // All three rode the same connection.
    expect(server.sockets).toHaveLength(1);
    expect(server.apiRequests).toHaveLength(3);
  });

  it('convenience methods mirror the wire protocol', async () => {
    const response = await client.request('account.status', {}, { signed: false });
    expect((response.result as { method: string }).method).toBe('account.status');
  });

  it('rejects on error-status envelopes with the server message', async () => {
    server.failNextApiRequest(400, 'Precision is over the maximum.');
    await expect(client.request('order.place', { symbol: 'BTCUSDT' }, { signed: false })).rejects.toThrow(
      /Precision is over the maximum/,
    );
    // The client survives the error — the connection stays usable.
    const ok = await client.request('time', {}, { signed: false });
    expect(ok.status).toBe(200);
  });

  it('fails in-flight requests as retryable NetworkErrors when the socket drops', async () => {
    server.setAutoRespond(false); // hold the first request unanswered
    const inflight = client.request('slow.method', {}, { signed: false });
    await new Promise((resolve) => setTimeout(resolve, 50)); // request is on the wire
    const originalSocket = server.sockets[0];
    server.dropClients();

    await expect(inflight).rejects.toBeInstanceOf(NetworkError);
    await expect(inflight).rejects.toThrow(/connection dropped during request/);

    // Reconnects automatically; the next request works on a *fresh* socket.
    server.setAutoRespond(true);
    const response = await client.request('time', {}, { signed: false });
    expect(response.status).toBe(200);
    expect(server.sockets[0]).not.toBe(originalSocket);
    expect(originalSocket.readyState).not.toBe(WebSocket.OPEN);
  });

  it('signed requests reject without credentials (never a sync throw)', async () => {
    const unsigned = new WsApiClient({ baseUrl: server.url });
    await expect(unsigned.request('account.status', {})).rejects.toThrow(/API key and secret/i);
    unsigned.close();
  });

  it('signed requests carry apiKey/timestamp/recvWindow/signature', async () => {
    const signed = new WsApiClient({
      baseUrl: server.url,
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      recvWindow: 4242,
      requestTimeoutMs: 2_000,
    });
    await signed.request('account.status', { symbol: 'BTCUSDT' });
    const wire = server.apiRequests[server.apiRequests.length - 1] as {
      method: string;
      params?: Record<string, unknown>;
    };
    expect(wire.method).toBe('account.status');
    expect(wire.params?.apiKey).toBe('test-key');
    expect(wire.params?.timestamp).toBeTypeOf('number');
    expect(wire.params?.recvWindow).toBe(4242);
    expect(wire.params?.signature).toBeTypeOf('string');
    signed.close();
  });

  it('close() fails pending requests and prevents reconnect', async () => {
    server.setAutoRespond(false);
    const inflight = client.request('pending.method', {}, { signed: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    client.close();
    await expect(inflight).rejects.toThrow(/client closed|connection closed/i);
    expect(client.getState()).toBe('CLOSED');
  });

  it('times out requests that never get a response', async () => {
    server.setAutoRespond(false);
    await expect(client.request('never.answers', {}, { signed: false })).rejects.toThrow(
      /timed out after 2000ms/,
    );
    server.setAutoRespond(true);
  });
});
