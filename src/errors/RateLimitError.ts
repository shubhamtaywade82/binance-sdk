import { BinanceApiError, type BinanceApiErrorContext } from './BinanceApiError.js';

export class RateLimitError extends BinanceApiError {
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: number,
    status: number,
    retryAfterMs?: number,
    context?: BinanceApiErrorContext,
  ) {
    super(message, code, status, context);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}
