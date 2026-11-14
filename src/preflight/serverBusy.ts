/**
 * -1008 SERVER_BUSY policy. The semantics below come from a maintainer digest and are
 * not in the vendored spec:
 * - a risk-reducing order (closePosition, reduceOnly, or a position-closing side) may
 *   bypass the back-off, so an exit is never held behind new exposure;
 * - an exposure-increasing order backs off exponentially and gives up after a cap.
 *
 * This module is a pure decision. It is not wired into HttpClient, because the -1008
 * transport behaviour is not verified.
 */

export const SERVER_BUSY_CODE = -1008;

export interface ServerBusyOrder {
  closePosition?: boolean;
  reduceOnly?: boolean;
  positionSide?: 'BOTH' | 'LONG' | 'SHORT';
  side?: 'BUY' | 'SELL';
}

export function isRiskReducingOrder(order: ServerBusyOrder): boolean {
  if (order.closePosition === true || order.reduceOnly === true) return true;
  if (order.positionSide === 'LONG' && order.side === 'SELL') return true;
  if (order.positionSide === 'SHORT' && order.side === 'BUY') return true;
  return false;
}

export interface ServerBusyPolicyOptions {
  baseDelayMs?: number;
  maxAttempts?: number;
}

/** Delay before retrying a -1008 reply, or null when the caller should stop. */
export function serverBusyRetryDelayMs(
  order: ServerBusyOrder,
  attempt: number,
  options: ServerBusyPolicyOptions = {},
): number | null {
  const maxAttempts = options.maxAttempts ?? 5;
  if (attempt >= maxAttempts) return null;
  if (isRiskReducingOrder(order)) return 0;
  return (options.baseDelayMs ?? 500) * 2 ** attempt;
}
