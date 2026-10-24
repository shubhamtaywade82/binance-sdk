import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { newProductsTools } from '../../src/tools/newProducts.tools.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client() {
  return new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0, retryBaseDelayMs: 1, retryMaxDelayMs: 1 });
}

describe('fiat_orders_history tool', () => {
  it('queries /sapi/v1/fiat/orders with the given transactionType', async () => {
    let transactionType: string | null = null;
    server.use(
      http.get('https://api.binance.com/sapi/v1/fiat/orders', ({ request }) => {
        transactionType = new URL(request.url).searchParams.get('transactionType');
        return HttpResponse.json({ code: '000000', message: 'success', data: [], total: 0, success: true });
      }),
    );
    const tool = newProductsTools(client()).find((t) => t.name === 'fiat_orders_history');
    await tool?.handler({ transactionType: 1 }, { env: 'live', isSigned: true });
    expect(transactionType).toBe('1');
  });
});
