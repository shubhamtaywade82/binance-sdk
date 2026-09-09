import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/**
 * [operation, method, path, auth, implementedBy] rows for COIN-M Futures
 * (base https://dapi.binance.com/dapi/v1). Market data via CoinMMarket
 * (MarketDataBase + extensions), account via CoinMAccount, trading via
 * CoinMTrading.
 */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Market data (MarketDataBase on /dapi/v1) ----
  ['market.ping', 'GET', '/dapi/v1/ping', 'public', 'coinm.market.ping'],
  ['market.serverTime', 'GET', '/dapi/v1/time', 'public', 'coinm.market.serverTime'],
  ['market.exchangeInfo', 'GET', '/dapi/v1/exchangeInfo', 'public', 'coinm.market.exchangeInfo'],
  ['market.depth', 'GET', '/dapi/v1/depth', 'public', 'coinm.market.depth'],
  ['market.trades', 'GET', '/dapi/v1/trades', 'public', 'coinm.market.trades'],
  ['market.historicalTrades', 'GET', '/dapi/v1/historicalTrades', 'apiKey', 'coinm.market.historicalTrades'],
  ['market.aggTrades', 'GET', '/dapi/v1/aggTrades', 'public', 'coinm.market.aggTrades'],
  ['market.klines', 'GET', '/dapi/v1/klines', 'public', 'coinm.market.klines'],
  ['market.ticker24hr', 'GET', '/dapi/v1/ticker/24hr', 'public', 'coinm.market.ticker24hr'],
  ['market.tickerPrice', 'GET', '/dapi/v1/ticker/price', 'public', 'coinm.market.tickerPrice'],
  ['market.bookTicker', 'GET', '/dapi/v1/ticker/bookTicker', 'public', 'coinm.market.bookTicker'],

  // ---- Market data extensions (CoinMMarket) ----
  ['market.continuousKlines', 'GET', '/dapi/v1/continuousKlines', 'public', 'coinm.market.continuousKlines'],
  ['market.indexPriceKlines', 'GET', '/dapi/v1/indexPriceKlines', 'public', 'coinm.market.indexPriceKlines'],
  ['market.markPriceKlines', 'GET', '/dapi/v1/markPriceKlines', 'public', 'coinm.market.markPriceKlines'],
  ['market.premiumIndex', 'GET', '/dapi/v1/premiumIndex', 'public', 'coinm.market.premiumIndex'],
  ['market.fundingRateHistory', 'GET', '/dapi/v1/fundingRate', 'public', 'coinm.market.fundingRateHistory'],
  ['market.openInterest', 'GET', '/dapi/v1/openInterest', 'public', 'coinm.market.openInterest'],
  ['market.openInterestHist', 'GET', '/futures/data/openInterestHist', 'public', 'coinm.market.openInterestHist'],

  // ---- Account (CoinMAccount) ----
  ['account.balance', 'GET', '/dapi/v1/balance', 'signed', 'coinm.account.balance'],
  ['account.account', 'GET', '/dapi/v1/account', 'signed', 'coinm.account.account'],
  ['account.positionRisk', 'GET', '/dapi/v1/positionRisk', 'signed', 'coinm.account.positionRisk'],
  ['account.incomeHistory', 'GET', '/dapi/v1/income', 'signed', 'coinm.account.incomeHistory'],
  ['account.userTrades', 'GET', '/dapi/v1/userTrades', 'signed', 'coinm.account.userTrades'],
  ['account.leverageBrackets', 'GET', '/dapi/v1/leverageBracket', 'signed', 'coinm.account.leverageBrackets'],
  ['account.commissionRate', 'GET', '/dapi/v1/commissionRate', 'signed', 'coinm.account.commissionRate'],
  ['account.positionMode', 'GET', '/dapi/v1/positionSide/dual', 'signed', 'coinm.account.positionMode'],
  ['account.setPositionMode', 'POST', '/dapi/v1/positionSide/dual', 'signed', 'coinm.account.setPositionMode'],

  // ---- Trading (CoinMTrading) ----
  ['trading.setLeverage', 'POST', '/dapi/v1/leverage', 'signed', 'coinm.trading.setLeverage'],
  ['trading.setMarginType', 'POST', '/dapi/v1/marginType', 'signed', 'coinm.trading.setMarginType'],
  ['trading.createOrder', 'POST', '/dapi/v1/order', 'signed', 'coinm.trading.createOrder'],
  ['trading.createTestOrder', 'POST', '/dapi/v1/order/test', 'signed', 'coinm.trading.createTestOrder'],
  ['trading.getOrder', 'GET', '/dapi/v1/order', 'signed', 'coinm.trading.getOrder'],
  ['trading.cancelOrder', 'DELETE', '/dapi/v1/order', 'signed', 'coinm.trading.cancelOrder'],
  ['trading.cancelAllOpenOrders', 'DELETE', '/dapi/v1/allOpenOrders', 'signed', 'coinm.trading.cancelAllOpenOrders'],
  ['trading.getOpenOrders', 'GET', '/dapi/v1/openOrders', 'signed', 'coinm.trading.getOpenOrders'],
  ['trading.getAllOrders', 'GET', '/dapi/v1/allOrders', 'signed', 'coinm.trading.getAllOrders'],
  ['trading.modifyPositionMargin', 'POST', '/dapi/v1/positionMargin', 'signed', 'coinm.trading.modifyPositionMargin'],

  // ---- User data stream (CoinMUserDataStream) ----
  ['userStream.create', 'POST', '/dapi/v1/listenKey', 'apiKey', 'coinm.userStream.createListenKey'],
  ['userStream.keepAlive', 'PUT', '/dapi/v1/listenKey', 'apiKey', 'coinm.userStream.keepAliveListenKey'],
  ['userStream.close', 'DELETE', '/dapi/v1/listenKey', 'apiKey', 'coinm.userStream.closeListenKey'],
];

export const COINM_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'coinm',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
