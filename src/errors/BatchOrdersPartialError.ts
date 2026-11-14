import type { BatchElementResult } from '../preflight/batch.js';
import { BinanceError } from './BinanceError.js';

/**
 * Thrown by the legacy `createBatchOrders` when any element was not accepted. The
 * accepted orders are still placed. Per-element detail is in `results`, so callers
 * can see what went where. Use `placeBatchOrders` to get per-element results
 * without an exception.
 */
export class BatchOrdersPartialError extends BinanceError {
  readonly results: readonly BatchElementResult<unknown>[];
  readonly rejectedCount: number;
  readonly unknownCount: number;

  constructor(results: readonly BatchElementResult<unknown>[]) {
    const rejectedCount = results.filter((r) => !r.success && r.status === 'REJECTED').length;
    const unknownCount = results.filter((r) => !r.success && r.status === 'UNKNOWN').length;
    super(
      `${rejectedCount + unknownCount} of ${results.length} batch orders were not accepted ` +
        `(rejected ${rejectedCount}, outcome unknown ${unknownCount}). ` +
        'Unknown-outcome orders may have been placed; reconcile before retrying.',
    );
    this.name = 'BatchOrdersPartialError';
    this.results = results;
    this.rejectedCount = rejectedCount;
    this.unknownCount = unknownCount;
  }
}
