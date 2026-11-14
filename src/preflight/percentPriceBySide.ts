import {
  compareFixed,
  formatFixed,
  multiplyFixed,
  normalizeFixed,
  type FixedDecimal,
} from '../core/fixedpoint.js';
import { PreflightValidationError } from '../errors/PreflightValidationError.js';
import type { PercentPriceBySideRules } from '../types/filters.types.js';
import { parseInput } from './shared.js';

export interface PercentPriceBySideParams {
  side: 'BUY' | 'SELL';
  price: string | number;
  /**
   * Reference price for the band. Binance uses the average of previous trade
   * prices over `avgPriceMins` minutes, or the last price when `avgPriceMins`
   * is 0. The caller resolves it; this validator does not fetch it.
   */
  referencePrice: string | number;
  filter: Pick<
    PercentPriceBySideRules,
    'bidMultiplierUp' | 'bidMultiplierDown' | 'askMultiplierUp' | 'askMultiplierDown'
  >;
}

export interface PercentPriceBand {
  /** Inclusive lower bound, exact decimal string. */
  lower: string;
  /** Inclusive upper bound, exact decimal string. */
  upper: string;
}

/**
 * Band for one side. Verified against Binance's PERCENT_PRICE_BY_SIDE definition:
 * - BUY:  reference × bidMultiplierDown ≤ price ≤ reference × bidMultiplierUp
 * - SELL: reference × askMultiplierDown ≤ price ≤ reference × askMultiplierUp
 */
export function percentPriceBandFor(params: PercentPriceBySideParams): PercentPriceBand {
  const reference = parseInput(params.referencePrice, 'referencePrice');
  if (reference.units <= 0n) {
    throw new PreflightValidationError('INVALID_INPUT', 'referencePrice must be > 0', {
      referencePrice: String(params.referencePrice),
    });
  }
  const isBuy = params.side === 'BUY';
  const upMultiplier = parseInput(
    isBuy ? params.filter.bidMultiplierUp : params.filter.askMultiplierUp,
    `${isBuy ? 'bidMultiplierUp' : 'askMultiplierUp'}`,
  );
  const downMultiplier = parseInput(
    isBuy ? params.filter.bidMultiplierDown : params.filter.askMultiplierDown,
    `${isBuy ? 'bidMultiplierDown' : 'askMultiplierDown'}`,
  );
  const upper = normalizeFixed(multiplyFixed(reference, upMultiplier));
  const lower = normalizeFixed(multiplyFixed(reference, downMultiplier));
  return {
    lower: formatFixed(lower, lower.scale),
    upper: formatFixed(upper, upper.scale),
  };
}

/** Throws PreflightValidationError(PERCENT_PRICE_BY_SIDE) when the price is outside the band. */
export function validatePercentPriceBySide(params: PercentPriceBySideParams): PercentPriceBand {
  const band = percentPriceBandFor(params);
  const price: FixedDecimal = parseInput(params.price, 'price');
  const lower = parseInput(band.lower, 'lower');
  const upper = parseInput(band.upper, 'upper');
  if (compareFixed(price, lower) < 0 || compareFixed(price, upper) > 0) {
    throw new PreflightValidationError(
      'PERCENT_PRICE_BY_SIDE',
      `${params.side} price ${String(params.price)} is outside [${band.lower}, ${band.upper}] ` +
        `around reference ${String(params.referencePrice)}`,
      { side: params.side, price: String(params.price), ...band },
    );
  }
  return band;
}
