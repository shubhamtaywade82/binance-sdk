import { describe, expect, it } from 'vitest';
import {
  addExact,
  cmpExact,
  divExact,
  exactEquals,
  floorToStepExact,
  formatExact,
  mulExact,
  mulStrings,
  parseExact,
  roundToStepExact,
  subExact,
  toExactString,
  toNumber,
} from '../../src/util/decimal.js';

describe('parseExact / toExactString', () => {
  it('round-trips decimal strings without float error', () => {
    expect(toExactString(parseExact('0.1'))).toBe('0.1');
    expect(toExactString(parseExact('60000.10'))).toBe('60000.1');
    expect(toExactString(parseExact('-0.00000001'))).toBe('-0.00000001');
    expect(toExactString(parseExact('1e-8'))).toBe('0.00000001');
    expect(toExactString(parseExact('0'))).toBe('0');
  });

  it('parses numbers via their shortest round-trip string', () => {
    expect(toExactString(parseExact(0.1))).toBe('0.1');
    expect(toExactString(parseExact(60000.06))).toBe('60000.06');
  });

  it('rejects garbage', () => {
    expect(() => parseExact('abc')).toThrow();
    expect(() => parseExact('')).toThrow();
    expect(() => parseExact(Number.NaN)).toThrow();
  });
});

describe('exact arithmetic', () => {
  it('0.1 + 0.2 === 0.3 exactly', () => {
    const sum = addExact(parseExact('0.1'), parseExact('0.2'));
    expect(toExactString(sum)).toBe('0.3');
    expect(toNumber(sum)).toBe(0.3);
  });

  it('multiplies without accumulating representation error', () => {
    expect(mulStrings('60000.1', '0.003')).toBe('180.0003');
    expect(mulStrings('0.1', '0.2')).toBe('0.02');
  });

  it('subtracts and compares exactly', () => {
    expect(toExactString(subExact(parseExact('0.3'), parseExact('0.1')))).toBe('0.2');
    expect(cmpExact(parseExact('0.30'), parseExact('0.3'))).toBe(0);
    expect(cmpExact(parseExact('0.30000001'), parseExact('0.3'))).toBe(1);
  });

  it('divides at fixed precision', () => {
    expect(toExactString(divExact(parseExact('1'), parseExact('3'), 4))).toBe('0.3333');
    expect(toExactString(divExact(parseExact('10'), parseExact('4')))).toBe('2.5');
  });

  it('mulExact handles signs', () => {
    const product = mulExact(parseExact('-2'), parseExact('0.5'));
    expect(toExactString(product)).toBe('-1');
  });

  it('exactEquals treats "0.10" and "0.1" as the same value', () => {
    expect(exactEquals('0.10', '0.1')).toBe(true);
    expect(exactEquals('0.1', '0.10000000001')).toBe(false);
  });
});

describe('step quantization (exact)', () => {
  it('floors quantities onto the step with zero accumulated error', () => {
    expect(floorToStepExact('0.0037', '0.001')).toBe('0.003');
    expect(floorToStepExact('1.9999', '0.001')).toBe('1.999');
    expect(floorToStepExact('0.3', '0.1')).toBe('0.3');
    expect(floorToStepExact('0.7', '0.1')).toBe('0.7');
    // A quantity exactly on the boundary never loses a step.
    expect(floorToStepExact('0.0019999', '0.001')).toBe('0.001');
  });

  it('floors on a sub-float step without losing the level', () => {
    // 0.00000012 with step 0.00000001 -> 0.00000012 (float math would wobble).
    expect(floorToStepExact('0.00000012', '0.00000001')).toBe('0.00000012');
  });

  it('rounds prices to the nearest tick', () => {
    expect(roundToStepExact('60000.04', '0.1')).toBe('60000');
    expect(roundToStepExact('60000.06', '0.1')).toBe('60000.1');
    expect(roundToStepExact('60000.05', '0.1')).toBe('60000.1'); // ties away from zero
  });

  it('handles padded exchange filter strings like "0.00100000"', () => {
    expect(floorToStepExact('0.0037', '0.00100000')).toBe('0.003');
    expect(roundToStepExact('60000.06', '0.10000000')).toBe('60000.1');
  });
});

describe('formatExact', () => {
  it('formats fixed precision exactly as Binance expects', () => {
    expect(formatExact('0.1', 3)).toBe('0.100');
    expect(formatExact(0.1 + 0.2, 3)).toBe('0.300');
    expect(formatExact('60000', 1)).toBe('60000.0');
    expect(formatExact('1.005', 2)).toBe('1.01'); // float would give 1.00
    expect(formatExact('-1.005', 2)).toBe('-1.01');
    expect(formatExact('5', 0)).toBe('5');
  });
});
