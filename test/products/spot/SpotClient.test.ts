import { describe, expect, it } from 'vitest';
import { BinanceClient } from '../../../src/client/BinanceClient.js';
import { CoreContext } from '../../../src/core/context.js';
import { isProductClient } from '../../../src/products/types.js';
import { SpotClient } from '../../../src/products/spot/SpotClient.js';
import { ExecutionManager } from '../../../src/execution/ExecutionManager.js';
import { ExecutionPlatform } from '../../../src/execution/platform/ExecutionPlatform.js';
import { BookEngine } from '../../../src/state/platform/BookEngine.js';

describe('v3 SpotClient (standalone product client)', () => {
  it('satisfies the ProductClient boundary', () => {
    const spot = new SpotClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(spot.product).toBe('spot');
    expect(isProductClient(spot)).toBe(true);
    expect(spot.core).toBeInstanceOf(CoreContext);
    expect(typeof spot.close).toBe('function');
  });

  it('exposes the full Spot surface with stable identity', () => {
    const spot = new SpotClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(spot.execution).toBeInstanceOf(ExecutionManager);
    expect(spot.execution).toBe(spot.execution);
    for (const key of ['market', 'account', 'trading', 'userStream', 'ws', 'wsUser', 'wsApi'] as const) {
      expect(spot[key]).toBeDefined();
      expect(spot[key]).toBe(spot[key]);
    }
  });

  it('shares a caller-owned CoreContext (one bus, one transport pool)', () => {
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const a = new SpotClient(core);
    const b = new SpotClient(core);
    expect(a.core).toBe(core);
    expect(b.core).toBe(core);
    a.market.tickerPrice;
    b.market.tickerPrice;
    expect(a.core.http('spot')).toBe(b.core.http('spot'));
  });

  it('lazy-builds the v3 execution platform with stable identity', () => {
    const spot = new SpotClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    const platform = spot.executionPlatform;
    expect(platform).toBeInstanceOf(ExecutionPlatform);
    expect(platform.product).toBe('spot');
    expect(spot.executionPlatform).toBe(platform); // cached
  });

  it('lazy-builds the v3 book engine with stable identity', () => {
    const spot = new SpotClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    const books = spot.books;
    expect(books).toBeInstanceOf(BookEngine);
    expect(books.product).toBe('spot');
    expect(spot.books).toBe(books); // cached
  });

  it('close() is idempotent and product-scoped', () => {
    const spot = new SpotClient(new CoreContext());
    expect(() => {
      spot.close();
      spot.close();
    }).not.toThrow();
  });

  it('BinanceClient facade and SpotClient build identical surface wiring', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const spot = new SpotClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(client.spot.execution.constructor).toBe(spot.execution.constructor);
    expect(client.spot.ws.constructor).toBe(spot.ws.constructor);
    expect(client.spot.trading.constructor).toBe(spot.trading.constructor);
  });

  it('close() releases the lazy execution platform and book engine', () => {
    const spot = new SpotClient(new CoreContext());
    expect(spot.executionPlatform).toBeInstanceOf(ExecutionPlatform);
    expect(spot.books).toBeInstanceOf(BookEngine);
    expect(() => spot.close()).not.toThrow();
  });
});
