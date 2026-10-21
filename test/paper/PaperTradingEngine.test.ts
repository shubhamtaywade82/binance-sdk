import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PaperTradingEngine } from '../../src/paper/PaperTradingEngine.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function priceRoute(price: number) {
  return http.get('https://fapi.binance.com/fapi/v1/ticker/price', ({ request }) => {
    const symbol = new URL(request.url).searchParams.get('symbol');
    return HttpResponse.json({ symbol, price: String(price) });
  });
}

function engine(initialBalance = 10_000): PaperTradingEngine {
  return new PaperTradingEngine({ initialBalance });
}

describe('PaperTradingEngine', () => {
  it('accepts any tradeable symbol rather than a hardcoded allowlist', async () => {
    server.use(priceRoute(60_000));

    const e = engine();
    const order = await e.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01 });
    expect(order.symbol).toBe('BTCUSDT');
    expect(order.avgFillPrice).toBe(60_000);
  });

  it('books realized PnL when a position is fully closed', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 2 });

    server.use(priceRoute(150));
    const close = await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 2 });

    // 2 units bought at 100, sold at 150 => +100 realized.
    expect(close.realizedPnl).toBe(100);
    const account = e.getAccountInfo();
    expect(account.realizedPnl).toBe(100);
    expect(account.balance).toBe(10_100);
    expect(account.positions.ETHUSDT?.side).toBe('NONE');
  });

  it('books realized PnL on a losing close too', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    server.use(priceRoute(80));
    const close = await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 1 });

    expect(close.realizedPnl).toBe(-20);
    expect(e.getAccountInfo().balance).toBe(9_980);
  });

  it('realizes PnL on a short position in the right direction', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 1 });

    server.use(priceRoute(90));
    const close = await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    // Short from 100, covered at 90 => +10.
    expect(close.realizedPnl).toBe(10);
    expect(e.getAccountInfo().balance).toBe(10_010);
  });

  it('uses the pre-reduction quantity when closing only part of a position', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 4 });

    server.use(priceRoute(150));
    const partial = await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 1 });

    // Exactly 1 unit closes at +50, leaving 3 units open.
    expect(partial.realizedPnl).toBe(50);
    expect(e.getPosition('ETHUSDT')?.quantity).toBe(3);
    expect(e.getPosition('ETHUSDT')?.side).toBe('LONG');
  });

  it('locks margin at the requested leverage and returns it on close', async () => {
    const e = engine(10_000);
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10, leverage: 10 });

    // Notional 1000 at 10x => 100 margin locked, not the full 1000.
    expect(e.getPosition('ETHUSDT')?.leverage).toBe(10);
    expect(e.getPosition('ETHUSDT')?.margin).toBeCloseTo(100);
    expect(e.getAccountInfo().availableBalance).toBeCloseTo(9_900);

    await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 10, leverage: 10 });

    // Margin fully released, flat PnL => back to the starting balance.
    expect(e.getPosition('ETHUSDT')?.margin).toBe(0);
    expect(e.getAccountInfo().availableBalance).toBeCloseTo(10_000);
  });

  it('releases margin proportionally on a partial close', async () => {
    const e = engine(10_000);
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10, leverage: 10 });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 5, leverage: 10 });

    expect(e.getPosition('ETHUSDT')?.margin).toBeCloseTo(50);
    expect(e.getAccountInfo().availableBalance).toBeCloseTo(9_950);
  });

  it('averages the entry price when a position is extended', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });
    server.use(priceRoute(200));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    expect(e.getPosition('ETHUSDT')?.entryPrice).toBe(150);
    expect(e.getPosition('ETHUSDT')?.quantity).toBe(2);
  });

  it('flips through zero when an opposing order exceeds the position', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    server.use(priceRoute(120));
    const flip = await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 3 });

    expect(flip.realizedPnl).toBe(20);
    const position = e.getPosition('ETHUSDT');
    expect(position?.side).toBe('SHORT');
    expect(position?.quantity).toBe(2);
    expect(position?.entryPrice).toBe(120);
  });

  it('marks open positions to market without touching realized balance', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 2 });

    server.use(priceRoute(130));
    await e.updatePositions();

    const account = e.getAccountInfo();
    expect(account.unrealizedPnl).toBe(60);
    expect(account.balance).toBe(10_000);
    expect(account.totalWalletBalance).toBe(10_060);
    expect(account.realizedPnl).toBe(0);
  });

  it('rejects an order that needs more margin than is available', async () => {
    const e = engine(100);
    server.use(priceRoute(60_000));

    await expect(
      e.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 }),
    ).rejects.toThrow(/Insufficient balance/);
  });

  it('does not charge new margin for an order that only closes exposure', async () => {
    const e = engine(1_000);
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10 });
    expect(e.getAccountInfo().availableBalance).toBeCloseTo(0);

    // Closing must be allowed even though availableBalance is exhausted.
    const close = await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 10 });
    expect(close.status).toBe('FILLED');
  });

  it('validates quantity, leverage and limit price', async () => {
    const e = engine();
    server.use(priceRoute(100));

    await expect(e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 0 })).rejects.toThrow(
      /Quantity must be positive/,
    );
    await expect(
      e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 1, leverage: 200 }),
    ).rejects.toThrow(/Leverage must be 1-125/);
    await expect(e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'LIMIT', quantity: 1 })).rejects.toThrow(
      /Price required for LIMIT/,
    );
  });

  it('returns copies so callers cannot mutate engine state', async () => {
    const e = engine();
    server.use(priceRoute(100));
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    const position = e.getPosition('ETHUSDT');
    position!.quantity = 999;
    expect(e.getPosition('ETHUSDT')?.quantity).toBe(1);

    e.getOrderHistory().push({} as never);
    expect(e.getOrderHistory()).toHaveLength(1);
  });
});
