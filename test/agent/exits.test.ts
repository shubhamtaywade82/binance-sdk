import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PaperTradingEngine } from '../../src/paper/PaperTradingEngine.js';
import {
  applyExit,
  nextExitAction,
  toManagedPosition,
  updateHighWater,
  type ManagedPosition,
} from '../../src/agent/exits.js';
import { DEFAULT_PROFILE } from '../../src/agent/config.js';

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

/** A 1.0-unit long entered at 100, stop 97, TP1 103 (+1R), TP2 106 (+2R). */
function longPosition(): ManagedPosition {
  return {
    symbol: 'BTCUSDT',
    side: 'LONG',
    quantity: '1.0',
    remaining: 1,
    openedAt: Date.now(),
    stopPrice: 97,
    tp1Price: 103,
    tp2Price: 106,
    tp1Done: false,
    tp2Done: false,
    highWater: 100,
  };
}

describe('paper exit state machine — remaining-quantity accounting', () => {
  it('TP1 then hard stop: closes 40% then the REMAINING 60% — flat, never reversed', () => {
    const pos = longPosition();
    const tp1 = nextExitAction(pos, 103, Date.now(), DEFAULT_PROFILE)!;
    expect(tp1).toMatchObject({ reason: 'tp1', quantity: 0.4, terminal: false });
    applyExit(pos, tp1);
    expect(pos.remaining).toBeCloseTo(0.6, 12);
    expect(pos.tp1Done).toBe(true);

    const stop = nextExitAction(pos, 96.5, Date.now(), DEFAULT_PROFILE)!;
    expect(stop).toMatchObject({ reason: 'stop', quantity: 0.6, terminal: true });
    applyExit(pos, stop);
    expect(pos.remaining).toBe(0);
  });

  it('TP1 then TP2 then trailing stop: closes 0.4 + 0.3 + remaining 0.3 — flat', () => {
    const pos = longPosition();
    updateHighWater(pos, 103);
    const tp1 = nextExitAction(pos, 103, Date.now(), DEFAULT_PROFILE)!;
    applyExit(pos, tp1);

    // Price gaps through TP2: one cycle drains both levels.
    updateHighWater(pos, 106);
    const tp2 = nextExitAction(pos, 106, Date.now(), DEFAULT_PROFILE)!;
    expect(tp2).toMatchObject({ reason: 'tp2', quantity: 0.3, terminal: false });
    applyExit(pos, tp2);
    expect(pos.remaining).toBeCloseTo(0.3, 12);

    // Trail arms after TP2: a 1% callback off the 106 high water trips at ~104.94.
    const trail = nextExitAction(pos, 104.9, Date.now(), DEFAULT_PROFILE)!;
    expect(trail).toMatchObject({ reason: 'trail', quantity: 0.3, terminal: true });
    applyExit(pos, trail);
    expect(pos.remaining).toBe(0);
  });

  it('time stop after TP1: closes the remaining 60% — flat', () => {
    const pos = longPosition();
    const tp1 = nextExitAction(pos, 103, Date.now(), DEFAULT_PROFILE)!;
    applyExit(pos, tp1);

    // Real loop geometry: the position opened timeStopHours ago, now is now.
    pos.openedAt = Date.now() - (DEFAULT_PROFILE.timeStopHours * 3_600_000 + 1_000);
    const timeStop = nextExitAction(pos, 100, Date.now(), DEFAULT_PROFILE)!;
    expect(timeStop).toMatchObject({ reason: 'time-stop', quantity: 0.6, terminal: true });
    applyExit(pos, timeStop);
    expect(pos.remaining).toBe(0);
  });

  it('the hard stop outranks everything, at any point in the ladder', () => {
    const pos = longPosition();
    // Walk the ladder partway: TP1 + TP2 taken, runner 0.3 left.
    applyExit(pos, nextExitAction(pos, 103, Date.now(), DEFAULT_PROFILE)!);
    applyExit(pos, nextExitAction(pos, 106, Date.now(), DEFAULT_PROFILE)!);
    expect(pos.remaining).toBeCloseTo(0.3, 12);
    const stop = nextExitAction(pos, 96, Date.now(), DEFAULT_PROFILE)!;
    expect(stop).toMatchObject({ reason: 'stop', quantity: 0.3, terminal: true });
  });

  it('hold when nothing triggers', () => {
    const pos = longPosition();
    expect(nextExitAction(pos, 100, Date.now(), DEFAULT_PROFILE)).toBeNull();
  });

  it('toManagedPosition wraps an EntryResult with remaining = entry quantity', () => {
    const pos = toManagedPosition({
      symbol: 'ETHUSDT', side: 'SHORT', quantity: '2.500', entryPrice: 50, stopPrice: 52,
      tp1Price: 47, tp2Price: 44, trailActivation: 42, clientOrderId: 'x',
      legs: { stopLoss: 'PAPER_UNSIMULATED', tp1: 'PAPER_UNSIMULATED', tp2: 'PAPER_UNSIMULATED', trail: 'PAPER_UNSIMULATED' },
    });
    expect(pos.remaining).toBe(2.5);
    expect(pos.highWater).toBe(50);
  });
});

