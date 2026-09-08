import { BinanceError } from './BinanceError.js';

export type PolicyRule =
  | 'readOnly'
  | 'symbolNotAllowed'
  | 'maxNotionalPerOrder'
  | 'notionalUndeterminable'
  | 'withdrawalsBlocked'
  | 'transfersBlocked'
  | 'blockedPath'
  | 'circuitBreaker'
  | 'maxOpenOrders'
  | 'maxOrderRate'
  | 'maxLeverage'
  | 'maxPositionNotional'
  | 'maxDailyLoss';

/**
 * Thrown when a request is refused by the client's own {@link TradingPolicy} — before it
 * ever reaches Binance. Distinct from BinanceApiError, which reports an exchange rejection.
 */
export class PolicyViolationError extends BinanceError {
  readonly rule: PolicyRule;
  readonly method: string;
  readonly endpoint: string;
  readonly details?: Record<string, unknown>;

  constructor(
    rule: PolicyRule,
    message: string,
    method: string,
    endpoint: string,
    details?: Record<string, unknown>,
  ) {
    super(`Blocked by trading policy (${rule}): ${message} [${method} ${endpoint}]`);
    this.name = 'PolicyViolationError';
    this.rule = rule;
    this.method = method;
    this.endpoint = endpoint;
    this.details = details;
  }
}
