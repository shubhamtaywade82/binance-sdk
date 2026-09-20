import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PaperTradingEngine } from '../../src/paper/PaperTradingEngine.js';
import { FixedFundingModel, FixedMaintenanceMarginModel } from '../../src/paper/models.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function priceRoute(price: number) {
  return http.get('https://fapi.binance.com/fapi/v1/ticker/price', ({ request }) => {
    const symbol = new URL(request.url).searchParams.get('symbol');
    return HttpResponse.json({ symbol, price: String(price) });
  });
}

const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000;

function fundingBoundary(ts: number): number {
  return Math.floor(ts / FUNDING_INTERVAL_MS) * FUNDING_INTERVAL_MS;
}

/**
 * Mocks only Date.now() (not the full timer system) so the engine's boundary
 * math is deterministic without freezing the setTimeout-based machinery that
 * msw/axios/Bottleneck rely on internally — vi.useFakeTimers() hangs those.
 */
function mockNow(ts: number): void {
  vi.spyOn(Date, 'now').mockReturnValue(ts);
}

describe('funding settlement', () => {
  it('is a no-op with no fundingModel configured (legacy behaviour)', async () => {
    server.use(priceRoute(100));
    const e = new PaperTradingEngine({ initialBalance: 10_000 });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10 });

    const settlements = await e.applyFunding();
    expect(settlements).toEqual([]);
    expect(e.getAccountInfo().balance).toBe(10_000);
  });

  it('charges a LONG position at the next 8h funding boundary', async () => {
    const boundary = fundingBoundary(Date.now());
    mockNow(boundary + 1_000); // just after a boundary, mid-period

    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 10_000,
      fundingModel: new FixedFundingModel(0.0001), // 1 bps
    });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10 });

    // No boundary crossed yet within the same period.
    expect(await e.applyFunding()).toEqual([]);

    mockNow(boundary + FUNDING_INTERVAL_MS + 1_000); // one full period later
    const settlements = await e.applyFunding();

    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({ symbol: 'ETHUSDT', side: 'LONG', periods: 1, rate: 0.0001 });
    // notional = 100 * 10 = 1000; long pays: -1000 * 0.0001
    expect(settlements[0].payment).toBeCloseTo(-0.1, 10);
    expect(e.getAccountInfo().balance).toBeCloseTo(9_999.9, 10);
    // 1x leverage: margin locked = notional/1 = 1000.
    expect(e.getAccountInfo().availableBalance).toBeCloseTo(9_999.9 - 1_000, 10);
  });

  it('credits a SHORT position when the rate is positive (shorts receive)', async () => {
    const boundary = fundingBoundary(Date.now());
    mockNow(boundary + 1_000);

    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 10_000,
      fundingModel: new FixedFundingModel(0.0001),
    });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 10 });

    mockNow(boundary + FUNDING_INTERVAL_MS + 1_000);
    const settlements = await e.applyFunding();

    expect(settlements[0].payment).toBeCloseTo(0.1, 10);
    expect(e.getAccountInfo().balance).toBeCloseTo(10_000.1, 10);
  });

  it('charges once per boundary crossed when polled infrequently', async () => {
    const boundary = fundingBoundary(Date.now());
    mockNow(boundary + 1_000);

    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 10_000,
      fundingModel: new FixedFundingModel(0.0001),
    });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10 });

    mockNow(boundary + 3 * FUNDING_INTERVAL_MS + 1_000); // three periods elapsed, no polling in between
    const settlements = await e.applyFunding();

    expect(settlements[0].periods).toBe(3);
    expect(settlements[0].payment).toBeCloseTo(-0.3, 10);
  });

  it('charges exactly once for a boundary the position was open through, never twice', async () => {
    const boundary = fundingBoundary(Date.now());
    // Open 1s before the next boundary — the position is live when it hits,
    // so it correctly owes funding for it (real exchanges charge the same way:
    // holding through the timestamp is what matters, not how long you held).
    mockNow(boundary + FUNDING_INTERVAL_MS - 1_000);

    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 10_000,
      fundingModel: new FixedFundingModel(0.0001),
    });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10 });

    mockNow(boundary + FUNDING_INTERVAL_MS + 500);
    const first = await e.applyFunding();
    expect(first[0].periods).toBe(1);

    // Confirms no drift/double-count: the next boundary crossed charges
    // exactly one more period, not two (which a bug reusing the pre-open
    // boundary as the baseline would produce).
    mockNow(boundary + 2 * FUNDING_INTERVAL_MS + 500);
    const second = await e.applyFunding();
    expect(second[0].periods).toBe(1);
  });

  it('resets funding tracking when a position fully closes and reopens', async () => {
    const boundary = fundingBoundary(Date.now());
    mockNow(boundary + 1_000);

    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 10_000,
      fundingModel: new FixedFundingModel(0.0001),
    });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10 });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 10 }); // close flat

    mockNow(boundary + FUNDING_INTERVAL_MS + 2_000);
    // Reopen mid-period, after the boundary the (closed) position would otherwise have owed for.
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10 });
    expect(await e.applyFunding()).toEqual([]); // nothing owed yet for the new position
  });
});

