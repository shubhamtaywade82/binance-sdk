/**
 * An RPC whose outcome cannot be determined.
 *
 * Binance's WebSocket API (like every order transport) can accept a request
 * and then lose the connection before the response arrives. For a mutating
 * request — `order.place`, `order.cancel`, `order.modify`, … — that leaves the
 * outcome fundamentally unknowable from the client side:
 *
 *  - the exchange may have accepted and executed it,
 *  - or the frame may have been lost before processing.
 *
 * Retrying such a request blindly can double a position or cancel an order
 * that was already cancelled; assuming it failed can silently drop a live
 * order. So the client must never flatten this state into a generic network
 * error (indistinguishable from "definitely not sent") — it rejects with this
 * typed error instead, carrying safe diagnostic metadata (request id, method,
 * client order id, connection generation, timestamps — never credentials).
 *
 * Consumers follow the same reconciliation policy as the REST execution
 * manager: query the order by its client order id before considering any
 * resubmission (`classifyRetrySafety` maps this error to
 * `reconciliation-required`).
 */

/** Coarse request classification used to pick reconnect/timeout policies. */
export type RpcRequestCategory =
  /** Mutating: creates exposure (new order, algo order, order list, cancel-replace). */
  | 'write-order'
  /** Mutating: removes an order from the book. */
  | 'write-cancel'
  /** Mutating: changes a resting order. */
  | 'write-modify'
  /** Mutating but not order-lifecycle: listen-key create/keepalive/stop, margin changes, … */
  | 'account-write'
  /** Session-control RPC (session.logon/status/logout). */
  | 'session'
  /** Everything else — non-mutating queries and market data. */
  | 'read';

/** Why the outcome became unknown. */
export type RpcUnknownCause = 'connection-drop' | 'timeout';

/** Safe diagnostic metadata — request identity only, never credentials. */
export interface RpcOutcomeUnknownMetadata {
  /** The correlation id the request was dispatched under. */
  requestId: string;
  /** WebSocket API method, e.g. `order.place`. */
  method: string;
  /** Request classification at dispatch time. */
  category: RpcRequestCategory;
  /** `newClientOrderId` / `clientAlgoId`, when the request carried one. */
  clientOrderId?: string;
  /** `symbol`, when the request carried one. */
  symbol?: string;
  /** Connection generation the request was dispatched on. */
  connectionGeneration: number;
  /** Epoch ms the request entered the pending map. */
  submittedAt: number;
  /** Epoch ms the frame was actually sent, or null when it never left. */
  sentAt: number | null;
  /** What made the outcome undeterminable. */
  cause: RpcUnknownCause;
}

export class RpcOutcomeUnknownError extends Error {
  constructor(readonly metadata: RpcOutcomeUnknownMetadata) {
    super(
      `WS API ${metadata.method} outcome unknown (${metadata.cause}); the request was ` +
        `dispatched (requestId=${metadata.requestId}, category=${metadata.category}` +
        `${metadata.clientOrderId ? `, clientOrderId=${metadata.clientOrderId}` : ''}` +
        `${metadata.symbol ? `, symbol=${metadata.symbol}` : ''}` +
        `) but no response arrived — reconcile the order state before any retry`,
    );
    this.name = 'RpcOutcomeUnknownError';
  }
}

/**
 * Classify a WebSocket API method for reconnect/timeout policy. Order writes
 * are ambiguous after any in-flight failure; reads and session-control frames
 * are not.
 */
export function classifyRpcMethod(method: string): RpcRequestCategory {
  if (method.startsWith('session.')) return 'session';
  switch (method) {
    case 'order.place':
    case 'orderList.place':
    case 'algoOrder.place':
    case 'order.batch':
    case 'order.cancelReplace':
      return 'write-order';
    case 'order.cancel':
    case 'orderList.cancel':
    case 'openOrders.cancelAll':
    case 'algoOrder.cancel':
    case 'algoOpenOrders.cancelAll':
    case 'orderList.cancelAll':
      return 'write-cancel';
    case 'order.modify':
    case 'orderList.modify':
    case 'algoOrder.modify':
      return 'write-modify';
    case 'userDataStream.start':
    case 'userDataStream.ping':
    case 'userDataStream.stop':
      return 'account-write';
    default:
      return 'read';
  }
}

/** True when a request category mutates order state (ambiguous on failure). */
export function isOrderWriteCategory(category: RpcRequestCategory): boolean {
  return (
    category === 'write-order' ||
    category === 'write-cancel' ||
    category === 'write-modify'
  );
}
