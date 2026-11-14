import { compareFixed, formatFixed, normalizeFixed, parseFixed } from '../core/fixedpoint.js';
import { PreflightValidationError } from '../errors/PreflightValidationError.js';
import { parseInput } from './shared.js';

/**
 * Trailing callbackRate (percent) bounds differ by endpoint. Both are verified:
 * - algo endpoint (POST /fapi/v1/algoOrder, TRAILING_STOP_MARKET): min 0.1, max 20
 * - regular order endpoint (POST /fapi/v1/order), vendored Postman: min 0.1, max 10
 *
 * The docs disagree only on the maximum, so the check is per route. The default is
 * the algo route, because TRAILING_STOP_MARKET is documented on that endpoint.
 */
export const TRAILING_CALLBACK_RATE_MIN = '0.1';
export const TRAILING_CALLBACK_RATE_MAX = '20';
export const TRAILING_CALLBACK_RATE_MAX_ORDER_ENDPOINT = '10';

export type CallbackRoute = 'algo' | 'order';

/**
 * Validate a TRAILING_STOP_MARKET callbackRate. Returns the canonical decimal string
 * to send. Out-of-range values are rejected locally, so they never reach the exchange.
 */
export function validateTrailingCallbackRate(rate: string | number, route: CallbackRoute = 'algo'): string {
  const value = parseInput(rate, 'callbackRate');
  const max = route === 'algo' ? TRAILING_CALLBACK_RATE_MAX : TRAILING_CALLBACK_RATE_MAX_ORDER_ENDPOINT;
  if (
    compareFixed(value, parseFixed(TRAILING_CALLBACK_RATE_MIN)) < 0 ||
    compareFixed(value, parseFixed(max)) > 0
  ) {
    throw new PreflightValidationError(
      'CALLBACK_RATE',
      `callbackRate ${String(rate)} is outside [${TRAILING_CALLBACK_RATE_MIN}, ${max}] on the ${route} endpoint`,
      { callbackRate: String(rate), route },
    );
  }
  const canonical = normalizeFixed(value);
  return formatFixed(canonical, canonical.scale);
}
