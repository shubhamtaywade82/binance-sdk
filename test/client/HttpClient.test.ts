import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { BinanceApiError, RateLimitError } from '../../src/errors/index.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('HttpClient', () => {
  it('returns parsed JSON on 200', async () => {
    server.use(http.get('https://api.example.com/ping', () => HttpResponse.json({ ok: true })));

    const client = new HttpClient({ baseURL: 'https://api.example.com' });
    await expect(client.get<{ ok: boolean }>('/ping')).resolves.toEqual({ ok: true });
  });

  it('syncs server time and applies the offset to signed timestamps', async () => {
    const serverTime = Date.now() + 5000;
    server.use(http.get('https://api.example.com/time', () => HttpResponse.json({ serverTime })));

    let capturedUrl = '';
    server.use(
      http.get('https://api.example.com/account', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true });
      }),
    );

    const client = new HttpClient({ baseURL: 'https://api.example.com', apiKey: 'k', apiSecret: 's' });
    const offset = await client.syncTime('/time');
    expect(offset).toBeGreaterThan(4000);
    expect(client.getTimeOffsetMs()).toBe(offset);

    await client.get('/account', undefined, 'signed');
    const timestamp = Number(new URL(capturedUrl).searchParams.get('timestamp'));
    expect(timestamp).toBeGreaterThanOrEqual(serverTime - 1000);
  });

  it('exposes rate-limit usage parsed from response headers', async () => {
    server.use(
      http.get('https://api.example.com/weighted', () =>
        HttpResponse.json({ ok: true }, { headers: { 'X-MBX-USED-WEIGHT-1M': '42' } }),
      ),
    );

    const client = new HttpClient({ baseURL: 'https://api.example.com' });
    await client.get('/weighted');
    expect(client.getRateLimitUsage().usedWeightByInterval['1m']).toBe(42);
  });

  it('serializes array params as repeated query keys', async () => {
    let capturedUrl = '';
    server.use(
      http.get('https://api.example.com/dust', ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true });
      }),
    );

    const client = new HttpClient({ baseURL: 'https://api.example.com' });
    await client.get('/dust', { asset: ['BTC', 'ETH'] });
    expect(new URL(capturedUrl).searchParams.getAll('asset')).toEqual(['BTC', 'ETH']);
  });

  it('throws BinanceApiError on 4xx with a {code,msg} body', async () => {
    server.use(
      http.get('https://api.example.com/bad', () =>
        HttpResponse.json({ code: -1121, msg: 'Invalid symbol.' }, { status: 400 }),
      ),
    );

    const client = new HttpClient({ baseURL: 'https://api.example.com' });
    await expect(client.get('/bad')).rejects.toThrow(BinanceApiError);

    try {
      await client.get('/bad');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BinanceApiError);
      const apiErr = err as BinanceApiError;
      expect(apiErr.endpoint).toBe('/bad');
      expect(apiErr.method).toBe('GET');
      expect(apiErr.isInsufficientBalance()).toBe(false);
    }
  });

  it('retries on 429 honoring Retry-After, then resolves', async () => {
    let calls = 0;
    server.use(
      http.get('https://api.example.com/limited', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            { code: -1003, msg: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': '0' } },
          );
        }
        return HttpResponse.json({ ok: true });
      }),
    );

    const client = new HttpClient({ baseURL: 'https://api.example.com', maxRetries: 2, minTimeMs: 0 });
    await expect(client.get<{ ok: boolean }>('/limited')).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('throws RateLimitError once retries are exhausted', async () => {
    server.use(
      http.get('https://api.example.com/always-limited', () =>
        HttpResponse.json(
          { code: -1003, msg: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': '0' } },
        ),
      ),
    );

    const client = new HttpClient({
      baseURL: 'https://api.example.com',
      maxRetries: 1,
      minTimeMs: 0,
    });
    await expect(client.get('/always-limited')).rejects.toThrow(RateLimitError);

    try {
      await client.get('/always-limited');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      const rateLimitErr = err as RateLimitError;
      expect(rateLimitErr.retryAfterMs).toBe(0);
      expect(rateLimitErr.isRateLimitError()).toBe(true);
    }
  });
});
