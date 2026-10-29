import { describe, expect, it } from 'vitest';
import { PolicyViolationError } from '../../src/errors/index.js';
import { RiskGateway } from '../../src/risk/RiskGateway.js';

describe('RiskGateway', () => {
  it('inherits every TradingPolicy guardrail (dryRun, symbols, notional cap)', () => {
    const gateway = new RiskGateway({
      dryRun: true,
      allowedSymbols: ['BTCUSDT'],
      maxNotionalPerOrder: 1000,
    });
    expect(() => gateway.check('GET', '/fapi/v1/time')).not.toThrow(); // reads pass
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET' }),
    ).toThrow(PolicyViolationError);
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 10,
        price: 200,
      }),
    ).toThrow(/notional 2000 exceeds the 1000 cap/);
  });

  it('caps leverage-change requests', () => {
    const gateway = new RiskGateway({ maxLeverage: 20 });
    expect(() =>
      gateway.check('POST', '/fapi/v1/leverage', { symbol: 'BTCUSDT', leverage: 21 }),
    ).toThrow(/maxLeverage/);
    expect(() =>
      gateway.check('POST', '/fapi/v1/leverage', { symbol: 'BTCUSDT', leverage: 10 }),
    ).not.toThrow();
  });

  it('enforces an aggregate open-order notional budget', () => {
    const gateway = new RiskGateway({ maxOpenNotional: 1000 });
    gateway.registerOpenOrder('600');
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 5,
        price: 100, // 500 notional; 600 + 500 > 1000
      }),
    ).toThrow(/maxOpenNotional/);
    gateway.releaseOpenOrder('600');
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 5,
        price: 100,
      }),
    ).not.toThrow();
  });

  it('cancels never count against the exposure budget', () => {
    const gateway = new RiskGateway({ maxOpenNotional: 100 });
    gateway.registerOpenOrder('100');
    expect(() =>
      gateway.check('DELETE', '/fapi/v1/order', { symbol: 'BTCUSDT', orderId: 1 }),
    ).not.toThrow();
  });

  it('trips the circuit breaker on the daily loss limit', () => {
    const gateway = new RiskGateway({ maxDailyLoss: 500 });
    gateway.recordRealizedPnl(-300);
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);
    gateway.recordRealizedPnl(-200); // total -500 hits the limit
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(gateway.riskStatus().circuitBreaker.reason).toBe('maxDailyLoss');

    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET' }),
    ).toThrow(/circuit breaker/);
    // Reads still flow.
    expect(() => gateway.check('GET', '/fapi/v1/depth', { symbol: 'BTCUSDT' })).not.toThrow();

    gateway.resetBreaker();
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);
  });

  it('trips the breaker after a run of consecutive failures and resets on success', () => {
    const gateway = new RiskGateway({ maxConsecutiveFailures: 3 });
    gateway.recordFailure('one');
    gateway.recordFailure('two');
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);
    gateway.recordSuccess(); // streak reset
    gateway.recordFailure('three');
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);
    gateway.recordFailure('four');
    gateway.recordFailure('five');
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(gateway.riskStatus().circuitBreaker.reason).toBe('maxConsecutiveFailures');
  });

  it('rolls the daily window at the UTC day boundary', () => {
    const gateway = new RiskGateway({ maxDailyLoss: 100 });
    const before = gateway.riskStatus();
    gateway.resetDaily();
    const after = gateway.riskStatus();
    expect(after.dailyPnl).toBe('0');
    expect(after.day >= before.day).toBe(true);
  });

  it('status reports exact decimal strings', () => {
    const gateway = new RiskGateway({ maxOpenNotional: 1 });
    gateway.registerOpenOrder('0.1');
    gateway.recordRealizedPnl('0.05');
    const status = gateway.riskStatus();
    expect(status.openNotional).toBe('0.1');
    expect(status.dailyPnl).toBe('0.05');
  });
});

