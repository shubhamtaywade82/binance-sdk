import { describe, expect, it } from 'vitest';
import { classifyFromInputs, type RegimeInputs } from '../../src/agent/regime.js';

const base: RegimeInputs = {
  e20: 105, e50: 100,          // bullish EMA structure
  atrPct: 0.55,                // mid-high volatility
  fundingZ: 0.1,               // funding quiet
  oiSlope: 0.01,               // OI rising
};

describe('classifyFromInputs', () => {
  it('returns TREND_UP when EMA structure and OI agree', () => {
    expect(classifyFromInputs(base)).toBe('TREND_UP');
  });

  it('returns TREND_DOWN when EMA structure inverts', () => {
    expect(classifyFromInputs({ ...base, e20: 95, e50: 100 })).toBe('TREND_DOWN');
  });

  it('CHAOS wins over everything on extreme ATR', () => {
    expect(classifyFromInputs({ ...base, atrPct: 0.9 })).toBe('CHAOS');
  });

  it('CHAOS on funding beyond +2 sigma (crowd carry pain)', () => {
    expect(classifyFromInputs({ ...base, fundingZ: 2.5 })).toBe('CHAOS');
  });

  it('CHAOS on funding beyond -2 sigma', () => {
    expect(classifyFromInputs({ ...base, fundingZ: -2.5 })).toBe('CHAOS');
  });

  it('SQUEEZE when ATR is in its bottom 20%', () => {
    expect(classifyFromInputs({ ...base, atrPct: 0.15 })).toBe('SQUEEZE');
  });

  it('RANGE when ATR is moderate and OI is bleeding gently (no trend fuel)', () => {
    expect(classifyFromInputs({ ...base, atrPct: 0.5, oiSlope: -0.015 })).toBe('RANGE');
  });

  it('trend requires OI flat-or-rising; falling OI falls through', () => {
    // oiSlope -0.05: trend branch fails, RANGE rejects the slope -> CHAOS.
    expect(classifyFromInputs({ ...base, oiSlope: -0.05, atrPct: 0.55 })).toBe('CHAOS');
  });

  it('conflicting inputs fall through to CHAOS — refuse to guess', () => {
    // High ATR (above 0.6) is neither SQUEEZE nor RANGE, trend geometry fails
    // on OI, so the classifier must return CHAOS rather than guess.
    expect(classifyFromInputs({ ...base, atrPct: 0.75, oiSlope: -0.05 })).toBe('CHAOS');
  });
});
