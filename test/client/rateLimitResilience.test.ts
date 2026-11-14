import { EventEmitter } from 'node:events';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { RateLimitTracker, attachWsRateLimits } from '../../src/client/RateLimitTracker.js';
import { RateLimitError } from '../../src/errors/RateLimitError.js';

const server = setupServer();

describe('HttpClient -1021 resync and cross-request cooldown', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('resyncs the clock once on a signed -1021 and retries with a fresh signature', async () => {
    let timeCalls = 0;
    let signedCalls = 0;
    server.use(
      http.get('https://api.example.com/time', () => {
        timeCalls += 1;
        return HttpResponse.json({ serverTime: Date.now() });
      }),
      http.get('https://api.example.com/signed', () => {
        signedCalls += 1;
        if (signedCalls === 1) {
          return HttpResponse.json({ code: -1021, msg: 'Timestamp for this request is outside of the recvWindow.' }, { status: 400 });
        }
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = new HttpClient({
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      maxRetries: 0,
    } as ConstructorParameters<typeof HttpClient>[0]);
    await expect(client.get<{ ok: boolean }>('/signed', {}, 'signed')).resolves.toEqual({ ok: true });
    expect(timeCalls).toBe(1);
    expect(signedCalls).toBe(2);
  });

  it('does not loop: a second -1021 after the resync surfaces as an error', async () => {
    let signedCalls = 0;
    server.use(
      http.get('https://api.example.com/time', () => HttpResponse.json({ serverTime: Date.now() })),
      http.get('https://api.example.com/always-stale', () => {
        signedCalls += 1;
        return HttpResponse.json({ code: -1021, msg: 'stale' }, { status: 400 });
      }),
    );
    const client = new HttpClient({
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      maxRetries: 0,
    } as ConstructorParameters<typeof HttpClient>[0]);
    await expect(client.get('/always-stale', {}, 'signed')).rejects.toThrow();
    expect(signedCalls).toBe(2);
  });

  it('holds the next request for the Retry-After cooldown after a 429', async () => {
    let limitedCalls = 0;
    let followUpAt = 0;
    server.use(
      http.get('https://api.example.com/limited', () => {
        limitedCalls += 1;
        return HttpResponse.json({ code: -1003, msg: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '1' } });
      }),
      http.get('https://api.example.com/next', () => {
        followUpAt = Date.now();
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = new HttpClient({ baseURL: 'https://api.example.com', maxRetries: 0 } as ConstructorParameters<typeof HttpClient>[0]);
    await expect(client.get('/limited')).rejects.toBeInstanceOf(RateLimitError);
    const sentAt = Date.now();
    await expect(client.get('/next')).resolves.toEqual({ ok: true });
    expect(limitedCalls).toBe(1);
    expect(followUpAt - sentAt).toBeGreaterThanOrEqual(900);
  });
});

describe('RateLimitTracker order-burst throttling and WS rateLimits', () => {
  it('throttles on the 10-second order count only when the caller configured the limit', () => {
    const configured = new RateLimitTracker({ ordersPer10s: 10, safetyMargin: 0.8 });
    configured.update({ 'x-mbx-order-count-10s': '9' });
    expect(configured.getThrottleDelayMs()).toBeGreaterThan(0);
    configured.update({ 'x-mbx-order-count-10s': '5' });
    expect(configured.getThrottleDelayMs()).toBe(0);

    const unconfigured = new RateLimitTracker({ safetyMargin: 0.8 });
    unconfigured.update({ 'x-mbx-order-count-10s': '9999' });
    expect(unconfigured.getThrottleDelayMs()).toBe(0);
  });

  it('maps WS rateLimits blocks onto the weight and order windows', () => {
    const tracker = new RateLimitTracker({ weightLimitPerMinute: 6000, ordersPer10s: 10, safetyMargin: 0.8 });
    const source = new EventEmitter();
    attachWsRateLimits(source, tracker);
    source.emit('rateLimits', [
      { rateLimitType: 'REQUEST_WEIGHT', interval: 'MINUTE', intervalNum: 1, limit: 6000, count: 120 },
      { rateLimitType: 'ORDERS', interval: 'SECOND', intervalNum: 10, limit: 10, count: 9 },
      { rateLimitType: 'ORDERS', interval: 'DAY', intervalNum: 1, limit: 200000, count: 4 },
    ]);
    expect(tracker.getUsage().usedWeightByInterval['1m']).toBe(120);
    expect(tracker.getUsage().orderCountByInterval['10s']).toBe(9);
    expect(tracker.getUsage().orderCountByInterval['1d']).toBeUndefined();
    expect(tracker.getThrottleDelayMs()).toBeGreaterThan(0);
  });
});
