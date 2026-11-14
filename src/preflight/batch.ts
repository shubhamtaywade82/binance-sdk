import { BinanceApiError } from '../errors/BinanceApiError.js';
import { PreflightValidationError } from '../errors/PreflightValidationError.js';

/** Maximum orders per POST /fapi/v1/batchOrders call (verified: "Max 5 orders"). */
export const BATCH_ORDERS_MAX_SIZE = 5;

/**
 * Per-order outcome of a batch. Order placement is not idempotent, so the three
 * states must not be merged:
 * - ACCEPTED: the exchange returned an order object for this element.
 * - REJECTED: the exchange definitively refused this order (per-element `{code,msg}`,
 *   or a whole-request 4xx such as 429 that means nothing was processed).
 * - UNKNOWN: the outcome is unknown (transport failure, 5xx, or a malformed reply),
 *   so the order may have been placed. Reconcile before retrying.
 */
export type BatchOutcome<O> =
  | { status: 'ACCEPTED'; index: number; data: O }
  | { status: 'REJECTED'; index: number; code: number; msg: string }
  | { status: 'UNKNOWN'; index: number; error: unknown };

/** Split into request-sized chunks, preserving order. */
export function chunkBatch<T>(items: readonly T[], size: number = BATCH_ORDERS_MAX_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > BATCH_ORDERS_MAX_SIZE) {
    throw new PreflightValidationError('BATCH_SIZE', `batch chunk size must be an integer in [1, ${BATCH_ORDERS_MAX_SIZE}]`, {
      size,
    });
  }
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

/** A per-element error object inside a batch reply: numeric `code` and string `msg`, no `orderId`. */
export function isBatchErrorElement(value: unknown): value is { code: number; msg: string } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'number' && typeof candidate.msg === 'string' && !('orderId' in candidate);
}

/**
 * Execute orders in chunks of at most {@link BATCH_ORDERS_MAX_SIZE}, sequentially,
 * and return one outcome per input, in input order. A failed chunk does not stop
 * later chunks. Each chunk's failure is scoped to its own elements.
 *
 * `sendChunk` must return exactly one reply element per request element, in order.
 * A length mismatch marks the whole chunk UNKNOWN, because the mapping cannot be trusted.
 */
export async function executeBatchOrders<I, O = unknown>(
  items: readonly I[],
  sendChunk: (chunk: readonly I[]) => Promise<readonly unknown[]>,
  options: { chunkSize?: number } = {},
): Promise<BatchOutcome<O>[]> {
  const outcomes: BatchOutcome<O>[] = [];
  let offset = 0;
  for (const chunk of chunkBatch(items, options.chunkSize)) {
    const start = offset;
    offset += chunk.length;

    let reply: readonly unknown[];
    try {
      reply = await sendChunk(chunk);
    } catch (error) {
      pushChunkFailure(outcomes, start, chunk.length, error);
      continue;
    }
    if (!Array.isArray(reply) || reply.length !== chunk.length) {
      const length = Array.isArray(reply) ? reply.length : 'non-array';
      pushChunkFailure(
        outcomes,
        start,
        chunk.length,
        new Error(`batch reply length ${length} does not match request length ${chunk.length}`),
      );
      continue;
    }
    reply.forEach((element, i) => {
      const index = start + i;
      if (isBatchErrorElement(element)) {
        outcomes.push({ status: 'REJECTED', index, code: element.code, msg: element.msg });
      } else {
        outcomes.push({ status: 'ACCEPTED', index, data: element as O });
      }
    });
  }
  return outcomes;
}

/**
 * A whole-chunk failure. A 4xx BinanceApiError means the exchange refused the
 * request without processing it, so it is REJECTED. Anything else is UNKNOWN.
 */
function pushChunkFailure<O>(
  outcomes: BatchOutcome<O>[],
  start: number,
  length: number,
  error: unknown,
): void {
  const definitivelyRefused =
    error instanceof BinanceApiError && error.status >= 400 && error.status < 500;
  for (let i = 0; i < length; i++) {
    const index = start + i;
    if (definitivelyRefused) {
      outcomes.push({ status: 'REJECTED', index, code: error.code, msg: error.message });
    } else {
      outcomes.push({ status: 'UNKNOWN', index, error });
    }
  }
}
