import type { ExecutionFill } from '../types.js';

/**
 * v3 execution platform — shared domain types.
 *
 * Milestone 3 turns execution from a per-call concern into a platform: the
 * user-data stream becomes a managed session (listen-key lifecycle, keep-alive,
 * rotation), order and position state become live feeds updated by that stream,
 * and retry decisions become an explicit, classified contract instead of an
 * implicit code path. These types are the vocabulary all three pieces share.
 */

// ---------------------------------------------------------------------------
// Order state
// ---------------------------------------------------------------------------

/**
 * Binance order lifecycle statuses — the union of REST and user-stream values
 * across USDⓈ-M and Spot. The trailing `string` intersection keeps the union
 * open: Binance adds statuses (e.g. `EXPIRED_IN_MATCH` for STP) without
 * breaking compilation, while known values still autocomplete.
 */
export type OrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'PENDING_CANCEL'
  | 'REJECTED'
  | 'EXPIRED'
  | 'EXPIRED_IN_MATCH'
  | 'PARTIALLY_CANCELED'
  | 'LIQUIDATED'
  | (string & Record<never, never>);

/**
 * True when the status is a terminal order state — no further execution
 * reports or REST polls can change the outcome (late events for a terminal
 * order are protocol noise; trackers stop mutating terminal records).
 */
export function isTerminalOrderStatus(status: string): boolean {
  return (
    status === 'FILLED' ||
    status === 'CANCELED' ||
    status === 'EXPIRED' ||
    status === 'EXPIRED_IN_MATCH' ||
    status === 'REJECTED' ||
    status === 'PARTIALLY_CANCELED' ||
    status === 'LIQUIDATED'
  );
}

/**
 * Live view of one order, folded from every source that observes it:
 * user-stream execution reports, REST order queries, and the execution
 * manager's submissions. All prices and quantities are exact decimal strings
 * (see `core/decimal`) — never binary floats.
 *
 * Unlike the {@link import('../types.js').Execution} ledger entry (which
 * follows one *intent*), the OrderRecord follows one *order* — including
 * orders placed outside this SDK (by hand, by another bot, by the UI): the
 * user stream reports them all.
 */
export interface OrderRecord {
  /** Exchange reconciliation key (same field the execution manager derives). */
  clientOrderId: string;
  /** Exchange-assigned id, once any source has reported it. */
  exchangeOrderId?: number;
  symbol: string;
  side: string;
  type: string;
  status: OrderStatus;
  /** Requested quantity when a source reported it, else null. */
  originalQuantity: string | null;
  /** Cumulative executed quantity — decimal string. */
  executedQuantity: string;
  /**
   * Cumulative quote volume — decimal string. USDⓈ-M execution reports do not
   * carry it; the fold computes `executedQuantity × averagePrice` as an
   * estimate, exactly like the execution ledger does.
   */
  cumulativeQuoteQuantity: string | null;
  /** Volume-weighted average fill price — decimal string or null. */
  averagePrice: string | null;
  /** Individual fills, appended once per trade, deduplicated by trade id. */
  fills: ExecutionFill[];
  positionSide?: string;
  reduceOnly?: boolean;
  timeInForce?: string;
  /** Epoch ms when this order was first observed by any source. */
  firstSeenAt: number;
  /** Epoch ms of the last applied update. */
  updatedAt: number;
}

/**
 * One fully-normalized order observation — the unit the tracker folds into
 * {@link OrderRecord}. Produced from either a user-stream event or a REST
 * order view by the platform normalizers.
 */
