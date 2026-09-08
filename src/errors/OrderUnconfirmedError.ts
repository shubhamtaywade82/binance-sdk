import { BinanceError } from './BinanceError.js';

/**
 * Thrown by {@link OrderExecution} when an order submission could not be
 * confirmed as either placed or not-placed: the submission failed ambiguously
 * AND the reconciliation query could not determine the order's state.
 *
 * The order may or may not exist on the exchange. The error carries the
 * clientOrderId so the caller can reconcile later (poll getOrder with
 * origClientOrderId, or inspect user-stream ORDER_TRADE_UPDATE events) before
 * retrying — never blindly.
 */
export class OrderUnconfirmedError extends BinanceError {
  readonly symbol: string;
  readonly clientOrderId: string;
  readonly attempts: unknown[];
  readonly cause?: unknown;

  constructor(
    symbol: string,
    clientOrderId: string,
    message: string,
    attempts: unknown[] = [],
    cause?: unknown,
  ) {
    super(
      `Order submission unconfirmed for ${symbol} (clientOrderId=${clientOrderId}): ${message}. ` +
        'The order may or may not exist on the exchange — reconcile by clientOrderId before retrying.',
    );
    this.name = 'OrderUnconfirmedError';
    this.symbol = symbol;
    this.clientOrderId = clientOrderId;
    this.attempts = attempts;
    this.cause = cause;
  }
}
