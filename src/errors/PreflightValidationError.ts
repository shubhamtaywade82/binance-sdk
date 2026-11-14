import { BinanceError } from './BinanceError.js';

/**
 * Exchange-filter and order-shape rules enforced locally before a request is
 * sent. Each value names one check, so callers can branch on it.
 */
export type PreflightRule =
  | 'PERCENT_PRICE_BY_SIDE'
  | 'ICEBERG_QTY'
  | 'ICEBERG_LOT'
  | 'ICEBERG_PARTS'
  | 'GTD_REQUIRED'
  | 'GTD_LEAD_TIME'
  | 'GTD_RANGE'
  | 'CALLBACK_RATE'
  | 'POSITION_MODE_UNKNOWN'
  | 'POSITION_SIDE_MISMATCH'
  | 'BATCH_SIZE'
  | 'PEGGED_ORDER'
  | 'INVALID_INPUT';

/**
 * Thrown when an order fails a pre-flight rule. The request was never sent.
 * This is distinct from {@link PolicyViolationError} (the client's own risk
 * policy) and from BinanceApiError (the exchange rejected the request).
 */
export class PreflightValidationError extends BinanceError {
  readonly rule: PreflightRule;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(rule: PreflightRule, message: string, details?: Readonly<Record<string, unknown>>) {
    super(`Pre-flight validation failed (${rule}): ${message}`);
    this.name = 'PreflightValidationError';
    this.rule = rule;
    this.details = details;
  }
}
