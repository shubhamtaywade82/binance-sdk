import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { HttpClient } from '../../src/client/HttpClient.js';
import { AmbiguousExecutionError, BinanceApiError, NetworkError } from '../../src/errors/index.js';
import { createTestLogger } from '../../src/util/logger.js';

const BASE = 'https://api.binance.com';

const server = setupServer();

beforeEach(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  server.close();
});

function makeClient(overrides: Record<string, unknown> = {}): HttpClient {
  return new HttpClient({
    baseURL: BASE,
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    minTimeMs: 0,
    retryBaseDelayMs: 1,
    retryMaxDelayMs: 1,
    ...overrides,
  });
}

describe('endpoint-aware retry semantics', () => {
  it('retries a 502 on a GET (reads are unambiguous)', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/fapi/v1/time`, () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 502 });
        return HttpResponse.json({ serverTime: 123 });
      }),
    );

    const client = makeClient();
    const result = await client.get<{ serverTime: number }>('/fapi/v1/time');
    expect(result.serverTime).toBe(123);
    expect(calls).toBe(3);
  });

  it('raises AmbiguousExecutionError instead of retrying an order POST on 503', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/fapi/v1/order`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );

    const client = makeClient();
    const params = { symbol: 'BTCUSDT', newClientOrderId: 'strategy-abc-123', quantity: 1 };
    await expect(client.post('/fapi/v1/order', params, 'signed')).rejects.toBeInstanceOf(
      AmbiguousExecutionError,
    );
    // The dangerous part: no automatic duplicate submission.
    expect(calls).toBe(1);
  });

  it('carries the clientOrderId so callers can reconcile', async () => {
    server.use(
      http.post(`${BASE}/fapi/v1/order`, () => new HttpResponse(null, { status: 502 })),
    );

    const client = makeClient();
    const err = await client
      .post('/fapi/v1/order', { symbol: 'BTCUSDT', newClientOrderId: 'abc-123' }, 'signed')
      .catch((e: unknown) => e as AmbiguousExecutionError);

    expect(err).toBeInstanceOf(AmbiguousExecutionError);
    expect((err as AmbiguousExecutionError).clientOrderId).toBe('abc-123');
    expect((err as AmbiguousExecutionError).method).toBe('POST');
    expect((err as AmbiguousExecutionError).endpoint).toBe('/fapi/v1/order');
  });

  it('raises AmbiguousExecutionError for network-level failures on mutations', async () => {
    server.use(
      http.post(`${BASE}/fapi/v1/order`, () => {
        // Simulate a dropped connection: the request may have been executed.
        return Response.error();
      }),
    );

    const client = makeClient();
    await expect(client.post('/fapi/v1/order', { symbol: 'BTCUSDT' }, 'signed')).rejects.toBeInstanceOf(
      AmbiguousExecutionError,
    );
  });

  it('retries network-level failures on GETs', async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/fapi/v1/time`, () => {
        calls += 1;
        if (calls < 2) return Response.error();
        return HttpResponse.json({ serverTime: 42 });
      }),
    );

    const client = makeClient();
    const result = await client.get<{ serverTime: number }>('/fapi/v1/time');
    expect(result.serverTime).toBe(42);
    expect(calls).toBe(2);
  });

  it('still retries 429 on mutations (definitive rejection, never executed)', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/fapi/v1/order`, () => {
        calls += 1;
        if (calls < 2) {
          return new HttpResponse(JSON.stringify({ code: -1003, msg: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return HttpResponse.json({ orderId: 1 });
      }),
    );

    const client = makeClient();
    const result = await client.post<Record<string, unknown>>('/fapi/v1/order', { symbol: 'BTCUSDT' }, 'signed');
    expect(result).toEqual({ orderId: 1 });
    expect(calls).toBe(2);
  });

  it('retries ambiguous mutations when the caller marks the endpoint idempotent', async () => {
    let calls = 0;
    server.use(
      http.put(`${BASE}/fapi/v1/listenKey`, () => {
        calls += 1;
        if (calls < 2) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({});
      }),
    );

    const client = makeClient();
    await client.put('/fapi/v1/listenKey', undefined, 'apiKey', { retryMutation: 'always' });
    expect(calls).toBe(2);
  });

  it('still throws BinanceApiError for definitive non-retryable rejections', async () => {
    server.use(
      http.post(`${BASE}/fapi/v1/order`, () =>
        new HttpResponse(JSON.stringify({ code: -2010, msg: 'NEW_ORDER_REJECTED' }), { status: 400 }),
      ),
    );

    const client = makeClient();
    await expect(client.post('/fapi/v1/order', { symbol: 'BTCUSDT' }, 'signed')).rejects.toBeInstanceOf(
      BinanceApiError,
    );
  });

  it('emits structured log records for retries and ambiguity', async () => {
    server.use(http.post(`${BASE}/fapi/v1/order`, () => new HttpResponse(null, { status: 503 })));

    const logger = createTestLogger();
    const client = makeClient({ logger });
    await client.post('/fapi/v1/order', { symbol: 'BTCUSDT' }, 'signed').catch(() => undefined);

    const events = logger.records.map((r) => r.event);
    expect(events).toContain('request-ambiguous');
    expect(events).toContain('request-failed');
    // Log records are single-line JSON with component and timestamp.
    const ambiguous = logger.records.find((r) => r.event === 'request-ambiguous');
    expect(ambiguous).toMatchObject({ level: 'warn', component: 'sdk' });
    expect(typeof ambiguous?.ts).toBe('string');
  });

  it('NetworkError remains the fallback for non-axios failures on GETs', async () => {
    // Axios throws TypeError for malformed URLs — surfaced as NetworkError.
    const client = new HttpClient({
      baseURL: 'not-a-url',
      minTimeMs: 0,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 1,
      maxRetries: 0,
    });
    await expect(client.get('/fapi/v1/time')).rejects.toBeInstanceOf(NetworkError);
  });
});
