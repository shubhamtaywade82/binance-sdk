import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Algo SAPI. */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Futures algo ----
  ['futures.historicalOrders', 'GET', '/sapi/v1/algo/futures/historicalOrders', 'signed', 'algo.futures.historicalOrders'],
  ['futures.newOrderTwap', 'POST', '/sapi/v1/algo/futures/newOrderTwap', 'signed', 'algo.futures.newOrderTwap'],
  ['futures.newOrderVp', 'POST', '/sapi/v1/algo/futures/newOrderVp', 'signed', 'algo.futures.newOrderVp'],
  ['futures.openOrders', 'GET', '/sapi/v1/algo/futures/openOrders', 'signed', 'algo.futures.openOrders'],
  ['futures.cancelOrder', 'DELETE', '/sapi/v1/algo/futures/order', 'signed', 'algo.futures.cancelOrder'],
  ['futures.subOrders', 'GET', '/sapi/v1/algo/futures/subOrders', 'signed', 'algo.futures.subOrders'],
  // ---- Spot algo ----
  ['spot.historicalOrders', 'GET', '/sapi/v1/algo/spot/historicalOrders', 'signed', 'algo.spot.historicalOrders'],
  ['spot.newOrderTwap', 'POST', '/sapi/v1/algo/spot/newOrderTwap', 'signed', 'algo.spot.newOrderTwap'],
  ['spot.openOrders', 'GET', '/sapi/v1/algo/spot/openOrders', 'signed', 'algo.spot.openOrders'],
  ['spot.cancelOrder', 'DELETE', '/sapi/v1/algo/spot/order', 'signed', 'algo.spot.cancelOrder'],
  ['spot.subOrders', 'GET', '/sapi/v1/algo/spot/subOrders', 'signed', 'algo.spot.subOrders'],
];

export const ALGO_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'algo',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
