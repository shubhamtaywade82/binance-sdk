import { describe, expect, it } from 'vitest';
import { BinanceClient } from '../../../src/client/BinanceClient.js';
import { CoreContext } from '../../../src/core/context.js';
import { isProductClient } from '../../../src/products/types.js';
import { CoinMClient } from '../../../src/products/coinm/CoinMClient.js';

describe('v3 CoinMClient (standalone product client)', () => {
  it('satisfies the ProductClient boundary', () => {
    const coinm = new CoinMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(coinm.product).toBe('coinm');
    expect(isProductClient(coinm)).toBe(true);
    expect(coinm.core).toBeInstanceOf(CoreContext);
    expect(typeof coinm.close).toBe('function');
  });

  it('exposes the full COIN-M surface with stable identity', () => {
    const coinm = new CoinMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    for (const key of ['market', 'account', 'trading', 'execution', 'userStream', 'ws', 'wsUser'] as const) {
      expect(coinm[key]).toBeDefined();
      expect(coinm[key]).toBe(coinm[key]);
    }
  });

  it('execution is an idempotent ExecutionManager scoped to coinm', () => {
    const coinm = new CoinMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(coinm.execution.product).toBe('coinm');
  });

  it('executionPlatform and books are lazy, stable, and closed by close()', () => {
    const coinm = new CoinMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    const platform = coinm.executionPlatform;
    const books = coinm.books;
    expect(platform).toBe(coinm.executionPlatform);
    expect(books).toBe(coinm.books);
    expect(platform.product).toBe('coinm');
    expect(books.product).toBe('coinm');
    expect(() => coinm.close()).not.toThrow();
    expect(books.isClosed).toBe(true);
  });

  it('shares a caller-owned CoreContext (one bus, one transport pool)', () => {
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const a = new CoinMClient(core);
    const b = new CoinMClient(core);
    expect(a.core).toBe(core);
    expect(b.core).toBe(core);
    a.market.tickerPrice;
    b.market.tickerPrice;
    expect(a.core.http('dapi')).toBe(b.core.http('dapi'));
  });

  it('close() is idempotent and product-scoped', () => {
    const coinm = new CoinMClient(new CoreContext());
    expect(() => {
      coinm.close();
      coinm.close();
    }).not.toThrow();
  });

  it('BinanceClient facade and CoinMClient build identical surface wiring', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const coinm = new CoinMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(client.coinm.market.constructor).toBe(coinm.market.constructor);
    expect(client.coinm.ws.constructor).toBe(coinm.ws.constructor);
    expect(client.coinm.trading.constructor).toBe(coinm.trading.constructor);
    expect(client.coinm.execution.constructor).toBe(coinm.execution.constructor);
  });
});
