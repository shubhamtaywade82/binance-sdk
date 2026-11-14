/**
 * Order-type routing for USDⓈ-M futures.
 *
 * `TRAILING_STOP_MARKET` is verified on the algo endpoint (POST /fapi/v1/algoOrder,
 * callbackRate 0.1–20). The remaining members of FUTURES_ALGO_ORDER_TYPES come from the
 * Futures Algo API digest provided with the task. They were not re-read in this
 * session, so they are kept in one list that can be corrected in one place.
 *
 * Routing is a pure decision, not a transport change. Wiring it into newOrder would
 * change which endpoint an existing caller hits. That is a separate, deliberate step.
 */

export const FUTURES_ALGO_ORDER_TYPES = [
  'STOP',
  'STOP_MARKET',
  'TAKE_PROFIT',
  'TAKE_PROFIT_MARKET',
  'TRAILING_STOP_MARKET',
] as const;

export type FuturesAlgoOrderType = (typeof FUTURES_ALGO_ORDER_TYPES)[number];

export type FuturesOrderEndpoint = 'order' | 'algo';

export function routeFuturesOrderType(type: string): FuturesOrderEndpoint {
  return (FUTURES_ALGO_ORDER_TYPES as readonly string[]).includes(type) ? 'algo' : 'order';
}
