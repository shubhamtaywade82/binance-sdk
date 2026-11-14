import { BinanceApiError, type BinanceApiErrorContext } from './BinanceApiError.js';

/**
 * -2011 on cancel: the cancelRestrictions check failed, so the order is no longer
 * ONLY_NEW or ONLY_PARTIALLY_FILLED. The code comes from a maintainer digest and is
 * not in the vendored spec.
 */
export class BinanceCancelRestrictionFailedError extends BinanceApiError {
  constructor(message: string, status: number, context?: BinanceApiErrorContext) {
    super(message, -2011, status, context);
    this.name = 'BinanceCancelRestrictionFailedError';
  }
}
