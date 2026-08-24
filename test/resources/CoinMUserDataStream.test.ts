import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CoinMUserDataStream } from '../../src/resources/CoinMUserDataStream.js';
import { HttpClient } from '../../src/client/HttpClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('CoinMUserDataStream', () => {
  it('creates a listenKey via POST with apiKey auth', async () => {
    server.use(
      http.post('https://dapi.binance.com/dapi/v1/listenKey', () => HttpResponse.json({ listenKey: 'lk123' })),
    );

    const stream = new CoinMUserDataStream(
      new HttpClient({ baseURL: 'https://dapi.binance.com', apiKey: 'k', apiSecret: 's' }),
    );
    const { listenKey } = await stream.createListenKey();
    expect(listenKey).toBe('lk123');
  });

  it('keeps a listenKey alive via PUT', async () => {
    server.use(http.put('https://dapi.binance.com/dapi/v1/listenKey', () => HttpResponse.json({})));

    const stream = new CoinMUserDataStream(
      new HttpClient({ baseURL: 'https://dapi.binance.com', apiKey: 'k', apiSecret: 's' }),
    );
    await expect(stream.keepAliveListenKey()).resolves.toEqual({});
  });

  it('closes a listenKey via DELETE', async () => {
    server.use(http.delete('https://dapi.binance.com/dapi/v1/listenKey', () => HttpResponse.json({})));

    const stream = new CoinMUserDataStream(
      new HttpClient({ baseURL: 'https://dapi.binance.com', apiKey: 'k', apiSecret: 's' }),
    );
    await expect(stream.closeListenKey()).resolves.toEqual({});
  });
});
