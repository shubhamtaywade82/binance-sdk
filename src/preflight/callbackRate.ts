import { compareFixed, formatFixed, normalizeFixed, parseFixed } from '../core/fixedpoint.js';
import { PreflightValidationError } from '../errors/PreflightValidationError.js';
import { parseInput } from './shared.js';

/** Trailing callbackRate bounds on the algo endpoint (POST /fapi/v1/algoOrder, verified: min 0.1, max 20). */
export const TRAILING_CALLBACK_RATE_MIN = '0.1';
export const TRAILING_CALLBACK_RATE_MAX = '20';

/**
 * Validate a TRAILING_STOP_MARKET callbackRate (percent). Returns the canonical
 * decimal string to send. Out-of-range values are rejected locally, so they
 * never reach the exchange.
 */
export function validateTrailingCallbackRate(rate: string | number): string {
  const value = parseInput(rate, 'callbackRate');
  if (
    compareFixed(value, parseFixed(TRAILING_CALLBACK_RATE_MIN)) < 0 ||
    compareFixed(value, parseFixed(TRAILING_CALLBACK_RATE_MAX)) > 0
  ) {
    throw new PreflightValidationError(
      'CALLBACK_RATE',
      `callbackRate ${String(rate)} is outside [${TRAILING_CALLBACK_RATE_MIN}, ${TRAILING_CALLBACK_RATE_MAX}]`,
      { callbackRate: String(rate) },
    );
  }
  const canonical = normalizeFixed(value);
  return formatFixed(canonical, canonical.scale);
}
