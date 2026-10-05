/**
 * Pluggable execution transport — the audit's "build once, deploy across
 * live or paper" surface for order placement and cancellation.
 *
 * Both the official `binance-connector-js` and the community `binance`
 * package bind the execution layer directly to live REST/WS endpoints,
 * which forces algorithmic strategy developers to either mock the
 * network layer or write parallel code paths for simulation. The audit
 * recommends shipping a thin `IExecutionTransport` contract that
 * abstracts `placeOrder` / `cancelOrder` behind a stable interface,
 * so a strategy module can swap between:
 *
 *  - **Live Binance** — backed by REST `POST /api/v3/order` or the
 *    WebSocket API v3 `order.place` method;
 *  - **Paper Broker** — backed by an internal matching engine or any
 *    other simulator that implements this interface.
 *
 * The SDK already ships an {@link ExecutionAdapter} for the richer
 * {@link ExecutionManager} reconciliation matrix; {@link IExecutionTransport}
 * is a deliberately narrower surface — just place and cancel — for
 * callers who do not need (or do not want to pay for) the manager's
 * ledger, risk gateway hook, or user-stream plumbing.
 */

/** Common order side. */
export type OrderSide = 'BUY' | 'SELL';

/** Common order type. */
export type OrderType = 'LIMIT' | 'MARKET' | 'STOP' | 'STOP_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT';

/** Self-trade prevention mode (Spot / Futures / European Options). */
export type SelfTradePreventionMode =
  | 'EXPIRE_MAKER'
  | 'EXPIRE_TAKER'
  | 'EXPIRE_BOTH'
  | 'NONE';

/** Parameters accepted by {@link IExecutionTransport.placeOrder}. */
export interface OrderPlacementParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  /** Exact decimal string (the SDK uses string throughout to avoid float drift). */
  quantity: string;
  /** Required for LIMIT / STOP_LIMIT / TAKE_PROFIT_LIMIT orders. */
  price?: string;
  /** Required for STOP / STOP_LIMIT / TAKE_PROFIT orders. */
  stopPrice?: string;
  /** Time-in-force; defaults to `GTC` for LIMIT. */
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX' | 'GTE';
  /** Idempotency key; reconcilable with REST `origClientOrderId`. */
  newClientOrderId?: string;
  /** Quote-quantity for reversed-size orders (USDM `quoteOrderQty`). */
  quoteOrderQty?: string;
  /** Self-trade prevention flag (Spot / Futures standard). */
  selfTradePreventionMode?: SelfTradePreventionMode;
  /** Spot-only: trailing-stop delta. */
  trailingDelta?: string;
  /** Spot-only: iceberg quantity. */
  icebergQty?: string;
}

/** Result of a successful order placement. */
export interface OrderExecutionResult {
  orderId: string | number;
  clientOrderId: string;
  symbol: string;
  status: 'NEW' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELED' | 'EXPIRED' | 'PENDING_NEW';
  /** Exact decimal string. */
  executedQty: string;
  /** Exact decimal string. */
  cummulativeQuoteQty: string;
  /** Average fill price (exact decimal string) or null pre-fill. */
  avgPrice: string | null;
  /** Order list id when the order is part of a list (e.g. OCO). */
  orderListId?: number;
  /** Whether the order was reduced (self-trade prevention). */
  isReduced?: boolean;
}

/** Result of a cancel call. */
export interface OrderCancelResult {
  orderId: string | number;
  clientOrderId?: string;
  symbol: string;
  status: 'CANCELED' | 'PENDING_CANCEL' | 'EXPIRED';
}

/**
 * Pluggable execution transport — strategy code is written against this
 * interface, and the live vs. paper backends are constructor-time
 * configuration. See {@link LiveBinanceTransport} and
 * {@link PaperBrokerTransport} for ready-made adapters.
 */
export interface IExecutionTransport {
  readonly label: string;
  placeOrder(params: OrderPlacementParams): Promise<OrderExecutionResult>;
  cancelOrder(symbol: string, orderId: string | number, opts?: { origClientOrderId?: string }): Promise<OrderCancelResult>;
}
