import { BinanceError } from './BinanceError.js';

export interface BinanceApiErrorContext {
  endpoint?: string;
  method?: string;
  headers?: Record<string, string>;
}

export class BinanceApiError extends BinanceError {
  readonly code: number;
  readonly status: number;
  readonly endpoint?: string;
  readonly method?: string;
  readonly headers?: Record<string, string>;

  constructor(message: string, code: number, status: number, context?: BinanceApiErrorContext) {
    super(message);
    this.name = 'BinanceApiError';
    this.code = code;
    this.status = status;
    this.endpoint = context?.endpoint;
    this.method = context?.method;
    this.headers = context?.headers;
  }

  /** -1003 (way too many requests) or HTTP 429/418. */
  isRateLimitError(): boolean {
    return this.code === -1003 || this.status === 429 || this.status === 418;
  }

  /** -1021: request timestamp outside recvWindow, usually caused by local clock drift. */
  isTimestampError(): boolean {
    return this.code === -1021;
  }

  /** -2010: account has insufficient balance for the requested action. */
  isInsufficientBalance(): boolean {
    return this.code === -2010;
  }
}
