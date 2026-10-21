import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { UserDataStream } from '../../src/resources/UserDataStream.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('UserDataStream', () => {
  it('creates a listenKey via POST with apiKey auth', async () => {
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/listenKey', () =>
        HttpResponse.json({ listenKey: 'lk123' }),
      ),
    );

    const stream = new UserDataStream(
      new HttpClient({ baseURL: 'https://fapi.binance.com', apiKey: 'k', apiSecret: 's' }),
    );
    const { listenKey } = await stream.createListenKey();
    expect(listenKey).toBe('lk123');
  });

  it('keeps a listenKey alive via PUT', async () => {
    server.use(
      http.put('https://fapi.binance.com/fapi/v1/listenKey', () => HttpResponse.json({})),
    );

    const stream = new UserDataStream(
      new HttpClient({ baseURL: 'https://fapi.binance.com', apiKey: 'k', apiSecret: 's' }),
    );
    await expect(stream.keepAliveListenKey()).resolves.toEqual({});
  });

  it('closes a listenKey via DELETE', async () => {
    server.use(
      http.delete('https://fapi.binance.com/fapi/v1/listenKey', () => HttpResponse.json({})),
    );

    const stream = new UserDataStream(
      new HttpClient({ baseURL: 'https://fapi.binance.com', apiKey: 'k', apiSecret: 's' }),
    );
    await expect(stream.closeListenKey()).resolves.toEqual({});
  });
});
