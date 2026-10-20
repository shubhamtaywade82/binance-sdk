import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Convert SAPI. */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['convert.acceptQuote', 'POST', '/sapi/v1/convert/acceptQuote', 'signed', 'convert.acceptQuote'],
  ['convert.getQuote', 'POST', '/sapi/v1/convert/getQuote', 'signed', 'convert.getQuote'],
  ['convert.limit.cancelOrder', 'POST', '/sapi/v1/convert/limit/cancelOrder', 'signed', 'convert.limitCancelOrder'],
  ['convert.limit.placeOrder', 'POST', '/sapi/v1/convert/limit/placeOrder', 'signed', 'convert.limitPlaceOrder'],
  ['convert.limit.queryOpenOrders', 'GET', '/sapi/v1/convert/limit/queryOpenOrders', 'signed', 'convert.limitQueryOpenOrders'],
  ['convert.orderStatus', 'GET', '/sapi/v1/convert/orderStatus', 'signed', 'convert.orderStatus'],
  ['convert.tradeFlow', 'GET', '/sapi/v1/convert/tradeFlow', 'signed', 'convert.tradeFlow'],
  ['convert.assetInfo', 'GET', '/sapi/v1/convert/assetInfo', 'signed', 'convert.assetInfo'],
  ['convert.exchangeInfo', 'GET', '/sapi/v1/convert/exchangeInfo', 'signed', 'convert.exchangeInfo'],
];

export const CONVERT_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'convert',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
