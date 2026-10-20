import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/**
 * [operation, method, path, auth, implementedBy] rows for Binance Options
 * (base https://eapi.binance.com/eapi/v1). The Options product exposes a
 * distinct surface from Spot/Futures: market data, account/bill, order
 * placement, position queries, exercise history, MMP, and block trading.
 */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Connectivity / market data (OptionsMarket) ----
  ['market.ping', 'GET', '/eapi/v1/ping', 'public', 'options.market.ping'],
  ['market.time', 'GET', '/eapi/v1/time', 'public', 'options.market.time'],
  ['market.exchangeInfo', 'GET', '/eapi/v1/exchangeInfo', 'public', 'options.market.exchangeInfo'],
  ['market.depth', 'GET', '/eapi/v1/depth', 'public', 'options.market.depth'],
  ['market.trades', 'GET', '/eapi/v1/trades', 'public', 'options.market.trades'],
  ['market.klines', 'GET', '/eapi/v1/klines', 'public', 'options.market.klines'],
  ['market.mark', 'GET', '/eapi/v1/mark', 'public', 'options.market.mark'],
  ['market.index', 'GET', '/eapi/v1/index', 'public', 'options.market.index'],
  ['market.ticker', 'GET', '/eapi/v1/ticker', 'public', 'options.market.ticker'],
  ['market.openInterest', 'GET', '/eapi/v1/openInterest', 'public', 'options.market.openInterest'],

  // ---- Account (OptionsAccount) ----
  ['account.marginAccount', 'GET', '/eapi/v1/marginAccount', 'signed', 'options.account.marginAccount'],
  ['account.bill', 'GET', '/eapi/v1/bill', 'signed', 'options.account.bill'],
  ['account.position', 'GET', '/eapi/v1/position', 'signed', 'options.account.position'],
  ['account.userTrades', 'GET', '/eapi/v1/userTrades', 'signed', 'options.account.userTrades'],
  ['account.commission', 'GET', '/eapi/v1/commission', 'signed', 'options.account.commission'],
  ['account.exerciseRecord', 'GET', '/eapi/v1/exerciseRecord', 'signed', 'options.account.exerciseRecord'],
  ['account.exerciseHistory', 'GET', '/eapi/v1/exerciseHistory', 'signed', 'options.account.exerciseHistory'],

  // ---- Trading (OptionsTrading) ----
  ['trading.placeOrder', 'POST', '/eapi/v1/order', 'signed', 'options.trading.placeOrder'],
  ['trading.batchOrders', 'POST', '/eapi/v1/batchOrders', 'signed', 'options.trading.batchOrders'],
  ['trading.cancelOrder', 'DELETE', '/eapi/v1/order', 'signed', 'options.trading.cancelOrder'],
  ['trading.cancelBatchOrders', 'DELETE', '/eapi/v1/batchOrders', 'signed', 'options.trading.cancelBatchOrders'],
  ['trading.cancelAllOpenOrders', 'DELETE', '/eapi/v1/allOpenOrders', 'signed', 'options.trading.cancelAllOpenOrders'],
  ['trading.openOrders', 'GET', '/eapi/v1/openOrders', 'signed', 'options.trading.openOrders'],
  ['trading.historyOrders', 'GET', '/eapi/v1/historyOrders', 'signed', 'options.trading.historyOrders'],
  ['trading.countdownCancelAll', 'POST', '/eapi/v1/countdownCancelAll', 'signed', 'options.trading.countdownCancelAll'],

  // ---- Market Maker Protection (OptionsMmp) ----
  ['mmp.get', 'GET', '/eapi/v1/mmp', 'signed', 'options.mmp.getMmp'],
  ['mmp.set', 'POST', '/eapi/v1/mmpSet', 'signed', 'options.mmp.setMmp'],
  ['mmp.reset', 'POST', '/eapi/v1/mmpReset', 'signed', 'options.mmp.resetMmp'],

  // ---- Block trading (OptionsBlockTrading) ----
  ['block.createOrder', 'POST', '/eapi/v1/block/order/create', 'signed', 'options.block.createOrder'],
  ['block.executeOrder', 'POST', '/eapi/v1/block/order/execute', 'signed', 'options.block.executeOrder'],
  ['block.orders', 'GET', '/eapi/v1/block/order/orders', 'signed', 'options.block.orders'],
  ['block.userTrades', 'GET', '/eapi/v1/block/user-trades', 'signed', 'options.block.userTrades'],
  ['block.trades', 'GET', '/eapi/v1/blockTrades', 'public', 'options.block.trades'],

  // ---- User data stream (OptionsUserDataStream) ----
  ['userStream.create', 'POST', '/eapi/v1/listenKey', 'apiKey', 'options.userStream.createListenKey'],
  ['userStream.keepAlive', 'PUT', '/eapi/v1/listenKey', 'apiKey', 'options.userStream.keepAliveListenKey'],
  ['userStream.close', 'DELETE', '/eapi/v1/listenKey', 'apiKey', 'options.userStream.closeListenKey'],
];

export const OPTIONS_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'options',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
