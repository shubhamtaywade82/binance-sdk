import { parseFixed, type FixedDecimal } from '../core/fixedpoint.js';
import { PreflightValidationError } from '../errors/PreflightValidationError.js';

/**
 * Parse a caller-supplied decimal for a validator. Malformed input is a
 * PreflightValidationError (INVALID_INPUT), never a silent coercion.
 */
export function parseInput(value: string | number, label: string): FixedDecimal {
  try {
    return parseFixed(value);
  } catch (error) {
    throw new PreflightValidationError(
      'INVALID_INPUT',
      `${label} is not a valid decimal: ${error instanceof Error ? error.message : String(error)}`,
      { label, value: String(value) },
    );
  }
}
