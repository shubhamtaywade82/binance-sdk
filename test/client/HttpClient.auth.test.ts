import { createHmac } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { BinanceAuthError } from '../../src/errors/index.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('HttpClient auth', () => {
  it('adds X-MBX-APIKEY header for apiKey mode', async () => {
    let seenHeader = '';
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/listenKey', ({ request }) => {
        seenHeader = request.headers.get('X-MBX-APIKEY') ?? '';
        return HttpResponse.json({ listenKey: 'abc' });
      }),
    );

    const client = new HttpClient({ baseURL: 'https://fapi.binance.com/fapi/v1', apiKey: 'k1', apiSecret: 's1' });
    await client.post('/listenKey', undefined, 'apiKey');
    expect(seenHeader).toBe('k1');
  });

  it('signs signed requests with HMAC-SHA256 and appends timestamp+recvWindow', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://fapi.binance.com/fapi/v2/balance', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json([]);
      }),
    );

    const client = new HttpClient({
      baseURL: 'https://fapi.binance.com/fapi/v2',
      apiKey: 'k2',
      apiSecret: 'secret',
      recvWindow: 1234,
    });
    await client.get('/balance', undefined, 'signed');

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('recvWindow')).toBe('1234');
    expect(url.searchParams.get('timestamp')).toBeTruthy();

    const query = url.search.slice(1).replace(/&signature=[^&]+$/, '');
    const expected = createHmac('sha256', 'secret').update(query).digest('hex');
    expect(url.searchParams.get('signature')).toBe(expected);
  });

  it('throws BinanceAuthError when credentials are missing', async () => {
    const client = new HttpClient({ baseURL: 'https://fapi.binance.com/fapi/v2' });
    await expect(client.get('/balance', undefined, 'signed')).rejects.toThrow(BinanceAuthError);
    await expect(client.get('/balance', undefined, 'apiKey')).rejects.toThrow(BinanceAuthError);
  });
});

describe('HttpClient rate limiter & retry config', () => {
  it('exposes and updates rate limiter/retry config', () => {
    const client = new HttpClient({ baseURL: 'https://fapi.binance.com/fapi/v1', minTimeMs: 10 });
    expect(client.getRateLimiterStatus().minTimeMs).toBe(10);
    expect(client.getRetryConfig().maxRetries).toBe(3);
    expect(client.getRetryConfig().policy).toBe('strict');

    client.configureRateLimiter({ minTimeMs: 100 });
    client.configureRetry({ maxRetries: 5, baseDelayMs: 500, maxDelayMs: 4000, factor: 3 });

    expect(client.getRateLimiterStatus().minTimeMs).toBe(100);
    expect(client.getRetryConfig()).toEqual({ maxRetries: 5, baseDelayMs: 500, maxDelayMs: 4000, factor: 3, policy: 'strict' });
  });
});
