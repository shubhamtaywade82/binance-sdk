import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpotMarket } from '../../src/resources/SpotMarket.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('SpotMarket', () => {
  it('fetches and parses klines', async () => {
    server.use(
      http.get('https://api.binance.com/api/v3/klines', () =>
        HttpResponse.json([
          [1, '1', '2', '0.5', '1.5', '10', 2, '15', 3, '5', '7.5', '0'],
        ]),
      ),
    );

    const market = new SpotMarket();
    const klines = await market.klines('BTCUSDT', '15m');
    expect(klines[0]?.close).toBe(1.5);
  });

  it('fetches avgPrice (spot-only)', async () => {
    server.use(
      http.get('https://api.binance.com/api/v3/avgPrice', () =>
        HttpResponse.json({ mins: 5, price: '45000' }),
      ),
    );

    const market = new SpotMarket();
    const avg = await market.avgPrice('BTCUSDT');
    expect(avg.price).toBe(45000);
  });

  it('fetches uiKlines', async () => {
    server.use(
      http.get('https://api.binance.com/api/v3/uiKlines', () =>
        HttpResponse.json([
          [1, '1', '2', '0.5', '1.5', '10', 2, '15', 3, '5', '7.5', '0'],
        ]),
      ),
    );

    const market = new SpotMarket();
    const klines = await market.uiKlines('BTCUSDT', '1h');
    expect(klines[0]?.close).toBe(1.5);
  });
});
