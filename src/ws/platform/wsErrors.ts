import { BinanceApiError } from '../../errors/BinanceApiError.js';
import { RateLimitError } from '../../errors/RateLimitError.js';
import { RpcOutcomeUnknownError, isOrderWriteCategory } from '../../errors/RpcOutcomeUnknownError.js';
import type { PendingRequest } from './WsApiClient.js';

/**
 * In-frame status dispatch for WebSocket API responses. The status arrives inside a
 * 200 transport frame, so it must be mapped explicitly:
 * - 418 / 429 → RateLimitError. The client locks outbound requests (see
 *   {@link wsRateLockMs}). 418 is an IP ban, 2 minutes up to 3 days (doc).
 * - 5xx on an order write → RpcOutcomeUnknownError. The exchange may have acted.
 * - 5xx on a read → BinanceApiError, safe to retry.
 * - other 4xx → BinanceApiError with the exchange code.
 */

export const WS_418_BAN_BASE_MS = 120_000;
export const WS_429_BACKOFF_MS = 60_000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface WsApiFailureResponse {
  status: number;
  error?: { code: number; msg: string };
}

/**
 * Lock duration after a 418/429. A 418 doubles from the 2-minute base on each
 * consecutive ban, capped at 3 days. A 429 uses the fixed backoff.
 */
export function wsRateLockMs(status: number, consecutiveBans: number): number {
  if (status === 418) {
    return Math.min(THREE_DAYS_MS, WS_418_BAN_BASE_MS * 2 ** Math.max(0, consecutiveBans - 1));
  }
  return WS_429_BACKOFF_MS;
}

export function classifyWsApiFailure(
  response: WsApiFailureResponse,
  entry: Pick<PendingRequest, 'id' | 'method' | 'category' | 'params' | 'connectionGeneration' | 'submittedAt' | 'sentAt'>,
  message: string,
): Error {
  const code = response.error?.code ?? response.status;

  if (response.status === 418 || response.status === 429) {
    return new RateLimitError(message, code, response.status, undefined, { method: entry.method });
  }

  if (response.status >= 500 && isOrderWriteCategory(entry.category)) {
    const clientOrderId = entry.params.newClientOrderId;
    const symbol = entry.params.symbol;
    return new RpcOutcomeUnknownError({
      requestId: entry.id,
      method: entry.method,
      category: entry.category,
      clientOrderId: typeof clientOrderId === 'string' ? clientOrderId : undefined,
      symbol: typeof symbol === 'string' ? symbol : undefined,
      connectionGeneration: entry.connectionGeneration,
      submittedAt: entry.submittedAt,
      sentAt: entry.sentAt ?? entry.submittedAt,
      cause: 'server-error',
    });
  }

  return new BinanceApiError(message, code, response.status, { method: entry.method });
}
