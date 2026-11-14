import { describe, expect, it } from 'vitest';
import {
  DeterministicPositionAverager,
  IcebergSliceMatcher,
  commissionExact,
  divideRounded,
  fundingPaymentExact,
  settleFunding,
} from '../../src/paper/exact.js';
import { parseFixed } from '../../src/core/fixedpoint.js';

describe('commissionExact', () => {
  it('computes price × quantity × bps / 10000 exactly', () => {
    expect(commissionExact({ price: '60000', quantity: '0.1', bps: '5' })).toBe('3');
    expect(commissionExact({ price: '0.1', quantity: '0.2', bps: '2' })).toBe('0.000004'); // 0.02 × 2 / 10000
  });

  it('rejects a negative fee schedule', () => {
    expect(() => commissionExact({ price: '1', quantity: '1', bps: '-1' })).toThrow(RangeError);
  });
});

describe('divideRounded', () => {
  it('rounds half away from zero at the requested scale', () => {
    expect(divideRounded(parseFixed('1'), parseFixed('3'), 8)).toEqual({ units: 33333333n, scale: 8 });
    expect(divideRounded(parseFixed('2'), parseFixed('3'), 8)).toEqual({ units: 66666667n, scale: 8 });
    expect(divideRounded(parseFixed('-1'), parseFixed('3'), 2)).toEqual({ units: -33n, scale: 2 });
    expect(() => divideRounded(parseFixed('1'), parseFixed('0'), 2)).toThrow(RangeError);
  });
});

describe('DeterministicPositionAverager', () => {
  it('computes a weighted average entry exactly (1@100 + 3@200 = 175)', () => {
    const p = new DeterministicPositionAverager();
    p.apply({ side: 'BUY', price: '100', quantity: '1' });
    const pos = p.apply({ side: 'BUY', price: '200', quantity: '3' });
    expect(pos).toEqual({ quantity: '4', entryPrice: '175', realizedPnl: '0' });
  });

  it('gives the same entry regardless of fill order', () => {
    const a = new DeterministicPositionAverager();
    a.apply({ side: 'BUY', price: '100', quantity: '1' });
    a.apply({ side: 'BUY', price: '200', quantity: '3' });
    const b = new DeterministicPositionAverager();
    b.apply({ side: 'BUY', price: '200', quantity: '3' });
    b.apply({ side: 'BUY', price: '100', quantity: '1' });
    expect(a.snapshot().entryPrice).toBe(b.snapshot().entryPrice);
  });

  it('books realized PnL on reduce, and flips close-then-open', () => {
    const p = new DeterministicPositionAverager();
    p.apply({ side: 'BUY', price: '100', quantity: '1' });
    p.apply({ side: 'BUY', price: '200', quantity: '3' }); // 4 @ 175
    expect(p.apply({ side: 'SELL', price: '210', quantity: '2' })).toEqual({
      quantity: '2',
      entryPrice: '175',
      realizedPnl: '70',
    });
    // Sell 4 @ 170: close 2 (−10), then open 2 short at 170.
    expect(p.apply({ side: 'SELL', price: '170', quantity: '4' })).toEqual({
      quantity: '-2',
      entryPrice: '170',
      realizedPnl: '60',
    });
  });

  it('clears the entry when flat', () => {
    const p = new DeterministicPositionAverager();
    p.apply({ side: 'BUY', price: '10', quantity: '1' });
    expect(p.apply({ side: 'SELL', price: '12', quantity: '1' })).toEqual({
      quantity: '0',
      entryPrice: undefined,
      realizedPnl: '2',
    });
  });

  it('rejects non-positive fills and an invalid entry scale', () => {
    const p = new DeterministicPositionAverager();
    expect(() => p.apply({ side: 'BUY', price: '0', quantity: '1' })).toThrow(RangeError);
    expect(() => new DeterministicPositionAverager({ entryScale: 21 })).toThrow(RangeError);
  });
});

describe('funding settlement', () => {
  it('charges a long when the rate is positive (sign convention)', () => {
    expect(fundingPaymentExact({ signedQuantity: '2', markPrice: '60000', fundingRate: '0.0001' })).toBe('-12');
    expect(fundingPaymentExact({ signedQuantity: '-2', markPrice: '60000', fundingRate: '0.0001' })).toBe('12');
  });

  it('sums exact payments across settlements', () => {
    expect(
      settleFunding({
        signedQuantity: '2',
        settlements: [
          { markPrice: '60000', fundingRate: '0.0001' },
          { markPrice: '61000', fundingRate: '-0.0002' },
        ],
      }),
    ).toBe('12.4'); // −12 + (−(2 × 61000 × −0.0002) = +24.4)
  });
});

describe('IcebergSliceMatcher', () => {
  it('exposes one slice, refreshes it from the hidden remainder, and drains exactly', () => {
    const m = new IcebergSliceMatcher({ totalQuantity: '10', icebergQuantity: '3' });
    expect(m.visible).toBe('3');
    expect(m.fill('2')).toBe('2');
    expect(m.visible).toBe('1');
    expect(m.fill('2')).toBe('2'); // consumes the last 1, refreshes to 3, takes 1 more
    expect(m.visible).toBe('2');
    expect(m.remaining).toBe('6');
    expect(m.refreshes).toBe(1);
    expect(m.fill('100')).toBe('6');
    expect(m.isComplete).toBe(true);
  });

  it('validates the iceberg size against the total', () => {
    expect(() => new IcebergSliceMatcher({ totalQuantity: '1', icebergQuantity: '2' })).toThrow(RangeError);
    expect(() => new IcebergSliceMatcher({ totalQuantity: '1', icebergQuantity: '0' })).toThrow(RangeError);
  });
});
