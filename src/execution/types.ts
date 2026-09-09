import type { EventBus } from '../core/events.js';

/**
 * Typed execution envelope.
 *
 * Raw Binance order responses mix decimal strings, numbers and ACK/RESULT
 * shapes, and tell you nothing about *which intent* produced them or whether
 * the response was confirmed, recovered by reconciliation, or left ambiguous.
 * The execution envelope is the domain layer above the raw exchange model:
 * every quantity and price is an exact decimal *string* (see `core/decimal`),
 * and the lifecycle of the intent is explicit.
 */

/** How the final state of this execution was established. */
export type ReconciliationState =
  /** The exchange's synchronous response confirmed the order. */
  | 'acked'
  /** A network/timeout error hid the outcome; REST lookup recovered the truth. */
  | 'reconciled'
  /** The exchange definitively rejected the request; no order exists. */
  | 'rejected'
  /** Outcome could not be determined; manual reconciliation required. */
  | 'unknown';

export interface ExecutionFill {
  /** Exact decimal string. */
  price: string;
  quantity: string;
  commission?: string;
  commissionAsset?: string;
  /** Trade id, when available. */
  tradeId?: number;
}

export interface Execution {
  /** Caller-supplied or generated idempotency key for this intent. */
  intentId: string;
  /** The `newClientOrderId` sent to the exchange — the reconciliation key. */
  clientOrderId: string;
  /** Exchange-assigned id once known. */
  exchangeOrderId?: number;
  symbol: string;
  side: string;
  type: string;
  status: string;
  /** Exact decimal string, or null when the order is quote-sized only. */
  requestedQuantity: string | null;
  requestedPrice: string | null;
  executedQuantity: string;
  cumulativeQuoteQuantity: string;
  /** Volume-weighted average fill price (exact decimal string) or null. */
  averagePrice: string | null;
  fills: ExecutionFill[];
  reconciliationState: ReconciliationState;
  /** Epoch ms when the intent was accepted locally. */
  submittedAt: number;
  /** Epoch ms of the last state change. */
  updatedAt: number;
  /** Last raw exchange payload, for auditing/forwarding. */
  raw: Record<string, unknown>;
}

import type { RiskGateway } from '../risk/RiskGateway.js';

export interface ExecutionManagerOptions {
  /** Prefix for generated client order ids (max 36 chars total, Binance rule). */
  clientOrderIdPrefix?: string;
  /** Rest queries per reconciliation attempt. Default 3. */
  reconcileMaxAttempts?: number;
  /** Delay between reconciliation polls. Default 400ms. */
  reconcilePollDelayMs?: number;
  /** Observability events under the `execution` scope. */
  events?: EventBus;
  /** Optional risk gateway fed exposure/failure state by the manager. */
  riskGateway?: RiskGateway;
  /**
   * Capacity limit for the retained execution ledger; oldest intents are
   * evicted. Default 1000.
   */
  maxLedgerSize?: number;
}

/** Thrown when an order's outcome cannot be determined after reconciliation. */
export class ExecutionUnknownError extends Error {
  constructor(
    message: string,
    readonly execution: Pick<
      Execution,
      'intentId' | 'clientOrderId' | 'symbol' | 'side' | 'type' | 'submittedAt'
    >,
    readonly attempts: number,
  ) {
    super(message);
    this.name = 'ExecutionUnknownError';
  }
}
