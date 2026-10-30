import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { generateKeyPairSync } from 'node:crypto';
import { WsApiClient } from '../../../src/ws/platform/WsApiClient.js';
import { startMockWsServer, type MockWsServer } from './helpers.js';
import { NetworkError } from '../../../src/errors/index.js';
import {
  RpcOutcomeUnknownError,
  classifyRpcMethod,
} from '../../../src/errors/RpcOutcomeUnknownError.js';
import { WsSession } from '../../../src/ws/platform/WsSession.js';
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

describe('WsApiClient (v3.5.1 RPC lifecycle, session auth, unknown outcomes)', () => {
  let server: MockWsServer;
  let events: EventBus;

  const { privateKey } = generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  /** Every client created through makeClient — closed in afterEach. */
  const created: WsApiClient[] = [];

  function makeClient(overrides: Record<string, unknown> = {}): WsApiClient {
    const client = new WsApiClient({
      baseUrl: server.url,
      name: 'testApi',
      requestTimeoutMs: 2_000,
      reconnectPolicy: { delayForMs: () => 5 },
      delay: () => Promise.resolve(),
      events,
      ...overrides,
    });
    created.push(client);
    return client;
  }

  beforeEach(async () => {
    server = await startMockWsServer();
    events = new EventBus();
  });

  afterEach(async () => {
    for (const client of created) client.close();
    created.length = 0;
    await server.close();
  });

  // ---------------------------------------------------------------------------
  // Request classification
  // ---------------------------------------------------------------------------

  it('classifies methods into reconnect-policy categories', () => {
    expect(classifyRpcMethod('order.place')).toBe('write-order');
    expect(classifyRpcMethod('order.cancel')).toBe('write-cancel');
    expect(classifyRpcMethod('order.modify')).toBe('write-modify');
    expect(classifyRpcMethod('order.cancelReplace')).toBe('write-order');
    expect(classifyRpcMethod('algoOrder.place')).toBe('write-order');
    expect(classifyRpcMethod('session.logon')).toBe('session');
    expect(classifyRpcMethod('userDataStream.start')).toBe('account-write');
    expect(classifyRpcMethod('account.status')).toBe('read');
    expect(classifyRpcMethod('depth')).toBe('read');
  });

  // ---------------------------------------------------------------------------
  // Session authentication lifecycle
  // ---------------------------------------------------------------------------

  it('authenticates via session.logon and only reaches READY after success', async () => {
    const session = new WsSession({ apiKey: 'test-key', privateKey: privateKeyPem });
    const client = makeClient({ session });
    const states: string[] = [];
    client.on('state', (to: string) => states.push(to));

    const response = await client.request('account.status', {}, { signed: false });
    expect(response.status).toBe(200);
    // IDLE → CONNECTING → AUTHENTICATING → READY, never OPEN before READY.
    expect(states).toEqual(['CONNECTING', 'AUTHENTICATING', 'READY']);
    expect(client.getState()).toBe('READY');
    expect(session.isAuthenticated).toBe(true);
    // exactly one logon on the wire
    expect(server.apiRequests.filter((r) => r.method === 'session.logon')).toHaveLength(1);
    client.close();
  });

  it('deduplicates concurrent authentication attempts onto one logon', async () => {
    const session = new WsSession({ apiKey: 'test-key', privateKey: privateKeyPem });
    const client = makeClient({ session });
    const [a, b] = await Promise.all([
      client.request('account.status', {}, { signed: false }),
      client.request('account.position', {}, { signed: false }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(server.apiRequests.filter((r) => r.method === 'session.logon')).toHaveLength(1);
    client.close();
  });

  it('authentication rejection is terminal: FAILED, no reconnect, requests rejected', async () => {
    server.failNextApiRequest(400, 'Invalid API-key, IP, or permissions for action.');
    const session = new WsSession({ apiKey: 'bad-key', privateKey: privateKeyPem });
    const client = makeClient({ session });
    const authFailures: Error[] = [];
    client.on('authFailed', (err: Error) => authFailures.push(err));

    await expect(client.request('account.status', {}, { signed: false })).rejects.toThrow(
      /session authentication failed/,
    );
    expect(client.getState()).toBe('FAILED');
    expect(authFailures).toHaveLength(1);
    // No reconnect was scheduled for a credential failure.
    expect(server.sockets).toHaveLength(1);
    await expect(client.request('time', {}, { signed: false })).rejects.toThrow(/FAILED/);
    client.close();
  });

  it('reauthenticates after a reconnect (REAUTHENTICATING → READY, second logon)', async () => {
    const session = new WsSession({ apiKey: 'test-key', privateKey: privateKeyPem });
    const client = makeClient({ session });
    await client.request('account.status', {}, { signed: false });
    expect(client.getState()).toBe('READY');

    const states: string[] = [];
    client.on('state', (to: string) => states.push(to));
    server.dropClients();
    // The mock server clears its socket list on drop; the reliable signals
    // are the client-side generation counter and the second logon.
    await vi.waitFor(
      () => {
        expect(client.getConnectionGeneration()).toBeGreaterThanOrEqual(2);
        expect(client.getState()).toBe('READY');
      },
      { timeout: 3000 },
    );
    // RECONNECTING → CONNECTING → REAUTHENTICATING → READY
    expect(states).toContain('RECONNECTING');
    expect(states).toContain('REAUTHENTICATING');
    expect(states).toContain('READY');
    expect(session.isAuthenticated).toBe(true);
    expect(server.apiRequests.filter((r) => r.method === 'session.logon')).toHaveLength(2);
    client.close();
  });

  it('ignores stale authentication callbacks from retired connections', async () => {
    const session = new WsSession({ apiKey: 'test-key', privateKey: privateKeyPem });
    const client = makeClient({ session, requestTimeoutMs: 500 });
    const authFailures: Error[] = [];
    client.on('authFailed', (err: Error) => authFailures.push(err));

    // Hold the first logon unanswered; the auth rides socket #1.
    server.setAutoRespond(false);
    const first = client.request('account.status', {}, { signed: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(server.sockets.length).toBe(1);
    // Kill socket #1 while its logon is in flight: the reconnect opens
    // socket #2, whose logon *is* answered.
    server.setAutoRespond(true);
    server.dropClients();

    await first.catch(() => {
      /* the original request fails with the connection — expected */
    });
    await vi.waitFor(() => {
      expect(client.getState()).toBe('READY');
    }, { timeout: 3000 });
    // The retired generation's late/failed auth result never failed the
    // replacement connection.
    expect(client.getState()).toBe('READY');
    const logons = server.apiRequests.filter((r) => r.method === 'session.logon');
    expect(logons.length).toBeGreaterThanOrEqual(2);
    client.close();
  });

  it('per-request HMAC signing is preserved when session auth is not opted into', async () => {
    const session = new WsSession({ apiKey: 'test-key', privateKey: privateKeyPem });
    const client = makeClient({ session, apiKey: 'hmac-key', apiSecret: 'hmac-secret' });
    await client.request('account.status', { symbol: 'BTCUSDT' }); // signed by default
    const wire = server.apiRequests[server.apiRequests.length - 1] as {
      method: string;
      params?: Record<string, unknown>;
    };
    expect(wire.params?.apiKey).toBe('hmac-key');
    expect(wire.params?.signature).toBeTypeOf('string');
    client.close();
  });

  it('useSessionAuth omits per-request credentials once the session is authenticated', async () => {
    const session = new WsSession({ apiKey: 'test-key', privateKey: privateKeyPem });
    const client = makeClient({ session, useSessionAuth: true, apiKey: 'hmac-key', apiSecret: 'hmac-secret' });
    await client.request('account.status', { symbol: 'BTCUSDT' }); // waits for READY, then signs nothing
    const wire = server.apiRequests[server.apiRequests.length - 1] as {
      method: string;
      params?: Record<string, unknown>;
    };
    expect(wire.method).toBe('account.status');
    expect(wire.params?.apiKey).toBeUndefined();
    expect(wire.params?.signature).toBeUndefined();
    client.close();
  });

  // ---------------------------------------------------------------------------
  // Ambiguous order outcomes
  // ---------------------------------------------------------------------------

  it('a dispatched order write that loses its response rejects with RpcOutcomeUnknownError', async () => {
    server.setAutoRespond(false);
    const client = makeClient();
    const order = client.request('order.place', {
      symbol: 'BTCUSDT',
      newClientOrderId: 'coid-1',
    }, { signed: false });
    await new Promise((resolve) => setTimeout(resolve, 30)); // on the wire
    server.dropClients();

    const err = (await order.catch((e: unknown) => e)) as RpcOutcomeUnknownError;
    expect(err).toBeInstanceOf(RpcOutcomeUnknownError);
    expect(err.metadata.method).toBe('order.place');
    expect(err.metadata.category).toBe('write-order');
    expect(err.metadata.clientOrderId).toBe('coid-1');
    expect(err.metadata.symbol).toBe('BTCUSDT');
    expect(err.metadata.cause).toBe('connection-drop');
    expect(err.metadata.requestId).toBeTypeOf('string');
    // No credentials ever leak into the error metadata.
    expect(JSON.stringify(err.metadata)).not.toContain('apiKey');
    expect(JSON.stringify(err.metadata)).not.toContain('signature');
    client.close();
  });

  it('a dispatched read that loses its response stays a retryable NetworkError', async () => {
    server.setAutoRespond(false);
    const read = makeClient().request('account.status', {}, { signed: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    server.dropClients();
    await expect(read).rejects.toBeInstanceOf(NetworkError);
  });

  it('an order write that times out rejects with RpcOutcomeUnknownError (timeout cause)', async () => {
    server.setAutoRespond(false);
    const client = makeClient({ requestTimeoutMs: 150 });
    const order = client.request('order.place', { symbol: 'ETHUSDT', newClientOrderId: 'coid-2' }, { signed: false });
    await expect(order).rejects.toBeInstanceOf(RpcOutcomeUnknownError);
    const err = (await order.catch((e: unknown) => e)) as RpcOutcomeUnknownError;
    expect(err.metadata.cause).toBe('timeout');
    expect(err.metadata.category).toBe('write-order');
    server.setAutoRespond(true);
  });

  it('emits unknown-outcome observability events for dispatched order writes', async () => {
    const seen: { name: string; payload: Record<string, unknown> }[] = [];
    events.on('*', ((event: { name: string; payload: Record<string, unknown> }) => {
      seen.push({ name: event.name, payload: event.payload });
    }) as never);
    server.setAutoRespond(false);
    const client = makeClient({ requestTimeoutMs: 100 });
    const order = client.request('order.cancel', { symbol: 'BTCUSDT' }, { signed: false });
    await order.catch(() => {
      /* expected */
    });
    const unknownEvents = seen.filter((e) => e.name === 'ws.api.unknown_outcome');
    expect(unknownEvents).toHaveLength(1);
    expect(unknownEvents[0]?.payload.method).toBe('order.cancel');
    server.setAutoRespond(true);
  });

  it('never replays failed order writes after a reconnect', async () => {
    server.setAutoRespond(false);
    const client = makeClient();
    const order = client.request('order.place', { symbol: 'BTCUSDT', newClientOrderId: 'coid-3' }, { signed: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    server.dropClients();
    await expect(order).rejects.toBeInstanceOf(RpcOutcomeUnknownError);
    // Connection recovers…
    server.setAutoRespond(true);
    const ok = await client.request('time', {}, { signed: false });
    expect(ok.status).toBe(200);
    // …but the lost order placement was never re-sent: exactly one order.place.
    expect(server.apiRequests.filter((r) => r.method === 'order.place')).toHaveLength(1);
    client.close();
  });

  // ---------------------------------------------------------------------------
  // Pending-request bookkeeping
  // ---------------------------------------------------------------------------

  it('late and duplicate responses are dropped, never resolve a different request', async () => {
    const lateEvents: unknown[] = [];
    events.on('*', ((event: { name: string }) => {
      if (event.name === 'ws.api.late_response') lateEvents.push(event);
    }) as never);
    server.setAutoRespond(false);
    const client = makeClient({ requestTimeoutMs: 100 });
    const first = client.request('time', {}, { signed: false });
    await first.catch(() => {
      /* timed out */
    });
    // Late response for the timed-out request id: ignored safely.
    const sentId = server.apiRequests[server.apiRequests.length - 1]?.id;
    server.sockets[0]?.send(JSON.stringify({ id: sentId, status: 200, result: {} }));
    server.sockets[0]?.send(JSON.stringify({ id: sentId, status: 200, result: {} })); // duplicate
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(lateEvents).toHaveLength(2);
    // A fresh request is unaffected by the stale ids.
    server.setAutoRespond(true);
    const ok = await client.request('time', {}, { signed: false });
    expect(ok.status).toBe(200);
    client.close();
  });

  it('bounds the pending RPC queue', async () => {
    server.setAutoRespond(false);
    const client = makeClient({ maxPendingRequests: 1, requestTimeoutMs: 300 });
    const first = client.request('slow.one', {}, { signed: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(client.request('slow.two', {}, { signed: false })).rejects.toThrow(
      /pending RPC queue full/,
    );
    await first.catch(() => {
      /* request times out — cleanup */
    });
    client.close();
  });

  it('connection generation increments per socket attempt', async () => {
    const client = makeClient();
    const gen0 = client.getConnectionGeneration();
    expect(gen0).toBe(0);
    await client.request('time', {}, { signed: false });
    expect(client.getConnectionGeneration()).toBe(1);
    server.dropClients();
    await vi.waitFor(() => {
      expect(client.getConnectionGeneration()).toBe(2);
    }, { timeout: 3000 });
    client.close();
  });
});