describe('RiskGateway state carry across allowlist refreshes and restarts', () => {
  it('setAllowedSymbols refreshes the fence without resetting daily/breaker state', () => {
    // The v3.3 agent rebuilt its session client on every watchlist scan, which
    // silently reset the daily-loss breaker every 15 minutes. Refreshing the
    // allowlist in place must keep every other gate and all state.
    const gateway = new RiskGateway({ maxDailyLoss: 500, allowedSymbols: ['BTCUSDT'] });
    gateway.recordRealizedPnl(-300);
    gateway.recordRealizedPnl(-250); // trips at -550
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);

    // "watchlist refresh": allowlist replaced, state untouched.
    gateway.setAllowedSymbols(['ETHUSDT', 'SOLUSDT']);
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(gateway.riskStatus().dailyPnl).toBe('-550');
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'ETHUSDT', side: 'BUY', type: 'MARKET' }),
    ).toThrow(/circuit breaker/);
  });

  it('persistedState/restoreDailyState round-trips a tripped breaker across a restart', () => {
    const first = new RiskGateway({ maxDailyLoss: 500, maxConsecutiveFailures: 3 });
    first.recordRealizedPnl(-400);
    first.recordRealizedPnl(-200); // trips at -600
    const snapshot = first.persistedState();

    // "process restart": a brand-new gateway starts from nothing but restores
    // the persisted same-day snapshot — the breaker must stay tripped.
    const second = new RiskGateway({ maxDailyLoss: 500, maxConsecutiveFailures: 3 });
    expect(second.riskStatus().circuitBreaker.tripped).toBe(false);
    second.restoreDailyState(snapshot);
    expect(second.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(second.riskStatus().circuitBreaker.reason).toBe('maxDailyLoss');
    expect(second.riskStatus().dailyPnl).toBe('-600');
    expect(() =>
      second.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET' }),
    ).toThrow(/circuit breaker/);
  });

  it('restoreDailyState re-trips when the restored day is already at the limit', () => {
    const gateway = new RiskGateway({ maxDailyLoss: 1_000 });
    const today = new Date().toISOString().slice(0, 10);
    gateway.restoreDailyState({ day: today, dailyPnl: -1_000 });
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(gateway.riskStatus().circuitBreaker.reason).toBe('maxDailyLoss');
  });

  it('a snapshot from a previous UTC day is ignored — the new day starts clean', () => {
    const gateway = new RiskGateway({ maxDailyLoss: 500 });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    gateway.restoreDailyState({ day: yesterday, dailyPnl: -400, breaker: { tripped: true, reason: 'maxDailyLoss' } });
    expect(gateway.riskStatus().dailyPnl).toBe('0');
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);
  });

  it('restoring a breaker tripped on failures keeps it tripped (fail stays failed)', () => {
    const gateway = new RiskGateway({ maxConsecutiveFailures: 2 });
    const today = new Date().toISOString().slice(0, 10);
    gateway.restoreDailyState({
      day: today,
      dailyPnl: 0,
      consecutiveFailures: 2,
      breaker: { tripped: true, reason: 'maxConsecutiveFailures', detail: 'runaway' },
    });
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(gateway.riskStatus().circuitBreaker.reason).toBe('maxConsecutiveFailures');
  });
});

describe('RiskGateway open-notional budget with reference prices', () => {
  it('a MARKET order budgets against a fresh registered reference price', () => {
    const gateway = new RiskGateway({ maxOpenNotional: 1_000 });
    gateway.setReferencePrice('BTCUSDT', 50);
    // 5 x 50 = 250 — budgetable now that a reference exists.
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 5 }),
    ).not.toThrow();
    gateway.registerOpenOrder(250);
    // 5 more x 50 = 250 on top of 250 tracked > 1_000? no -> 500, fine.
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 5 }),
    ).not.toThrow();
    gateway.registerOpenOrder(750);
    // 250 tracked more (500 total) + existing 750 = 1_250 > 1_000 → denied.
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 5 }),
    ).toThrow(/maxOpenNotional/);
  });
});

describe('RiskGateway position-exposure cap (open positions, not resting orders)', () => {
  it('denies exposure-extending orders that would breach the aggregate cap, allows reducing orders', () => {
    const gateway = new RiskGateway({ maxPositionNotional: 1_000 });
    gateway.setReferencePrice('BTCUSDT', 50);

    // No positions held: a 20-unit MARKET order (20 x 50 = 1,000) is fine.
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 20 }),
    ).not.toThrow();

    // The account now holds 900 notional across two symbols.
    gateway.recordPositionNotional({ BTCUSDT: 400, ETHUSDT: 500 });
    expect(gateway.positionNotionalTotal).toBe('900');

    // A further 5 x 50 = 250 would project 1,150 > 1,000 -> denied.
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 5 }),
    ).toThrow(/maxPositionNotional/);

    // Reduce-only and close-position orders can only lower exposure -> allowed.
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: 999, reduceOnly: true }),
    ).not.toThrow();
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', closePosition: true }),
    ).not.toThrow();

    // Cancels never count either.
    expect(() =>
      gateway.check('DELETE', '/fapi/v1/order', { symbol: 'BTCUSDT', orderId: 1 }),
    ).not.toThrow();
  });

  it('a fresh snapshot REPLACES the previous one — closed positions free their budget', () => {
    const gateway = new RiskGateway({ maxPositionNotional: 1_000 });
    gateway.setReferencePrice('BTCUSDT', 50);
    gateway.recordPositionNotional({ BTCUSDT: 950 });
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 5 }),
    ).toThrow(/maxPositionNotional/);

    // Position closed on the exchange: the next snapshot shrinks the map.
    gateway.recordPositionNotional({ BTCUSDT: 0 }); // zero entries are dropped entirely
    expect(gateway.positionNotionalTotal).toBe('0');
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 5 }),
    ).not.toThrow();
  });

  it('short exposure counts as absolute notional', () => {
    const gateway = new RiskGateway({ maxPositionNotional: 1_000 });
    gateway.setReferencePrice('SOLUSDT', 20);
    gateway.recordPositionNotional({ SOLUSDT: -950 }); // negative notional (short)
    expect(gateway.positionNotionalTotal).toBe('950');
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'SOLUSDT', side: 'SELL', type: 'MARKET', quantity: 5 }),
    ).toThrow(/maxPositionNotional/);
  });
});
