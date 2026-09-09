import { BinanceApiError, NetworkError } from '../../errors/index.js';
import { ExecutionUnknownError } from '../types.js';
import type { RetryClassification, RetrySafety } from './types.js';

/**
 * Semantic retry classification for order operations.
 *
 * "Can I retry this?" is the first question every caller of a trading SDK
 * asks after an error, and the honest answer depends on *which* failure
 * occurred, not on generic error taxonomy:
 *
 *  - a timeout on order placement leaves the outcome unknown — the order may
 *    be live; retrying blind can double the position (`reconciliation-required`);
 *  - a `-2013` after an ambiguous submission *proves* the order never reached
 *    the engine — resubmission is free of risk (`safe`);
 *  - `-1013` filter rejections are deterministic — the identical request
 *    fails forever (`never-retry`).
 *
 * This module makes the SDK's answer explicit and testable. The execution
 * manager already *embodies* this matrix (its resubmit-after-`-2013` path is
 * the 'safe' branch; its `ExecutionUnknownError` is 'reconciliation-required'
 * made fatal); the classifier exposes the same reasoning to callers holding
 * raw errors, so agents and tools can decide without reimplementing it.
 *
 * Note on `'idempotent'`: the live exchange never earns it — Binance does not
 * enforce `newClientOrderId` uniqueness, so a "retry with the same key" is not
 * distinguishable from a second order. The category exists for backends whose
 * create operation is genuinely keyed (paper engines, future brokers).
 */

/** Classify one error for retry semantics against the live exchange. */
export function classifyRetrySafety(error: unknown): RetryClassification {
  if (error === null || error === undefined) {
    return { safety: 'never-retry', reason: 'no error to classify' };
  }

  if (error instanceof ExecutionUnknownError) {
    return {
      safety: 'reconciliation-required',
      reason: `outcome undetermined after ${error.attempts} reconciliation attempts (clientOrderId=${error.execution.clientOrderId}); reconcile before any retry`,
    };
  }

  if (error instanceof NetworkError) {
    return {
      safety: 'reconciliation-required',
      reason: 'transport failure left the outcome unknown; reconcile the order before retrying',
    };
  }

  if (error instanceof BinanceApiError) {
    return classifyApiError(error);
  }

  return {
    safety: 'never-retry',
    reason: `unrecognized error type (${describeType(error)}); refusing to guess`,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function classifyApiError(error: BinanceApiError): RetryClassification {
  const code = error.code;

  // Proven-absent orders: the canonical "safe" signals. A -2013 on the
  // reconciliation path means the submission never reached the engine; a
  // -2011 on cancel means the target is already gone (the desired end state).
  if (code === -2013) {
    return { safety: 'safe', reason: 'order does not exist — no side effect to double' };
  }
  if (code === -2011) {
    return { safety: 'safe', reason: 'unknown order — the cancel target is already gone' };
  }

  // Throttling: the request was rejected before processing, so no order was
  // created. Retrying is side-effect-free, but only after the window clears.
  // (429/418 surface as HTTP status, -1003 as the body code — see
  // `isRateLimitError()`.)
  if (error.isRateLimitError()) {
    return { safety: 'safe', reason: 'rate-limited before processing; retry after the ban window' };
  }

  // Clock skew: rejected before the engine saw the order; retry after sync.
  if (code === -1021) {
    return { safety: 'safe', reason: 'timestamp outside recvWindow; sync the clock and retry' };
  }

  // Ambiguous server-side failures: the request may have been processed.
  if (code === -1000) {
    return { safety: 'reconciliation-required', reason: 'exchange UNKNOWN error — outcome not determinable from the response' };
  }
  if (code === -1001) {
    return { safety: 'reconciliation-required', reason: 'exchange DISCONNECTED mid-processing' };
  }
  if (code === -1007) {
    return { safety: 'reconciliation-required', reason: 'exchange timeout — outcome not determinable from the response' };
  }

  // Everything else is a definitive protocol rejection: filters (-1013,
  // -4164), duplicates (-2010), margin (-2018/-2019), permissions (-2015),
  // argument errors — deterministic failures.
  return {
    safety: 'never-retry',
    reason: `definitive exchange rejection (code ${code}: ${error.message})`,
  };
}

function describeType(error: unknown): string {
  if (error instanceof Error) return error.constructor.name;
  return typeof error;
}

/** Narrow helper for switch-style consumers. */
export function isRetrySafety(value: unknown): value is RetrySafety {
  return (
    value === 'safe' ||
    value === 'idempotent' ||
    value === 'reconciliation-required' ||
    value === 'never-retry'
  );
}
