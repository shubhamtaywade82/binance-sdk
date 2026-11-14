import { describe, expect, it } from 'vitest';
import { PreflightValidationError } from '../../src/errors/PreflightValidationError.js';
import { validatePeggedOrder } from '../../src/preflight/pegged.js';

describe('validatePeggedOrder', () => {
  it('returns {} when no peg fields are sent', () => {
    expect(validatePeggedOrder({})).toEqual({});
  });

  it('accepts the verified pegPriceType values and PRICE_LEVEL offset type', () => {
    expect(validatePeggedOrder({ pegPriceType: 'PRIMARY_PEG', pegOffsetType: 'PRICE_LEVEL', pegOffsetValue: 3 })).toEqual({
      pegPriceType: 'PRIMARY_PEG',
      pegOffsetType: 'PRICE_LEVEL',
      pegOffsetValue: 3,
    });
    expect(validatePeggedOrder({ pegPriceType: 'MARKET_PEG' }).pegPriceType).toBe('MARKET_PEG');
  });

  it('rejects an unknown pegPriceType and an unsupported offset type', () => {
    for (const bad of [
      () => validatePeggedOrder({ pegPriceType: 'LIMIT' }),
      () => validatePeggedOrder({ pegOffsetType: 'PERCENT' }),
    ]) {
      expect(bad).toThrow(PreflightValidationError);
    }
  });

  it('enforces an integer pegOffsetValue in [0, 100]', () => {
    expect(validatePeggedOrder({ pegOffsetValue: 100 }).pegOffsetValue).toBe(100);
    expect(validatePeggedOrder({ pegOffsetValue: 0 }).pegOffsetValue).toBe(0);
    expect(() => validatePeggedOrder({ pegOffsetValue: 101 })).toThrow(PreflightValidationError);
    expect(() => validatePeggedOrder({ pegOffsetValue: -1 })).toThrow(PreflightValidationError);
    expect(() => validatePeggedOrder({ pegOffsetValue: 1.5 })).toThrow(PreflightValidationError);
  });
});
