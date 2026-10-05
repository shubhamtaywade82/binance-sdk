import { BinanceError } from './BinanceError.js';

/**
 * Raised when an order operation's outcome cannot be determined from the
 * server response — the canonical 5XX "UNKNOWN execution" trap the audit
 * flags for {@link https://binance-docs.github.io/apidocs/spot/en/}.
 *
 * Binance documents HTTP 5XX as **internal errors; the issue is on Binance's
 * side. It is important to NOT treat this as a failure operation; the
 * execution status is UNKNOWN and could have been a success.** Naively
 * retrying a placeOrder after a 500/502/504 therefore risks an accidental
 * double fill and unmanaged margin exposure.
 *
 * Neither the official `binance-connector-js` nor community libraries
 * distinguish this state — they reject with a generic HTTP error and lose
 * the order context. This error class preserves the client order id and
 * symbol so the caller (or the SDK's {@link ExecutionManager.reconcile})
 * can re-query REST before deciding whether resubmission is safe.
 *
 * Recommended usage:
 *
 * ```ts
 * try {
 *   await client.futures.trading.createOrder({ ... });
 * } catch (err) {
 *   if (err instanceof BinanceUnknownExecutionError) {
 *     // Do NOT blindly retry. Reconcile via GET /fapi/v1/order?origClientOrderId=...
 *     const order = await client.futures.trading.getOrder({ ... });
 *     // decide based on order.status
 *   }
 * }
 * ```
 *
 * The companion helper {@link isUnknownExecution} recognises the upstream
 * signals (5XX HTTP status, ECONNRESET, TimeoutError) so callers can wrap
 * any transport error before the SDK ever sees it.
 */
export class BinanceUnknownExecutionError extends BinanceError {
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly originalError: unknown;

  constructor(
    clientOrderId: string,
    symbol: string,
    originalError: unknown,
    message?: string,
  ) {
    const detail = message ?? `Order status UNKNOWN for ${symbol} (clientOrderId=${clientOrderId}). Do NOT blindly retry.`;
    super(detail);
    this.name = 'BinanceUnknownExecutionError';
    this.clientOrderId = clientOrderId;
    this.symbol = symbol;
    this.originalError = originalError;
  }
}

/**
 * Recognise the upstream signals that mark an order operation as having
 * an indeterminate outcome — HTTP 5XX, ECONNRESET, or a timeout — and
 * wrap them in a {@link BinanceUnknownExecutionError} so callers can
 * reconcile by client order id rather than blind-retry.
 *
 * Returns `null` when the error is a definitive rejection (-2xxx) or a
 * recognised safe-to-retry condition (-2013, -1003, -1021, 429, 418).
 */
export function classifyUnknownExecution(
  err: unknown,
  context: { clientOrderId: string; symbol: string },
): BinanceUnknownExecutionError | null {
  if (err === null || err === undefined) return null;

  // Already classified.
  if (err instanceof BinanceUnknownExecutionError) return err;

  // Binance API errors carry the canonical code + http status. 5XX on a
  // mutating request is the audit's UNKNOWN trap; everything else either
  // proves the order never reached the engine (-2013 / -2011) or is a
  // definitive rejection (-2xxx) — neither is "unknown".
  if (typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    const status = (err as { status: number }).status;
    if (status >= 500 && status < 600) {
      return new BinanceUnknownExecutionError(
        context.clientOrderId,
        context.symbol,
        err,
      );
    }
    return null;
  }

  // Network-layer ambiguity: socket hang-up, timeout, dropped connection.
  // The request may have reached the engine; resubmitting risks a double.
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { code?: string })?.code ?? '';
  if (
    name === 'TimeoutError' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    name === 'NetworkError'
  ) {
    return new BinanceUnknownExecutionError(
      context.clientOrderId,
      context.symbol,
      err,
    );
  }

  return null;
}
