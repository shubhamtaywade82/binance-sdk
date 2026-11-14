import { describe, expect, it } from 'vitest';
import {
  ceilRatio,
  compareDecimals,
  compareFixed,
  floorDiv,
  ceilDiv,
  floorToStepString,
  formatFixed,
  isOnStep,
  multiplyDecimals,
  parseFixed,
  quantizeFloor,
  quantizeRound,
  roundToStepString,
} from '../../src/core/fixedpoint.js';

describe('parseFixed', () => {
  it('parses plain, signed, and exponent notation exactly', () => {
    expect(parseFixed('1.50')).toEqual({ units: 150n, scale: 2 });
    expect(parseFixed('-0.25')).toEqual({ units: -25n, scale: 2 });
    expect(parseFixed('1e-7')).toEqual({ units: 1n, scale: 7 });
    expect(parseFixed('1.5e2')).toEqual({ units: 150n, scale: 0 });
    expect(parseFixed(7n)).toEqual({ units: 7n, scale: 0 });
  });

  it('converts numbers through their shortest round-trip string, not the binary value', () => {
    expect(parseFixed(0.1)).toEqual({ units: 1n, scale: 1 });
    expect(parseFixed(1e-7)).toEqual({ units: 1n, scale: 7 });
    expect(parseFixed(1e21)).toEqual({ units: 1000000000000000000000n, scale: 0 });
  });

  it('rejects malformed, non-finite, and over-precise input instead of guessing', () => {
    expect(() => parseFixed('abc')).toThrow(RangeError);
    expect(() => parseFixed('')).toThrow(RangeError);
    expect(() => parseFixed('1..2')).toThrow(RangeError);
    expect(() => parseFixed('1e')).toThrow(RangeError);
    expect(() => parseFixed('.')).toThrow(RangeError);
    expect(() => parseFixed(Number.NaN)).toThrow(RangeError);
    expect(() => parseFixed(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => parseFixed(`0.${'1'.repeat(45)}`)).toThrow(RangeError);
    expect(() => parseFixed('1'.repeat(200))).toThrow(RangeError);
  });

  it('drops redundant trailing zeros before applying the scale cap', () => {
    expect(parseFixed(`0.${'1'}${'0'.repeat(45)}`).scale).toBeLessThanOrEqual(40);
  });
});

describe('exact arithmetic', () => {
  it('avoids the binary-float errors that cause -1013 filter failures', () => {
    // Float: 0.3 / 0.1 === 2.9999999999999996, 0.1 * 0.2 === 0.020000000000000004
    expect(floorToStepString('0.3', '0.1')).toBe('0.3');
    expect(multiplyDecimals('0.1', '0.2')).toBe('0.02');
    expect(ceilRatio(parseFixed('1.1'), parseFixed('0.1'))).toBe(11n);
  });

  it('compares exactly across scales', () => {
    expect(compareDecimals('0.30', '0.3')).toBe(0);
    expect(compareDecimals('0.1', '0.10000000000000001')).toBe(-1);
    expect(compareFixed(parseFixed('2'), parseFixed('1.999'))).toBe(1);
  });

  it('floor and ceil division round in the right direction for negatives', () => {
    expect(floorDiv(-105n, 10n)).toBe(-11n);
    expect(floorDiv(105n, 10n)).toBe(10n);
    expect(ceilDiv(-105n, 10n)).toBe(-10n);
    expect(ceilDiv(105n, 10n)).toBe(11n);
    expect(() => floorDiv(1n, 0n)).toThrow(RangeError);
  });
});

describe('quantizers', () => {
  it('floor never rounds up, including values just below a boundary', () => {
    expect(floorToStepString('0.0999999999', '0.1')).toBe('0.0');
    expect(floorToStepString('0.0037', '0.001')).toBe('0.003');
    expect(floorToStepString('1.9999', '0.001')).toBe('1.999');
  });

  it('floor on negatives rounds toward negative infinity', () => {
    expect(floorToStepString('-1.05', '0.1')).toBe('-1.1');
  });

  it('rounds to nearest with ties away from zero', () => {
    expect(roundToStepString('60000.04', '0.1')).toBe('60000.0');
    expect(roundToStepString('60000.06', '0.1')).toBe('60000.1');
    expect(roundToStepString('60000.05', '0.1')).toBe('60000.1');
    expect(roundToStepString('-60000.05', '0.1')).toBe('-60000.1');
  });

  it('renders at the step precision, padding zeros', () => {
    expect(floorToStepString('5', '0.00100000')).toBe('5.000');
    expect(roundToStepString('100', '1')).toBe('100');
  });

  it('quantizeFloor and quantizeRound reject a non-positive step', () => {
    expect(() => quantizeFloor(parseFixed('1'), parseFixed('0'))).toThrow(RangeError);
    expect(() => quantizeRound(parseFixed('1'), parseFixed('-0.1'))).toThrow(RangeError);
  });

  it('isOnStep is exact', () => {
    expect(isOnStep(parseFixed('0.3'), parseFixed('0.1'))).toBe(true);
    expect(isOnStep(parseFixed('0.35'), parseFixed('0.1'))).toBe(false);
    expect(isOnStep(parseFixed('1.1'), parseFixed('0.1'))).toBe(true);
  });
});

describe('formatFixed', () => {
  it('pads and never prints negative zero', () => {
    expect(formatFixed({ units: 0n, scale: 2 })).toBe('0.00');
    expect(formatFixed({ units: -5n, scale: 2 })).toBe('-0.05');
    expect(formatFixed({ units: 5n, scale: 0 }, 3)).toBe('5.000');
    expect(formatFixed({ units: 7n, scale: 0 }, 0)).toBe('7');
  });

  it('rejects an out-of-range decimals argument', () => {
    expect(() => formatFixed({ units: 1n, scale: 0 }, -1)).toThrow(RangeError);
    expect(() => formatFixed({ units: 1n, scale: 0 }, 41)).toThrow(RangeError);
  });
});
