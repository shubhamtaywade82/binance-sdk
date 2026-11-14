import { describe, expect, it } from 'vitest';
import { PreflightValidationError, type PreflightRule } from '../../src/errors/PreflightValidationError.js';
import {
  GTD_MIN_LEAD_MS,
  PositionModeGuard,
  percentPriceBandFor,
  resolveGoodTillDate,
  validateIcebergOrder,
  validatePercentPriceBySide,
  validateTrailingCallbackRate,
} from '../../src/preflight/index.js';

function expectRule(fn: () => unknown, rule: PreflightRule): void {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(PreflightValidationError);
  expect((thrown as PreflightValidationError).rule).toBe(rule);
}

const PERCENT_FILTER = {
  bidMultiplierUp: '1.05',
  bidMultiplierDown: '0.95',
  askMultiplierUp: '1.10',
  askMultiplierDown: '0.90',
};

describe('validatePercentPriceBySide', () => {
  it('uses the bid multipliers for BUY and the ask multipliers for SELL', () => {
    expect(percentPriceBandFor({ side: 'BUY', price: '100', referencePrice: '100', filter: PERCENT_FILTER })).toEqual({
      lower: '95',
      upper: '105',
    });
    expect(percentPriceBandFor({ side: 'SELL', price: '100', referencePrice: '100', filter: PERCENT_FILTER })).toEqual({
      lower: '90',
      upper: '110',
    });
  });

  it('accepts prices on the inclusive boundaries and rejects just outside', () => {
    expect(() =>
      validatePercentPriceBySide({ side: 'BUY', price: '105', referencePrice: '100', filter: PERCENT_FILTER }),
    ).not.toThrow();
    expect(() =>
      validatePercentPriceBySide({ side: 'BUY', price: '105.01', referencePrice: '100', filter: PERCENT_FILTER }),
    ).toThrow(PreflightValidationError);
    expectRule(
      () => validatePercentPriceBySide({ side: 'SELL', price: '89.99', referencePrice: '100', filter: PERCENT_FILTER }),
      'PERCENT_PRICE_BY_SIDE',
    );
  });

  it('is exact where binary floats are not (0.1 × 3 band edges)', () => {
    // 0.1 * 1.1 band edge: float 0.11000000000000001 would wrongly reject 0.11.
    const filter = { ...PERCENT_FILTER, bidMultiplierUp: '1.1' };
    expect(() =>
      validatePercentPriceBySide({ side: 'BUY', price: '0.11', referencePrice: '0.1', filter }),
    ).not.toThrow();
  });

  it('rejects a zero reference price and malformed multipliers', () => {
    expectRule(
      () => validatePercentPriceBySide({ side: 'BUY', price: '1', referencePrice: '0', filter: PERCENT_FILTER }),
      'INVALID_INPUT',
    );
    expectRule(
      () =>
        validatePercentPriceBySide({
          side: 'BUY',
          price: '1',
          referencePrice: '1',
          filter: { ...PERCENT_FILTER, bidMultiplierUp: '' },
        }),
      'INVALID_INPUT',
    );
  });
});

describe('validateIcebergOrder', () => {
  const lot = { stepSize: '0.001', minQty: '0.001', maxQty: '1000' };

  it('returns the exact slice count (ceiling of quantity / icebergQty)', () => {
    expect(validateIcebergOrder({ quantity: '10', icebergQty: '3', lot, partsLimit: 5 })).toEqual({
      icebergQty: '3',
      parts: 4,
    });
  });

  it('counts parts exactly where float division would overshoot (1.1 / 0.1 = 11, not 12)', () => {
    expect(validateIcebergOrder({ quantity: '1.1', icebergQty: '0.1', lot: { ...lot, stepSize: '0.1', minQty: '0.1' }, partsLimit: 11 }).parts).toBe(11);
  });

  it('enforces ICEBERG_PARTS.limit', () => {
    expectRule(() => validateIcebergOrder({ quantity: '10', icebergQty: '3', lot, partsLimit: 3 }), 'ICEBERG_PARTS');
  });

  it('enforces LOT_SIZE on icebergQty (step, min, max)', () => {
    expectRule(() => validateIcebergOrder({ quantity: '10', icebergQty: '0.0015', lot }), 'ICEBERG_LOT');
    expectRule(() => validateIcebergOrder({ quantity: '10', icebergQty: '0.0005', lot }), 'ICEBERG_LOT');
    expectRule(
      () => validateIcebergOrder({ quantity: '5000', icebergQty: '2000', lot: { ...lot, maxQty: '1000' } }),
      'ICEBERG_LOT',
    );
  });

  it('ignores an infinite maxQty (no cap)', () => {
    expect(() =>
      validateIcebergOrder({ quantity: '5000', icebergQty: '2000', lot: { ...lot, maxQty: Number.POSITIVE_INFINITY } }),
    ).not.toThrow();
  });

  it('rejects non-positive icebergQty and icebergQty above quantity', () => {
    expectRule(() => validateIcebergOrder({ quantity: '10', icebergQty: '0', lot }), 'ICEBERG_QTY');
    expectRule(() => validateIcebergOrder({ quantity: '10', icebergQty: '11', lot }), 'ICEBERG_QTY');
  });
});