describe('paper exit state machine — engine level (no position reversal)', () => {
  /**
   * Reproduces the v3.3 defect at the simulator level: partial exits used to
   * be sized off the ORIGINAL quantity, and terminal exits closed
   * `closeFraction(1)` — submitting the whole original size again. The
   * simulator reduces first and flips the remainder, so the position ended
   * REVERSED (short 0.7) instead of flat.
   */
  it('TP1 then time stop on the simulator leaves the position flat, not reversed', async () => {
    server.use(priceRoute(100));
    const engine = new PaperTradingEngine({ initialBalance: 10_000 });
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    const pos = longPosition();

    // TP1: close 40% of the original at 103.
    server.use(priceRoute(103));
    updateHighWater(pos, 103);
    const tp1 = nextExitAction(pos, 103, Date.now(), DEFAULT_PROFILE)!;
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: tp1.quantity });
    applyExit(pos, tp1);

    // Time stop: close the REMAINING 60% at 101 (position aged past the limit).
    server.use(priceRoute(101));
    pos.openedAt = Date.now() - (DEFAULT_PROFILE.timeStopHours * 3_600_000 + 1_000);
    const timeStop = nextExitAction(pos, 101, Date.now(), DEFAULT_PROFILE)!;
    expect(timeStop.quantity).toBeCloseTo(0.6, 12);
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: timeStop.quantity });
    applyExit(pos, timeStop);

    const position = engine.getPosition('BTCUSDT');
    expect(position?.side).toBe('NONE'); // flat — NOT a 0.7 short
    expect(position?.quantity).toBe(0);
    expect(engine.getOpenPositions()).toHaveLength(0);
    // 0.4 x (103-100) + 0.6 x (101-100) = 1.2 + 0.6 = 1.8 realized
    expect(engine.getAccountInfo().realizedPnl).toBeCloseTo(1.8, 6);
  });

  it('TP1 + TP2 + trailing stop on the simulator leaves the position flat', async () => {
    server.use(priceRoute(100));
    const engine = new PaperTradingEngine({ initialBalance: 10_000 });
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    const pos = longPosition();

    server.use(priceRoute(103));
    updateHighWater(pos, 103);
    const tp1 = nextExitAction(pos, 103, Date.now(), DEFAULT_PROFILE)!;
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: tp1.quantity });
    applyExit(pos, tp1);

    server.use(priceRoute(106));
    updateHighWater(pos, 106);
    const tp2 = nextExitAction(pos, 106, Date.now(), DEFAULT_PROFILE)!;
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: tp2.quantity });
    applyExit(pos, tp2);

    server.use(priceRoute(104.9));
    const trail = nextExitAction(pos, 104.9, Date.now(), DEFAULT_PROFILE)!;
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: trail.quantity });
    applyExit(pos, trail);

    const position = engine.getPosition('BTCUSDT');
    expect(position?.side).toBe('NONE'); // flat — the pre-fix run went short 0.7 here
    expect(position?.quantity).toBe(0);
    expect(engine.getOpenPositions()).toHaveLength(0);
    // 0.4 x 3 + 0.3 x 6 + 0.3 x 4.9 = 1.2 + 1.8 + 1.47 = 4.47 realized
    expect(engine.getAccountInfo().realizedPnl).toBeCloseTo(4.47, 6);
  });

  it('SHORT path: partials then stop leave the position flat', async () => {
    server.use(priceRoute(100));
    const engine = new PaperTradingEngine({ initialBalance: 10_000 });
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: 1 });

    const pos: ManagedPosition = {
      symbol: 'BTCUSDT', side: 'SHORT', quantity: '1.0', remaining: 1, openedAt: Date.now(),
      stopPrice: 103, tp1Price: 97, tp2Price: 94, tp1Done: false, tp2Done: false, highWater: 100,
    };

    server.use(priceRoute(97));
    const tp1 = nextExitAction(pos, 97, Date.now(), DEFAULT_PROFILE)!;
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: tp1.quantity });
    applyExit(pos, tp1);

    server.use(priceRoute(103.5));
    updateHighWater(pos, 102);
    const stop = nextExitAction(pos, 103.5, Date.now(), DEFAULT_PROFILE)!;
    expect(stop).toMatchObject({ reason: 'stop', quantity: 0.6, terminal: true });
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: stop.quantity });
    applyExit(pos, stop);

    const position = engine.getPosition('BTCUSDT');
    expect(position?.side).toBe('NONE');
    expect(position?.quantity).toBe(0);
    // 0.4 x 3 - 0.6 x 3.5 = 1.2 - 2.1 = -0.9 realized
    expect(engine.getAccountInfo().realizedPnl).toBeCloseTo(-0.9, 6);
  });
});
