import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { TradingPolicy } from '../../src/client/TradingPolicy.js';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { DryRunError, PolicyViolationError } from '../../src/errors/index.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('TradingPolicy', () => {
  it('permits read-only GETs even in dryRun and readOnly modes', () => {
    const policy = new TradingPolicy({ dryRun: true, readOnly: true });
    expect(() => policy.check('GET', '/fapi/v1/account', {})).not.toThrow();
  });

  it('throws DryRunError carrying the suppressed request', () => {
    const policy = new TradingPolicy({ dryRun: true });
    try {
      policy.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', quantity: 1 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DryRunError);
      const dryRun = err as DryRunError;
      expect(dryRun.method).toBe('POST');
      expect(dryRun.endpoint).toBe('/fapi/v1/order');
      expect(dryRun.params).toEqual({ symbol: 'BTCUSDT', quantity: 1 });
      expect(dryRun.describe()).toContain('Would have sent POST /fapi/v1/order');
    }
  });

  it('refuses every mutating method in readOnly mode', () => {
    const policy = new TradingPolicy({ readOnly: true });
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      expect(() => policy.check(method, '/fapi/v1/order', {})).toThrow(PolicyViolationError);
    }
  });

  it('enforces the symbol allowlist case-insensitively', () => {
    const policy = new TradingPolicy({ allowedSymbols: ['BTCUSDT'] });
    expect(() => policy.check('POST', '/fapi/v1/order', { symbol: 'btcusdt' })).not.toThrow();
    expect(() => policy.check('POST', '/fapi/v1/order', { symbol: 'DOGEUSDT' })).toThrow(/symbolNotAllowed/);
  });

  it('caps order notional from price * quantity', () => {
    const policy = new TradingPolicy({ maxNotionalPerOrder: 100 });
    expect(() => policy.check('POST', '/api/v3/order', { symbol: 'BTCUSDT', price: 10, quantity: 5 })).not.toThrow();
    expect(() => policy.check('POST', '/api/v3/order', { symbol: 'BTCUSDT', price: 10, quantity: 50 })).toThrow(
      /maxNotionalPerOrder/,
    );
  });

  it('caps notional from quoteOrderQty on spot quote-denominated orders', () => {
    const policy = new TradingPolicy({ maxNotionalPerOrder: 100 });
    expect(() => policy.check('POST', '/api/v3/order', { symbol: 'BTCUSDT', quoteOrderQty: 500 })).toThrow(
      /maxNotionalPerOrder/,
    );
  });

  it('refuses an order whose notional cannot be verified against the cap', () => {
    const policy = new TradingPolicy({ maxNotionalPerOrder: 100 });
    // MARKET order: quantity but no price, so notional is undeterminable client-side.
    expect(() => policy.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', quantity: 1 })).toThrow(
      /notionalUndeterminable/,
    );
  });

  it('leaves cancels alone when a notional cap is set', () => {
    const policy = new TradingPolicy({ maxNotionalPerOrder: 100 });
    expect(() => policy.check('DELETE', '/fapi/v1/order', { symbol: 'BTCUSDT', orderId: 1 })).not.toThrow();
  });

  it('denies withdrawals by default once a policy is active', () => {
    const policy = new TradingPolicy({});
    expect(() => policy.check('POST', '/sapi/v1/capital/withdraw/apply', { coin: 'BTC' })).toThrow(
      /withdrawalsBlocked/,
    );
  });

  it('permits withdrawals only when explicitly allowed', () => {
    const policy = new TradingPolicy({ allowWithdrawals: true });
    expect(() => policy.check('POST', '/sapi/v1/capital/withdraw/apply', { coin: 'BTC' })).not.toThrow();
  });

  it('can pin funds in place by disabling transfers', () => {
    const policy = new TradingPolicy({ allowTransfers: false });
    expect(() => policy.check('POST', '/sapi/v1/asset/transfer', { asset: 'USDT' })).toThrow(/transfersBlocked/);
    expect(() => policy.check('POST', '/sapi/v1/margin/transfer', { asset: 'USDT' })).toThrow(/transfersBlocked/);
  });

  it('honors custom blocked paths', () => {
    const policy = new TradingPolicy({ blockedPaths: ['/leverage'] });
    expect(() => policy.check('POST', '/fapi/v1/leverage', { symbol: 'BTCUSDT' })).toThrow(/blockedPath/);
  });
});

describe('TradingPolicy integration with HttpClient', () => {
  it('blocks the request before it reaches the network', async () => {
    let hits = 0;
    server.use(
      http.post('https://api.example.com/order', () => {
        hits += 1;
        return HttpResponse.json({ orderId: 1 });
      }),
    );

    const client = new HttpClient({
      baseURL: 'https://api.example.com',
      apiKey: 'k',
      apiSecret: 's',
      policy: new TradingPolicy({ dryRun: true }),
    });

    await expect(client.post('/order', { symbol: 'BTCUSDT' }, 'signed')).rejects.toThrow(DryRunError);
    expect(hits).toBe(0);
  });

  it('still allows GETs through while mutations are blocked', async () => {
    server.use(http.get('https://api.example.com/ticker', () => HttpResponse.json({ price: '1' })));

    const client = new HttpClient({
      baseURL: 'https://api.example.com',
      policy: new TradingPolicy({ readOnly: true }),
    });

    await expect(client.get('/ticker')).resolves.toEqual({ price: '1' });
  });
});

describe('BinanceClient safety config', () => {
  it('has no policy by default so existing behaviour is unchanged', () => {
    const client = new BinanceClient();
    expect(client.policy).toBeUndefined();
    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('applies the safety config across every product namespace', async () => {
    const client = new BinanceClient({
      apiKey: 'k',
      apiSecret: 's',
      safety: { dryRun: true, allowedSymbols: ['BTCUSDT'] },
    });

    expect(client.policy).toBeInstanceOf(TradingPolicy);

    // Futures, spot, COIN-M and margin all route through the same policy instance.
    await expect(
      client.futures.trading.createOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 }),
    ).rejects.toThrow(DryRunError);
    await expect(client.spot.trading.createOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET' })).rejects.toThrow(
      DryRunError,
    );
    await expect(
      client.coinm.trading.createOrder({ symbol: 'ETHUSD_PERP', side: 'BUY', type: 'MARKET', quantity: 1 }),
    ).rejects.toThrow(PolicyViolationError);
    await expect(client.wallet.withdraw({ coin: 'BTC', address: 'a', amount: 1 })).rejects.toThrow(
      /withdrawalsBlocked/,
    );

    client.futures.ws.close();
    client.spot.ws.close();
  });
});
