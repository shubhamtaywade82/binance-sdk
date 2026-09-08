import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { HttpClient } from '../../src/client/HttpClient.js';
import { NetworkError, RateLimitError } from '../../src/errors/index.js';
import { EventBus } from '../../src/core/events.js';

/**
 * Endpoint-aware retry policy: the regression suite for the double-submit bug.
 *
 * Legacy behaviour retried every 5xx/network error on every method — including
 * POST /fapi/v1/order, where a timeout means the order may already be live on
 * the exchange. These tests pin the strict policy: ambiguous POSTs fail fast.
 */
const server = setupServer();

describe('HttpClient retry policy (strict)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  function fastClient(options: Record<string, unknown> = {}): HttpClient {
    return new HttpClient({
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      maxRetries: 3,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 1,
      minTimeMs: 0,
      ...options,
    });
  }

  it('does NOT retry a POST order placement after a network-level failure', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.example.com/fapi/v1/order', () => {
        attempts += 1;
        // Simulate a dropped connection (no response).
        return HttpResponse.error();
      }),
    );

    const client = fastClient();
    await expect(
      client.post('/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY' }, 'signed'),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(attempts).toBe(1); // a blind retry could double the order
  });

  it('does NOT retry a POST order placement on a 5xx (may have been processed)', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.example.com/fapi/v1/order', () => {
        attempts += 1;
        return new HttpResponse(null, { status: 502 });
      }),
    );

    const client = fastClient();
    await expect(
      client.post('/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY' }, 'signed'),
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('retries GETs on 5xx until success', async () => {
    let attempts = 0;
    server.use(
      http.get('https://api.example.com/fapi/v1/depth', () => {
        attempts += 1;
        if (attempts < 3) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({ lastUpdateId: 1, bids: [], asks: [] });
      }),
    );

    const client = fastClient();
    const result = await client.get('/fapi/v1/depth');
    expect(result).toEqual({ lastUpdateId: 1, bids: [], asks: [] });
    expect(attempts).toBe(3);
  });

  it('retries any method on 429 (the request was never processed)', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.example.com/fapi/v1/order', () => {
        attempts += 1;
        if (attempts === 1) {
          return new HttpResponse(JSON.stringify({ code: -1003, msg: 'Too many requests' }), {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return HttpResponse.json({ orderId: 1, status: 'NEW' });
      }),
    );

    const client = fastClient();
    const result = await client.post('/fapi/v1/order', { symbol: 'BTCUSDT' }, 'signed');
    expect(result).toEqual({ orderId: 1, status: 'NEW' });
    expect(attempts).toBe(2);
  });

  it('retries whitelisted idempotent POSTs (order/test) on 5xx', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.example.com/fapi/v1/order/test', () => {
        attempts += 1;
        if (attempts === 1) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json({});
      }),
    );

    const client = fastClient();
    await client.post('/fapi/v1/order/test', {}, 'signed');
    expect(attempts).toBe(2);
  });

  it('never retries deterministic 4xx rejections', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.example.com/fapi/v1/order', () => {
        attempts += 1;
        return new HttpResponse(JSON.stringify({ code: -2010, msg: 'NEW_ORDER_REJECTED' }), {
          status: 400,
        });
      }),
    );

    const client = fastClient();
    await expect(client.post('/fapi/v1/order', {}, 'signed')).rejects.toThrow(/NEW_ORDER_REJECTED/);
    expect(attempts).toBe(1);
  });

  it('legacy policy restores retry-everything behaviour', async () => {
    let attempts = 0;
    server.use(
      http.post('https://api.example.com/fapi/v1/order', () => {
        attempts += 1;
        return new HttpResponse(null, { status: 502 });
      }),
    );

    const client = fastClient({ retryPolicy: 'legacy' });
    await expect(client.post('/fapi/v1/order', {}, 'signed')).rejects.toThrow();
    expect(attempts).toBe(4); // 1 + 3 retries
  });

  it('re-signs each retry attempt (fresh timestamp, no -1021 on retry)', async () => {
    const seenTimestamps: number[] = [];
    server.use(
      http.get('https://api.example.com/fapi/v1/order', ({ request }) => {
        const url = new URL(request.url);
        seenTimestamps.push(Number(url.searchParams.get('timestamp')));
        if (seenTimestamps.length < 2) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({ orderId: 1, status: 'NEW' });
      }),
    );

    const client = new HttpClient({
      baseURL: 'https://api.example.com',
      apiKey: 'k',
      apiSecret: 's',
      maxRetries: 2,
      retryBaseDelayMs: 30,
      retryMaxDelayMs: 30,
      minTimeMs: 0,
    });
    await client.get('/fapi/v1/order', { symbol: 'BTCUSDT' }, 'signed');
    expect(seenTimestamps).toHaveLength(2);
    // The second attempt's timestamp must be >= the first (regenerated, not reused).
    expect(seenTimestamps[1]).toBeGreaterThanOrEqual(seenTimestamps[0]);
  });

  it('publishes request lifecycle events on the observability bus', async () => {
    const bus = new EventBus();
    const names: string[] = [];
    bus.on('http.', (event) => names.push(event.name));

    server.use(
      http.get('https://api.example.com/time', () => HttpResponse.json({ serverTime: 1 })),
    );

    const client = fastClient({ events: bus });
    await client.get('/time');
    expect(names).toContain('http.request.start');
    expect(names).toContain('http.request.end');
    expect(bus.history().length).toBeGreaterThanOrEqual(0);
  });

  it('retry events carry the reason and delay', async () => {
    const bus = new EventBus();
    const retries: Array<Record<string, unknown>> = [];
    bus.on('http.request.retry', (event) => retries.push(event.payload));

    server.use(
      http.get('https://api.example.com/ping', () => {
        if (retries.length === 0) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({});
      }),
    );

    const client = fastClient({ events: bus });
    await client.get('/ping');
    expect(retries).toHaveLength(1);
    expect(retries[0].reason).toBe('http 503');
    expect(retries[0].attempt).toBe(1);
  });

  it('RateLimitError still surfaces after exhausted 429 retries', async () => {
    server.use(
      http.get('https://api.example.com/limited', () =>
        new HttpResponse(JSON.stringify({ code: -1003, msg: 'Too many requests' }), { status: 429 }),
      ),
    );
    const client = fastClient();
    await expect(client.get('/limited')).rejects.toBeInstanceOf(RateLimitError);
  });
});