describe('resolveGoodTillDate', () => {
  const now = 1_000_000_000_000;

  it('returns undefined for non-GTD orders', () => {
    expect(resolveGoodTillDate({ timeInForce: 'GTC', nowMs: now })).toBeUndefined();
  });

  it('requires goodTillDate for GTD', () => {
    expectRule(() => resolveGoodTillDate({ timeInForce: 'GTD', nowMs: now }), 'GTD_REQUIRED');
  });

  it('requires strictly more than 600 s of lead time', () => {
    expectRule(
      () => resolveGoodTillDate({ timeInForce: 'GTD', goodTillDate: now + GTD_MIN_LEAD_MS, nowMs: now }),
      'GTD_LEAD_TIME',
    );
    expect(
      resolveGoodTillDate({ timeInForce: 'GTD', goodTillDate: now + GTD_MIN_LEAD_MS + 1500, nowMs: now }),
    ).toBe(now + GTD_MIN_LEAD_MS + 1000);
  });

  it('drops the millisecond part before checking the lead time', () => {
    // now + 600_999 truncates to now + 600_000, which is not strictly after the boundary.
    expectRule(
      () => resolveGoodTillDate({ timeInForce: 'GTD', goodTillDate: now + 600_999, nowMs: now }),
      'GTD_LEAD_TIME',
    );
  });

  it('rejects values above the 253402300799000 upper bound', () => {
    expectRule(
      () => resolveGoodTillDate({ timeInForce: 'GTD', goodTillDate: 253_402_300_800_000, nowMs: now }),
      'GTD_RANGE',
    );
  });
});

describe('validateTrailingCallbackRate', () => {
  it('accepts the documented 0.1–20 range and returns the canonical string', () => {
    expect(validateTrailingCallbackRate('0.1')).toBe('0.1');
    expect(validateTrailingCallbackRate('20')).toBe('20');
    expect(validateTrailingCallbackRate(5)).toBe('5');
    expect(validateTrailingCallbackRate('5.50')).toBe('5.5');
  });

  it('rejects values outside the range and malformed input', () => {
    expectRule(() => validateTrailingCallbackRate('20.01'), 'CALLBACK_RATE');
    expectRule(() => validateTrailingCallbackRate('0.05'), 'CALLBACK_RATE');
    expectRule(() => validateTrailingCallbackRate('abc'), 'INVALID_INPUT');
  });
});

describe('PositionModeGuard', () => {
  it('fails closed until the mode has been synced', () => {
    const guard = new PositionModeGuard();
    expectRule(() => guard.resolvePositionSide(undefined), 'POSITION_MODE_UNKNOWN');
  });

  it('requires LONG or SHORT in hedge mode', () => {
    const guard = new PositionModeGuard();
    guard.setDualSidePosition(true);
    expect(guard.resolvePositionSide('LONG')).toBe('LONG');
    expectRule(() => guard.resolvePositionSide('BOTH'), 'POSITION_SIDE_MISMATCH');
    expectRule(() => guard.resolvePositionSide(undefined), 'POSITION_SIDE_MISMATCH');
  });

  it('requires BOTH or no value in one-way mode, and normalizes omission to BOTH', () => {
    const guard = new PositionModeGuard();
    guard.setDualSidePosition(false);
    expect(guard.resolvePositionSide(undefined)).toBe('BOTH');
    expect(guard.resolvePositionSide('BOTH')).toBe('BOTH');
    expectRule(() => guard.resolvePositionSide('SHORT'), 'POSITION_SIDE_MISMATCH');
  });

  it('treats a stale mode as unknown', () => {
    let now = 0;
    const guard = new PositionModeGuard({ maxAgeMs: 1000, now: () => now });
    guard.setDualSidePosition(false);
    now = 1000;
    expect(guard.resolvePositionSide()).toBe('BOTH');
    now = 1001;
    expectRule(() => guard.resolvePositionSide(), 'POSITION_MODE_UNKNOWN');
  });
});
