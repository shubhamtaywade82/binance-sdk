import { describe, expect, it, vi } from 'vitest';
import { RiskGateway } from '../../src/client/RiskGateway.js';
import { DryRunError, PolicyViolationError } from '../../src/errors/index.js';

const ORDER = { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 };

describe('RiskGateway', () => {
  it('inherits all TradingPolicy static rules (dry run, readOnly, symbols)', () => {
    const dry = new RiskGateway({ dryRun: true });
    expect(() => dry.check('POST', '/fapi/v1/order', ORDER)).toThrow(DryRunError);

    const readOnly = new RiskGateway({ readOnly: true });
    expect(() => readOnly.check('POST', '/fapi/v1/order', ORDER)).toThrowError(/read-only/);

    const allowlist = new RiskGateway({ allowedSymbols: ['ETHUSDT'] });
    expect(() => allowlist.check('POST', '/fapi/v1/order', ORDER)).toThrowError(/not in the allowed list/);
  });

  it('enforces maxLeverage on leverage-changing requests', () => {
    const risk = new RiskGateway({ maxLeverage: 10 });
    expect(() => risk.check('POST', '/fapi/v1/leverage', { symbol: 'BTCUSDT', leverage: 25 })).toThrowError(
      /leverage 25 exceeds/,
    );
    expect(() => risk.check('POST', '/fapi/v1/leverage', { symbol: 'BTCUSDT', leverage: 5 })).not.toThrow();
  });

  it('enforces maxOrdersPerMinute as a sliding window', () => {
    const risk = new RiskGateway({ maxOrdersPerMinute: 2 });
    risk.check('POST', '/fapi/v1/order', ORDER);
    risk.recordOrderPlaced({ symbol: 'BTCUSDT' });
    risk.check('POST', '/fapi/v1/order', ORDER);
    risk.recordOrderPlaced({ symbol: 'BTCUSDT' });

    expect(() => risk.check('POST', '/fapi/v1/order', ORDER)).toThrowError(/orders in the last minute/);
    // Reads are never gated.
    expect(() => risk.check('GET', '/fapi/v1/order', { symbol: 'BTCUSDT' })).not.toThrow();
  });

  it('enforces maxOpenOrders', () => {
    const risk = new RiskGateway({ maxOpenOrders: 1 });
    risk.recordOrderPlaced({ orderId: 1, symbol: 'BTCUSDT' });
    expect(() => risk.check('POST', '/fapi/v1/order', ORDER)).toThrowError(/open orders/);

    risk.recordOrderClosed({ orderId: 1 });
    expect(() => risk.check('POST', '/fapi/v1/order', ORDER)).not.toThrow();
  });

  it('enforces per-symbol and total notional ceilings against tracked exposure', () => {
    const risk = new RiskGateway({ maxSymbolNotional: { BTCUSDT: 1000 }, maxTotalNotional: 1500 });
    risk.recordPosition({ symbol: 'BTCUSDT', notional: 600 });

    // 600 existing + 500 new = 1100 > 1000 symbol cap.
    expect(() =>
      risk.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', quantity: 5, price: 100 }),
    ).toThrowError(/symbol BTCUSDT exposure/);

    // 600 + 400 = 1000 <= 1000 symbol cap, but total 1000 <= 1500 OK.
    expect(() =>
      risk.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', quantity: 4, price: 100 }),
    ).not.toThrow();

    risk.recordPosition({ symbol: 'ETHUSDT', notional: 900 });
    // total 1500 + 400 > 1500.
    expect(() =>
      risk.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', quantity: 4, price: 100 }),
    ).toThrowError(/total exposure/);
  });

  it('trips the breaker on maxDailyLoss and refuses everything until reset()', () => {
    const risk = new RiskGateway({ maxDailyLoss: 500 });
    risk.recordRealizedPnl(-400);
    expect(risk.status().breaker.tripped).toBe(false);

    risk.recordRealizedPnl(-150);
    expect(risk.status().breaker.tripped).toBe(true);

    expect(() => risk.check('POST', '/fapi/v1/order', ORDER)).toThrowError(/circuit breaker is tripped/);
    // Even non-order mutations are refused.
    expect(() => risk.check('POST', '/sapi/v1/capital/transfer', {})).toThrowError(/circuit breaker/);

    risk.reset();
    expect(risk.status().breaker.tripped).toBe(false);
    expect(() => risk.check('POST', '/fapi/v1/order', ORDER)).not.toThrow();
  });

  it('refusals do not trip the breaker, but the daily loss kill switch does', () => {
    const risk = new RiskGateway({ maxOrdersPerMinute: 1 });
    risk.recordOrderPlaced({ orderId: 1, symbol: 'BTCUSDT' });

    // A refused request leaves the client usable for other (valid) requests.
    expect(() => risk.check('POST', '/fapi/v1/order', ORDER)).toThrowError(/orders in the last minute/);
    expect(() => risk.check('GET', '/fapi/v1/time')).not.toThrow();
    expect(risk.status().breaker.tripped).toBe(false);

    // The kill switch is sticky: once the daily loss limit is hit, everything
    // mutating is refused until an explicit reset.
    const kill = new RiskGateway({ maxDailyLoss: 100 });
    kill.recordRealizedPnl(-150);
    const err = (() => {
      try {
        kill.check('POST', '/fapi/v1/order', ORDER);
      } catch (e) {
        return e as PolicyViolationError;
      }
      return undefined;
    })();
    expect(err?.rule).toBe('circuitBreaker');
  });

  it('status() reports a coherent snapshot', () => {
    const risk = new RiskGateway({});
    risk.recordOrderPlaced({ orderId: 1, symbol: 'BTCUSDT', notional: 100 });
    risk.recordPosition({ symbol: 'BTCUSDT', notional: 3000 });

    const snap = risk.status();
    expect(snap.openOrders).toBe(1);
    expect(snap.ordersThisMinute).toBe(1);
    expect(snap.totalNotionalExposure).toBe(3000);
    expect(snap.symbolNotionalExposure.BTCUSDT).toBe(3000);
    expect(snap.breaker.tripped).toBe(false);
  });

  it('rolls daily PnL accounting at the 24h mark', () => {
    const risk = new RiskGateway({ maxDailyLoss: 100 });
    risk.recordRealizedPnl(-90);
    // Simulate the day rolling over by rewinding the internal day start.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    expect(risk.status().realizedPnlToday).toBe(0);
    risk.recordRealizedPnl(-50);
    expect(risk.status().breaker.tripped).toBe(false);
    vi.useRealTimers();
  });

  it('is accepted wherever a TradingPolicy is expected (HttpClient integration)', async () => {
    const { HttpClient } = await import('../../src/client/HttpClient.js');
    const risk = new RiskGateway({ maxOrdersPerMinute: 1 });
    risk.recordOrderPlaced({ symbol: 'BTCUSDT' });
    const http = new HttpClient({ baseURL: 'https://api.binance.com', policy: risk });

    await expect(http.post('/fapi/v1/order', ORDER, 'signed')).rejects.toThrowError(/orders in the last minute/);
  });
});
