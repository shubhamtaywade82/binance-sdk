import { describe, expect, it } from 'vitest';
import { isRiskReducingOrder, serverBusyRetryDelayMs } from '../../src/preflight/serverBusy.js';

describe('isRiskReducingOrder', () => {
  it('treats closePosition, reduceOnly, and position-closing sides as risk-reducing', () => {
    expect(isRiskReducingOrder({ closePosition: true })).toBe(true);
    expect(isRiskReducingOrder({ reduceOnly: true, side: 'BUY' })).toBe(true);
    expect(isRiskReducingOrder({ positionSide: 'LONG', side: 'SELL' })).toBe(true);
    expect(isRiskReducingOrder({ positionSide: 'SHORT', side: 'BUY' })).toBe(true);
  });

  it('treats exposure-increasing orders as not risk-reducing', () => {
    expect(isRiskReducingOrder({ positionSide: 'LONG', side: 'BUY' })).toBe(false);
    expect(isRiskReducingOrder({ side: 'SELL' })).toBe(false);
  });
});

describe('serverBusyRetryDelayMs', () => {
  it('lets a risk-reducing order retry immediately', () => {
    expect(serverBusyRetryDelayMs({ reduceOnly: true }, 0)).toBe(0);
    expect(serverBusyRetryDelayMs({ closePosition: true }, 3)).toBe(0);
  });

  it('backs off exposure-increasing orders exponentially, then gives up', () => {
    expect(serverBusyRetryDelayMs({ side: 'BUY' }, 0, { baseDelayMs: 100 })).toBe(100);
    expect(serverBusyRetryDelayMs({ side: 'BUY' }, 2, { baseDelayMs: 100 })).toBe(400);
    expect(serverBusyRetryDelayMs({ side: 'BUY' }, 5, { maxAttempts: 5 })).toBeNull();
  });
});
