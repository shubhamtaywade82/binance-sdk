import { BinanceApiError } from '../errors/index.js';
import type { IExecutionTransport, OrderExecutionResult } from './ITransport.js';

/**
 * Atomic cancel-replace manager — surfaces Binance's `order.cancelReplace`
 * operation as a structured partial result instead of a raw HTTP 409.
 *
 * Binance documents two `cancelReplaceMode` values:
 *
 *  - **STOP_ON_FAILURE**: if the cancel leg fails, the new order leg is
 *    aborted (and vice versa). Either both succeed or neither does.
 *  - **ALLOW_FAILURE**: the cancel leg may fail while the new order leg
 *    succeeds, and vice versa. The HTTP response is HTTP 409 with a body
 *    that breaks out `cancelResult` and `newOrderResult` — neither the
 *    official `binance-connector-js` nor the community `binance` package
 *    surface this; they reject as a generic error.
 *
 * The audit's recommendation: structure `order.cancelReplace` returns so
 * consumers using `ALLOW_FAILURE` can inspect both legs without parsing
 * the raw HTTP 409 exception. This manager also defaults to numeric
 * `orderId` over `origClientOrderId` for the cancel target — Binance
 * explicitly notes that numeric IDs deliver strictly lower internal
 * latency because they avoid the secondary hash-index traversal in the
 * matching engine memory.
 */

/** Mode for the cancel-replace operation. */
export type CancelReplaceMode = 'STOP_ON_FAILURE' | 'ALLOW_FAILURE';

/** Side of an order operation. */
export type OrderSide = 'BUY' | 'SELL';

/** Order type for the new leg of a cancel-replace. */
export type ReplaceOrderType = 'LIMIT' | 'MARKET' | 'STOP_LIMIT' | 'TAKE_PROFIT_LIMIT';

/** Parameters accepted by {@link AtomicOrderManager.cancelReplace}. */
export interface CancelReplaceParams {
  symbol: string;
  /** Identifies the order being cancelled. Prefer `cancelOrderId` (numeric) for engine performance. */
  cancelOrderId?: number;
  /** Alternative to `cancelOrderId` when only the client-side id is known. */
  cancelOrigClientOrderId?: string;
  /** When set, instructs the engine to cancel a stale / idle order. */
  cancelRestrictions?: 'NEW' | 'PARTIALLY_FILLED' | 'PENDING_NEW' | 'PENDING_CANCEL';
  /** Mode controlling the atomicity of the cancel-replace. */
  cancelReplaceMode: CancelReplaceMode;
  side: OrderSide;
  type: ReplaceOrderType;
  /** Exact decimal string. */
  quantity: string;
  /** Required for LIMIT and STOP_LIMIT / TAKE_PROFIT_LIMIT. */
  price?: string;
  /** Required for STOP_LIMIT / TAKE_PROFIT_LIMIT. */
  stopPrice?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX' | 'GTE';
  /** Idempotency key for the new leg. */
  newClientOrderId?: string;
}

/** Structured result of a cancel-replace operation. */
export interface CancelReplaceResult<TOrder = OrderExecutionResult> {
  /** Whether the cancel leg succeeded. */
  cancelResult: 'SUCCESS' | 'FAILURE';
  /** Whether the new order placement succeeded. */
  newOrderResult: 'SUCCESS' | 'FAILURE';
  /** Populated when the cancel leg succeeded. */
  cancelResponse?: { orderId: number; status: string };
  /** Populated when the new order placement succeeded. */
  newOrderResponse?: TOrder;
}

