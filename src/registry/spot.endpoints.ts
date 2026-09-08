import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/**
 * [operation, method, path, auth, implementedBy] rows for the Spot product.
 * Paths are canonical (host + version prefix included).
 */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Market data (MarketDataBase / SpotMarket, base https://api.binance.com/api/v3) ----
  ['market.ping', 'GET', '/api/v3/ping', 'public', 'spot.market.ping'],
  ['market.serverTime', 'GET', '/api/v3/time', 'public', 'spot.market.serverTime'],
  ['market.exchangeInfo', 'GET', '/api/v3/exchangeInfo', 'public', 'spot.market.exchangeInfo'],
  ['market.depth', 'GET', '/api/v3/depth', 'public', 'spot.market.depth'],
  ['market.trades', 'GET', '/api/v3/trades', 'public', 'spot.market.trades'],
  ['market.historicalTrades', 'GET', '/api/v3/historicalTrades', 'apiKey', 'spot.market.historicalTrades'],
  ['market.aggTrades', 'GET', '/api/v3/aggTrades', 'public', 'spot.market.aggTrades'],
  ['market.klines', 'GET', '/api/v3/klines', 'public', 'spot.market.klines'],
  ['market.uiKlines', 'GET', '/api/v3/uiKlines', 'public', 'spot.market.uiKlines'],
  ['market.avgPrice', 'GET', '/api/v3/avgPrice', 'public', 'spot.market.avgPrice'],
  ['market.ticker24hr', 'GET', '/api/v3/ticker/24hr', 'public', 'spot.market.ticker24hr'],
  ['market.tickerPrice', 'GET', '/api/v3/ticker/price', 'public', 'spot.market.tickerPrice'],
  ['market.bookTicker', 'GET', '/api/v3/ticker/bookTicker', 'public', 'spot.market.bookTicker'],
  ['market.rollingWindowTicker', 'GET', '/api/v3/ticker', 'public', 'spot.market.rollingWindowTicker'],
  ['market.tradingDayTicker', 'GET', '/api/v3/ticker/tradingDay', 'public', 'spot.market.tradingDayTicker'],

  // ---- Trading (SpotTrading) ----
  ['trading.createOrder', 'POST', '/api/v3/order', 'signed', 'spot.trading.createOrder'],
  ['trading.createTestOrder', 'POST', '/api/v3/order/test', 'signed', 'spot.trading.testOrder'],
  ['trading.getOrder', 'GET', '/api/v3/order', 'signed', 'spot.trading.getOrder'],
  ['trading.cancelOrder', 'DELETE', '/api/v3/order', 'signed', 'spot.trading.cancelOrder'],
  ['trading.cancelOpenOrders', 'DELETE', '/api/v3/openOrders', 'signed', 'spot.trading.cancelOpenOrders'],
  ['trading.getOpenOrders', 'GET', '/api/v3/openOrders', 'signed', 'spot.trading.getOpenOrders'],
  ['trading.getAllOrders', 'GET', '/api/v3/allOrders', 'signed', 'spot.trading.getAllOrders'],
  ['trading.cancelReplace', 'POST', '/api/v3/order/cancelReplace', 'signed', 'spot.trading.cancelReplaceOrder'],
  ['trading.createOCO', 'POST', '/api/v3/orderList/oco', 'signed', 'spot.trading.createOCOOrder'],
  ['trading.cancelOCO', 'DELETE', '/api/v3/orderList', 'signed', 'spot.trading.cancelOCOOrder'],
  ['trading.getOCO', 'GET', '/api/v3/orderList', 'signed', 'spot.trading.getOCOOrder'],
  ['trading.getOpenOCOs', 'GET', '/api/v3/openOrderLists', 'signed', 'spot.trading.getOpenOCOOrders'],
  ['trading.getAllOCOs', 'GET', '/api/v3/allOrderLists', 'signed', 'spot.trading.getAllOCOOrders'],
  ['trading.cancelOpenOCOs', 'DELETE', '/api/v3/openOrderLists', 'signed', 'spot.trading.cancelOpenOCOOrders'],

  // ---- Account (SpotAccount, via SpotTrading.ts exports) ----
  ['account.getAccount', 'GET', '/api/v3/account', 'signed', 'spot.trading.account'],
  ['account.myTrades', 'GET', '/api/v3/myTrades', 'signed', 'spot.trading.myTrades'],
  ['account.myPreventedMatches', 'GET', '/api/v3/myPreventedMatches', 'signed', 'spot.trading.myPreventedMatches'],
  ['account.commission', 'GET', '/api/v3/account/commission', 'signed', 'spot.trading.accountCommission'],
  ['account.orderRateLimit', 'GET', '/api/v3/rateLimit/order', 'signed', 'spot.trading.rateLimitOrder'],

  // ---- User data stream (SpotUserDataStream) ----
  ['userStream.create', 'POST', '/api/v3/userDataStream', 'apiKey', 'spot.userStream.createListenKey'],
  ['userStream.keepAlive', 'PUT', '/api/v3/userDataStream', 'apiKey', 'spot.userStream.keepAliveListenKey'],
  ['userStream.close', 'DELETE', '/api/v3/userDataStream', 'apiKey', 'spot.userStream.closeListenKey'],
];

export const SPOT_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'spot',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
