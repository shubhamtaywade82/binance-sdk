import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { EventBus } from '../../src/core/events.js';

const server = setupServer();

describe('HttpClient -1008 SERVER_BUSY policy', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  function client(events?: EventBus): HttpClient {
    return new HttpClient({
      baseURL: 'https://api.example.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      maxRetries: 3,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 2,
      events,
    } as ConstructorParameters<typeof HttpClient>[0]);
  }

  it('retries a read after -1008 and then succeeds', async () => {
    let calls = 0;
    server.use(
      http.get('https://api.example.com/ticker', () => {
        calls += 1;
        if (calls < 3) return HttpResponse.json({ code: -1008, msg: 'Server is currently overloaded.' }, { status: 503 });
        return HttpResponse.json({ ok: true });
      }),
    );
    await expect(client().get('/ticker', {})).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it('never replays a POST order after -1008, and reports whether it was risk-reducing', async () => {
    let calls = 0;
    const events = new EventBus();
    const busy: unknown[] = [];
    events.on('http.request.server_busy', (event) => busy.push(event));
    server.use(
      http.post('https://api.example.com/fapi/v1/order', () => {
        calls += 1;
        return HttpResponse.json({ code: -1008, msg: 'Server is currently overloaded.' }, { status: 503 });
      }),
    );
    await expect(
      client(events).post('/fapi/v1/order', { symbol: 'BTCUSDT', side: 'SELL', reduceOnly: true }, 'signed'),
    ).rejects.toThrow();
    expect(calls).toBe(1);
    expect(JSON.stringify(busy[0])).toContain('"riskReducing":true');
  });
});

describe('HttpClient -1021 with no verified time endpoint', () => {
  beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('does not resync when timePath is null, so the -1021 error surfaces unchanged', async () => {
    let timeCalls = 0;
    let signedCalls = 0;
    server.use(
      http.get('https://papi.example.com/time', () => {
        timeCalls += 1;
        return HttpResponse.json({ serverTime: Date.now() });
      }),
      http.get('https://papi.example.com/signed', () => {
        signedCalls += 1;
        return HttpResponse.json({ code: -1021, msg: 'Timestamp outside recvWindow.' }, { status: 400 });
      }),
    );
    const papi = new HttpClient({
      baseURL: 'https://papi.example.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      maxRetries: 0,
      timePath: null,
    } as ConstructorParameters<typeof HttpClient>[0]);
    await expect(papi.get('/signed', {}, 'signed')).rejects.toThrow();
    expect(timeCalls).toBe(0);
    expect(signedCalls).toBe(1);
  });
});