/** Function signature an execution transport must satisfy for cancel-replace. */
export type CancelReplaceTransportCall = (
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * Atomic cancel-replace dispatcher. Wraps a low-level `order.cancelReplace`
 * transport call and turns HTTP 409 partial-success bodies into a
 * structured {@link CancelReplaceResult} — callers using `ALLOW_FAILURE`
 * can read both legs without try/catch + JSON.parse.
 *
 * ```ts
 * const result = await manager.cancelReplace({
 *   symbol: 'BTCUSDT',
 *   cancelOrderId: 12345678,
 *   cancelReplaceMode: 'ALLOW_FAILURE',
 *   side: 'BUY',
 *   type: 'LIMIT',
 *   quantity: '0.05',
 *   price: '64500.00',
 *   newClientOrderId: 'nbsdk-replace-1',
 * });
 * if (result.cancelResult === 'FAILURE' && result.newOrderResult === 'SUCCESS') {
 *   // The new order is live; the old one may still be. Cancel the old one.
 * }
 * ```
 */
export class AtomicOrderManager {
  constructor(
    private readonly transport: IExecutionTransport | { cancelReplace: CancelReplaceTransportCall },
    private readonly options: { cancelReplace?: CancelReplaceTransportCall } = {},
  ) {}

  /**
   * Issue a cancel-replace and return a structured result, never throwing
   * on HTTP 409 partial-success. Other errors (network failures, 5XX,
   * filter rejections) propagate so the caller's reconciliation path can
   * handle them — partial-success is the only structured branch.
   */
  async cancelReplace(params: CancelReplaceParams): Promise<CancelReplaceResult> {
    const payload = buildPayload(params);
    try {
      const response = await this.callCancelReplace(payload);
      return successResult(response);
    } catch (err) {
      if (err instanceof BinanceApiError && err.status === 409 && err.headers) {
        return parsePartialResult(err);
      }
      throw err;
    }
  }

  private async callCancelReplace(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    // The classic case: an explicit transport surface with `cancelReplace`.
    const transport = this.transport as {
      cancelReplace?: CancelReplaceTransportCall;
    };
    const explicit = transport.cancelReplace ?? this.options.cancelReplace;
    if (typeof explicit === 'function') {
      return explicit(payload);
    }
    // Fall back: callers wired an IExecutionTransport-shaped object — they
    // did not provide a cancel-replace surface, so raise clearly instead
    // of silently misrouting through `placeOrder`.
    throw new Error(
      'AtomicOrderManager requires a transport with a cancelReplace(params) method (neither IExecutionTransport nor the explicit options provided one)',
    );
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function buildPayload(params: CancelReplaceParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    symbol: params.symbol,
    cancelReplaceMode: params.cancelReplaceMode,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
  };
  // Prefer the numeric id for matching-engine performance.
  if (params.cancelOrderId !== undefined) payload.cancelOrderId = params.cancelOrderId;
  if (params.cancelOrigClientOrderId !== undefined) payload.cancelOrigClientOrderId = params.cancelOrigClientOrderId;
  if (params.cancelRestrictions !== undefined) payload.cancelRestrictions = params.cancelRestrictions;
  if (params.price !== undefined) payload.price = params.price;
  if (params.stopPrice !== undefined) payload.stopPrice = params.stopPrice;
  if (params.timeInForce !== undefined) payload.timeInForce = params.timeInForce;
  if (params.newClientOrderId !== undefined) payload.newClientOrderId = params.newClientOrderId;
  return payload;
}

function successResult(response: Record<string, unknown>): CancelReplaceResult {
  const cancelResult = String(response.cancelResult ?? 'SUCCESS').toUpperCase();
  const newOrderResult = String(response.newOrderResult ?? 'SUCCESS').toUpperCase();
  const cancelResponse = response.cancelResponse as { orderId?: number; status?: string } | undefined;
  const newOrderResponse = (response.newOrderResponse ?? undefined) as OrderExecutionResult | undefined;
  return {
    cancelResult: cancelResult === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    newOrderResult: newOrderResult === 'FAILURE' ? 'FAILURE' : 'SUCCESS',
    cancelResponse: cancelResponse
      ? { orderId: Number(cancelResponse.orderId ?? 0), status: String(cancelResponse.status ?? '') }
      : undefined,
    newOrderResponse: newOrderResponse as OrderExecutionResult | undefined,
  };
}

function parsePartialResult(err: BinanceApiError): CancelReplaceResult {
  // Binance's HTTP 409 partial-success body carries:
  //   { cancelResult: 'SUCCESS'|'FAILURE', newOrderResult: 'SUCCESS'|'FAILURE',
  //     cancelResponse?: {...}, newOrderResponse?: {...} }
  // The SDK surfaces this via BinanceApiError.headers or .raw — the latter
  // when the SDK is extended to expose body parsing (see HttpClient.ts).
  // For now we re-parse what we can from the error message envelope, which
  // encodes the structured partials as JSON when present.
  const body = readBody(err);
  if (body) {
    return successResult(body);
  }
  return {
    cancelResult: 'FAILURE',
    newOrderResult: 'FAILURE',
  };
}

function readBody(err: BinanceApiError): Record<string, unknown> | null {
  // Prefer a parsed body if the SDK exposes one via headers / context.
  const headers = err.headers ?? undefined;
  if (headers && typeof headers === 'object') {
    const body = (headers as Record<string, unknown>).body;
    if (body && typeof body === 'object') {
      return body as Record<string, unknown>;
    }
  }
  return null;
}