export interface OrderUpdate {
  clientOrderId: string;
  exchangeOrderId?: number;
  symbol: string;
  side: string;
  type: string;
  status: string;
  originalQuantity: string | null;
  executedQuantity: string;
  cumulativeQuoteQuantity: string | null;
  averagePrice: string | null;
  /** The trade this update carries, when it reports one (fill quantity > 0). */
  lastFill: ExecutionFill | null;
  positionSide?: string;
  reduceOnly?: boolean;
  timeInForce?: string;
  /** Epoch ms of the observation (event transaction time or REST time). */
  updateTime: number;
  source: 'user-stream' | 'rest';
  /** The raw event/response this was normalized from, for auditing. */
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Position state
// ---------------------------------------------------------------------------

/**
 * Live view of one position (USDⓈ-M), folded from `ACCOUNT_UPDATE` user-stream
 * events. Keyed by `symbol` + `positionSide` — one-way mode reports `BOTH`,
 * hedge mode reports `LONG` and `SHORT` separately.
 */
export interface PositionRecord {
  symbol: string;
  /** 'BOTH' (one-way mode) | 'LONG' | 'SHORT' (hedge mode). */
  positionSide: string;
  /** Signed position amount — decimal string (negative for shorts). */
  positionAmount: string;
  /** Average entry price — decimal string. */
  entryPrice: string;
  /** Unrealized PnL as of the last event — decimal string (stream value; refresh via REST for precision). */
  unrealizedPnl: string | null;
  /** 'isolated' | 'cross' when reported, else null. */
  marginType: string | null;
  /** Isolated-position wallet balance when reported, else null. */
  isolatedWallet: string | null;
  /** Epoch ms of the last applied event. */
  updatedAt: number;
}

/**
 * One normalized position change — an `ACCOUNT_UPDATE` position entry
 * (`a.P[i]`), decimal strings everywhere.
 */
export interface PositionUpdate {
  symbol: string;
  positionSide: string;
  positionAmount: string;
  entryPrice: string;
  unrealizedPnl: string | null;
  marginType: string | null;
  isolatedWallet: string | null;
  updateTime: number;
  /** The raw `a.P` entry this was normalized from. */
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// User-data stream session
// ---------------------------------------------------------------------------

/** Consumer-visible lifecycle of a managed {@link UserStreamSession}. */
export type UserSessionState =
  | 'idle'
  | 'starting'
  | 'live'
  | 'reconnecting'
  | 'closed';

/**
 * REST listen-key lifecycle the session drives. Product adapters implement
 * this over the shared `HttpClient` (USDⓈ-M `/fapi/v1/listenKey`, Spot
 * `/api/v3/userDataStream`) — swap it out for a captive/mock backend in tests.
 */
export interface ListenKeyApi {
  /** Create a fresh listen key. */
  create(): Promise<string>;
  /**
   * Renew a listen key. Binance disconnects user streams after 60 minutes
   * without renewal; the session calls this roughly every 30 minutes.
   */
  keepAlive(listenKey: string): Promise<void>;
  /** Delete a listen key (server-side stream teardown). Best-effort. */
  close?(listenKey: string): Promise<void>;
}

/**
 * Execution platform defaults. Keep-alive runs at the documented 30-minute
 * cadence; a key is rotated after 3 consecutive keep-alive failures (dead
 * key) or 6 reconnect attempts without an OPEN (network partition or the
 * key expired server-side mid-outage).
 */
export const EXECUTION_PLATFORM_DEFAULTS = {
  /** Listen-key renewal cadence (Binance kills keys after 60 min). */
  keepAliveIntervalMs: 30 * 60 * 1000,
  /** Consecutive keep-alive failures before the key is rotated. */
  keepAliveFailuresBeforeRotation: 3,
  /**
   * Reconnect attempts (with backoff) before the key is rotated — the escape
   * hatch for "server accepts nothing on this key anymore".
   */
  reconnectAttemptsBeforeRotation: 6,
  /** Retained order records before the oldest are evicted. */
  maxTrackedOrders: 5000,
  /** Default wait for an order to reach a terminal status. */
  terminalTimeoutMs: 30_000,
} as const;

// ---------------------------------------------------------------------------
// Semantic retry classification
// ---------------------------------------------------------------------------

/**
 * What a retry of a failed order operation means, semantically:
 *
 *  - `'safe'` — the failure proves no order side effect occurred; retrying is
 *    free of double-execution risk (order never reached the engine, request
 *    was throttled before processing, target of a cancel already gone).
 *  - `'idempotent'` — the target backend enforces the idempotency key, so a
 *    retry with the same key cannot double-execute. The live exchange never
 *    earns this label (Binance does not enforce `newClientOrderId`
 *    uniqueness); it is reserved for backends that do (e.g. a paper engine
 *    keyed by intent).
 *  - `'reconciliation-required'` — the outcome is unknown: the request may or
 *    may not have reached the engine. Retrying blind risks doubling the
 *    position; the caller must reconcile first (the execution manager's
 *    `reconcile()`, or `GET /fapi/v1/order` by clientOrderId).
 *  - `'never-retry'` — a definitive rejection or a programming error: the
 *    same request will fail the same way (filters, margin, permissions).
 */
export type RetrySafety =
  | 'safe'
  | 'idempotent'
  | 'reconciliation-required'
  | 'never-retry';

/** Result of classifying an error for retry semantics. */
export interface RetryClassification {
  safety: RetrySafety;
  /** Human-readable justification, stable enough for dashboards. */
  reason: string;
}
