import { describe, expect, it } from 'vitest';
import { floorToStep, roundToStep, symbolRulesFrom } from '../../src/types/filters.types.js';

type Symbol = Parameters<typeof symbolRulesFrom>[0];

function symbolWith(filters: Array<Record<string, unknown>>): Symbol {
  return {
    symbol: 'TESTUSDT',
    status: 'TRADING',
    baseAsset: 'TEST',
    quoteAsset: 'USDT',
    filters,
  } as unknown as Symbol;
}

describe('floorToStep / roundToStep regressions (exact, not float)', () => {
  it('does not round up a value just below a step boundary', () => {
    // Old implementation: Math.floor(0.0999999999 / 0.1 + 1e-9) === 1 → 0.1 (over-sized order)
    expect(floorToStep(0.0999999999, 0.1)).toBe(0);
  });

  it('keeps exact multiples intact', () => {
    expect(floorToStep(0.3, 0.1)).toBe(0.3);
    expect(floorToStep(0.7, 0.1)).toBe(0.7);
    expect(floorToStep(1.1, 0.1)).toBe(1.1);
  });

  it('rounds exact ties away from zero (1.005 is a tie on the 0.01 step)', () => {
    expect(roundToStep(1.005, 0.01)).toBe(1.01);
  });

  it('passes non-finite or non-positive steps through unchanged', () => {
    expect(floorToStep(Number.NaN, 0.1)).toBeNaN();
    expect(floorToStep(5.55, 0)).toBe(5.55);
    expect(roundToStep(5.55, -1)).toBe(5.55);
  });
});

describe('symbolRulesFrom: spot and futures notional, percent-by-side, iceberg parts', () => {
  it('reads spot MIN_NOTIONAL.minNotional (previously ignored, returned 0)', () => {
    const rules = symbolRulesFrom(
      symbolWith([{ filterType: 'MIN_NOTIONAL', minNotional: '5.00000000', applyToMarket: true, avgPriceMins: 5 }]),
    );
    expect(rules.minNotional).toBe(5);
    expect(rules.maxNotional).toBe(Number.POSITIVE_INFINITY);
  });

  it('reads the spot NOTIONAL filter min and max', () => {
    const rules = symbolRulesFrom(
      symbolWith([
        { filterType: 'NOTIONAL', minNotional: '10', maxNotional: '9000000', applyMinToMarket: false, applyMaxToMarket: false, avgPriceMins: 5 },
      ]),
    );
    expect(rules.minNotional).toBe(10);
    expect(rules.maxNotional).toBe(9_000_000);
  });

  it('still reads the USD-M MIN_NOTIONAL.notional field', () => {
    const rules = symbolRulesFrom(symbolWith([{ filterType: 'MIN_NOTIONAL', notional: '5' }]));
    expect(rules.minNotional).toBe(5);
  });

  it('parses PERCENT_PRICE_BY_SIDE multipliers as exact strings', () => {
    const rules = symbolRulesFrom(
      symbolWith([
        {
          filterType: 'PERCENT_PRICE_BY_SIDE',
          bidMultiplierUp: '1.2',
          bidMultiplierDown: '0.8',
          askMultiplierUp: '1.2',
          askMultiplierDown: '0.8',
          avgPriceMins: 5,
        },
      ]),
    );
    expect(rules.percentPriceBySide).toEqual({
      bidMultiplierUp: '1.2',
      bidMultiplierDown: '0.8',
      askMultiplierUp: '1.2',
      askMultiplierDown: '0.8',
      avgPriceMins: 5,
    });
  });

  it('parses ICEBERG_PARTS.limit and omits it when absent or invalid', () => {
    expect(symbolRulesFrom(symbolWith([{ filterType: 'ICEBERG_PARTS', limit: '10' }])).icebergPartsLimit).toBe(10);
    expect(symbolRulesFrom(symbolWith([])).icebergPartsLimit).toBeUndefined();
    expect(symbolRulesFrom(symbolWith([{ filterType: 'ICEBERG_PARTS', limit: 'x' }])).icebergPartsLimit).toBeUndefined();
  });

  it('leaves percentPriceBySide undefined when the filter is absent', () => {
    expect(symbolRulesFrom(symbolWith([])).percentPriceBySide).toBeUndefined();
  });
});
