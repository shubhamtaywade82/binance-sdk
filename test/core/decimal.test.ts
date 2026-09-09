import { describe, expect, it } from 'vitest';
import { Decimal, dec, sum, vwap } from '../../src/core/decimal.js';

describe('Decimal', () => {
  it('parses strings, numbers, and bigints exactly', () => {
    expect(dec('0.1').toString()).toBe('0.1');
    expect(dec(0.5).toString()).toBe('0.5');
    expect(dec(42n).toString()).toBe('42');
    expect(dec('123.456').toString()).toBe('123.456');
    expect(dec('-0.000001').toString()).toBe('-0.000001');
    expect(dec('1e-8').toString()).toBe('0.00000001');
    expect(dec('1.5e3').toString()).toBe('1500');
  });

  it('0.1 + 0.2 === 0.3 exactly (IEEE-754 fails this)', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the bug this class exists to fix
    expect(dec('0.1').add('0.2').toString()).toBe('0.3');
    expect(dec('0.1').add('0.2').eq('0.3')).toBe(true);
  });

  it('multiplies and divides exactly', () => {
    // Classic float trap: 1.1 * 2.2 = 2.4200000000000004 in IEEE-754.
    expect(1.1 * 2.2).not.toBe(2.42);
    expect(dec('1.1').mul('2.2').toString()).toBe('2.42');
    expect(dec('1').div('3').round(8).toString()).toBe('0.33333333');
    expect(dec('10').div('4').toString()).toBe('2.5');
  });

  it('compares and classifies', () => {
    expect(dec('1.000000000000000001').gt('1')).toBe(true); // 18 dp: within scale
    expect(dec('-2').lt('-1')).toBe(true);
    expect(dec('5').gte(5)).toBe(true);
    expect(dec('0').isZero()).toBe(true);
    expect(dec('-3').abs().toString()).toBe('3');
    expect(dec('3').neg().toString()).toBe('-3');
  });

  it('rounds half-even and formats fixed', () => {
    expect(dec('2.5').round(0).toString()).toBe('2'); // banker's rounding
    expect(dec('3.5').round(0).toString()).toBe('4');
    expect(dec('1.005').round(2).toString()).toBe('1');
    expect(dec('123.4').toFixed(2)).toBe('123.40');
    expect(dec('0.999999').toFixed(4)).toBe('1.0000');
    expect(dec('-1.555').toFixed(2)).toBe('-1.56');
  });

  it('rejects invalid input', () => {
    expect(() => dec('abc')).toThrow();
    expect(() => dec('1.2.3')).toThrow();
    expect(() => dec(Number.NaN)).toThrow();
    expect(() => dec('1').div('0')).toThrow();
  });

  it('handles large values beyond 2^53 without precision loss', () => {
    const huge = dec('9007199254740993'); // 2^53 + 1: unrepresentable as float
    expect(huge.add('1').toString()).toBe('9007199254740994');
    expect(huge.mul('2').toString()).toBe('18014398509481986');
  });

  it('sum() aggregates exactly', () => {
    expect(sum(['0.1', '0.2', '0.3']).toString()).toBe('0.6');
    expect(sum([]).toString()).toBe('0');
  });

  it('vwap() is size-weighted and exact', () => {
    const result = vwap([
      { price: '100', quantity: '2' },
      { price: '110', quantity: '3' },
    ]);
    expect(result?.toString()).toBe('106'); // (200 + 330) / 5
    expect(vwap([{ price: '1', quantity: '0' }])).toBeNull();
  });
});