describe('liquidation', () => {
  it('is a no-op with no liquidationModel configured (legacy behaviour)', async () => {
    server.use(priceRoute(100));
    const e = new PaperTradingEngine({ initialBalance: 1_000 });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10, leverage: 10 });

    server.use(priceRoute(1)); // would be deeply underwater with a model configured
    const events = await e.updatePositions();
    expect(events).toEqual([]);
    expect(e.getPosition('ETHUSDT')?.side).toBe('LONG');
  });

  it('force-closes a LONG position once margin + unrealizedPnl drops to the maintenance requirement', async () => {
    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 1_000,
      liquidationModel: new FixedMaintenanceMarginModel(0.01), // 1% maintenance margin
    });
    // 10x leverage: margin = (10 * 100) / 10 = 100
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10, leverage: 10 });

    // At P=90: marginBalance = 100 + (90-100)*10 = 0; maintenanceMargin = 0.01*10*90 = 9 -> liquidated.
    server.use(priceRoute(90));
    const events = await e.updatePositions();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      symbol: 'ETHUSDT',
      side: 'LONG',
      quantity: 10,
      entryPrice: 100,
      markPrice: 90,
      bankruptcyPrice: 90,
      maintenanceMargin: 9,
      lostMargin: 100,
    });
    expect(events[0].realizedPnl).toBeCloseTo(-100, 10);

    const position = e.getPosition('ETHUSDT');
    expect(position?.side).toBe('NONE');
    expect(position?.quantity).toBe(0);
    expect(e.getAccountInfo().balance).toBeCloseTo(900, 10);
  });

  it('never realizes a loss beyond the position margin, even on a gapped price', async () => {
    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 1_000,
      liquidationModel: new FixedMaintenanceMarginModel(0.01),
    });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10, leverage: 10 });

    // A flash-crash gap straight to 50 (well past bankruptcy at 90) — loss must still cap at -100.
    server.use(priceRoute(50));
    const events = await e.updatePositions();

    expect(events).toHaveLength(1);
    expect(events[0].realizedPnl).toBeCloseTo(-100, 10);
    expect(e.getAccountInfo().balance).toBeCloseTo(900, 10);
    expect(e.getAccountInfo().balance).toBeGreaterThanOrEqual(0);
  });

  it('leaves a healthy position untouched', async () => {
    server.use(priceRoute(100));
    const e = new PaperTradingEngine({
      initialBalance: 1_000,
      liquidationModel: new FixedMaintenanceMarginModel(0.01),
    });
    await e.placeOrder({ symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET', quantity: 10, leverage: 10 });

    server.use(priceRoute(99)); // small adverse move, nowhere near liquidation
    const events = await e.updatePositions();

    expect(events).toEqual([]);
    expect(e.getPosition('ETHUSDT')?.side).toBe('LONG');
  });
});
