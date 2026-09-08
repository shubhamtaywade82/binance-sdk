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
