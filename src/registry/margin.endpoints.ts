import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Margin (SAPI). */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['account.crossMarginAccount', 'GET', '/sapi/v1/margin/account', 'signed', 'margin.account.crossAccount'],
  ['account.isolatedMarginAccount', 'GET', '/sapi/v1/margin/isolated/account', 'signed', 'margin.account.isolatedAccount'],
  ['account.maxBorrowable', 'GET', '/sapi/v1/margin/maxBorrowable', 'signed', 'margin.account.maxBorrowable'],
  ['account.maxTransferable', 'GET', '/sapi/v1/margin/maxTransferable', 'signed', 'margin.account.maxTransferable'],
  ['borrowRepay.record', 'GET', '/sapi/v1/margin/borrow-repay', 'signed', 'margin.account.borrowRepayRecord'],
  ['account.interestHistory', 'GET', '/sapi/v1/margin/interestHistory', 'signed', 'margin.account.interestHistory'],
  ['account.forceLiquidationRecord', 'GET', '/sapi/v1/margin/forceLiquidationRec', 'signed', 'margin.account.forceLiquidationRecord'],
  ['account.priceIndex', 'GET', '/sapi/v1/margin/priceIndex', 'public', 'margin.account.priceIndex'],
  ['trading.borrowRepay', 'POST', '/sapi/v1/margin/borrow-repay', 'signed', 'margin.trading.borrowRepay'],
  ['transfer.crossMargin', 'POST', '/sapi/v1/margin/transfer', 'signed', 'margin.trading.transfer'],
  ['transfer.isolatedMargin', 'POST', '/sapi/v1/margin/isolated/transfer', 'signed', 'margin.trading.isolatedTransfer'],
  ['trading.createOrder', 'POST', '/sapi/v1/margin/order', 'signed', 'margin.trading.createOrder'],
  ['trading.cancelOrder', 'DELETE', '/sapi/v1/margin/order', 'signed', 'margin.trading.cancelOrder'],
  ['trading.cancelAllOpenOrders', 'DELETE', '/sapi/v1/margin/openOrders', 'signed', 'margin.trading.cancelAllOpenOrders'],
  ['trading.getOrder', 'GET', '/sapi/v1/margin/order', 'signed', 'margin.trading.getOrder'],
  ['trading.getOpenOrders', 'GET', '/sapi/v1/margin/openOrders', 'signed', 'margin.trading.getOpenOrders'],
  ['trading.getAllOrders', 'GET', '/sapi/v1/margin/allOrders', 'signed', 'margin.trading.getAllOrders'],
  ['trading.myTrades', 'GET', '/sapi/v1/margin/myTrades', 'signed', 'margin.trading.myTrades'],
];

export const MARGIN_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'margin',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
