import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { createFuturesToolkit } from '../../src/tools/index.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SPOT = 'https://api.binance.com/api/v3';

function client() {
  return new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0, retryBaseDelayMs: 1, retryMaxDelayMs: 1 });
}

describe('spot tools', () => {
  it('exposes a spot tool group that is part of the combined catalog', () => {
    const tk = createFuturesToolkit(client());
    expect(tk.spot.length).toBeGreaterThan(20);
    const names = new Set(tk.spot.map((t) => t.name));
    expect(names).toContain('spot_account');
    expect(names).toContain('spot_new_order');
    expect(names).toContain('spot_klines');
    expect(names).toContain('spot_order_book');
    expect(names).toContain('spot_new_oco_order');
    expect(names).toContain('spot_ws_start_user_stream');
    expect(tk.spot.every((t) => tk.tools.includes(t))).toBe(true);
  });

  it('places a spot order through the tool layer', async () => {
    server.use(
      http.post(`${SPOT}/order`, () =>
        HttpResponse.json({
          symbol: 'BTCUSDT', orderId: 7, clientOrderId: 'c7', status: 'NEW', side: 'BUY',
          type: 'LIMIT', timeInForce: 'GTC', price: '60000', origQty: '0.001',
          executedQty: '0', cummulativeQuoteQty: '0', transactTime: 1,
        }),
      ),
    );

    const tk = createFuturesToolkit(client());
    const tool = tk.spot.find((t) => t.name === 'spot_new_order')!;
    const out = await tool.handler(
      { symbol: 'btcusdt', side: 'BUY', type: 'LIMIT', quantity: '0.001', price: '60000', timeInForce: 'GTC' },
      { env: 'live', isSigned: true },
    );
    expect(JSON.parse(out as string).orderId).toBe(7);
  });

  it('reads the spot account through the tool layer', async () => {
    server.use(
      http.get(`${SPOT}/account`, () =>
        HttpResponse.json({
          makerCommission: 10, takerCommission: 10, buyerCommission: 0, sellerCommission: 0,
          canTrade: true, canWithdraw: true, canDeposit: true,
          balances: [{ asset: 'BTC', free: '1.5', locked: '0' }], permissions: ['SPOT'],
        }),
      ),
    );

    const tk = createFuturesToolkit(client());
    const tool = tk.spot.find((t) => t.name === 'spot_account')!;
    const out = await tool.handler({}, { env: 'live', isSigned: true });
    expect(JSON.parse(out as string).balances[0].asset).toBe('BTC');
  });
});
