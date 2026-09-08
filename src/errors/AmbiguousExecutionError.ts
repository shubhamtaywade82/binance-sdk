import { BinanceError } from './BinanceError.js';

/**
 * Thrown when a mutating request (POST/PUT/DELETE) fails with an ambiguous
 * outcome — a network-level failure or a 5xx where Binance may have already
 * executed the request before the response was lost.
 *
 * A generic retry here is exactly how duplicate orders happen: the original
 * POST /fapi/v1/order lands, the response is lost, the client retries, and a
 * second order is created. The HTTP layer therefore refuses to blind-retry
 * ambiguous mutations and raises this instead, carrying the original params —
 * including `clientOrderId`/`newClientOrderId` — so a reconciliation layer
 * (see OrderExecution) or the caller can query the exchange and determine
 * the true state before deciding whether a retry is semantically safe.
 */
export class AmbiguousExecutionError extends BinanceError {
  readonly method: string;
  readonly endpoint: string;
  readonly params: Record<string, unknown>;
  /** The client-assigned order id, when the request carried one. */
  readonly clientOrderId?: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    method: string,
    endpoint: string,
    params: Record<string, unknown> = {},
    cause?: unknown,
  ) {
    super(`${message} [${method} ${endpoint}] — outcome unknown, reconcile before retrying`);
    this.name = 'AmbiguousExecutionError';
    this.method = method;
    this.endpoint = endpoint;
    this.params = params;
    const id = (params.clientOrderId ?? params.newClientOrderId ?? params.origClientOrderId) as
      | string
      | undefined;
    this.clientOrderId = typeof id === 'string' ? id : undefined;
    this.cause = cause;
  }
}
