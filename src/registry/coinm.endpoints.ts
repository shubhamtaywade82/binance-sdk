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
  // Async reporting endpoints (added to close the COIN-M gap).
  ['account.incomeDownloadId', 'GET', '/dapi/v1/income/asyn', 'signed', 'coinm.account.requestIncomeDownload'],
  ['account.incomeDownloadStatus', 'GET', '/dapi/v1/income/asyn/id', 'signed', 'coinm.account.getIncomeDownloadStatus'],
  ['account.orderDownloadId', 'GET', '/dapi/v1/order/asyn', 'signed', 'coinm.account.requestOrderDownload'],
  ['account.orderDownloadStatus', 'GET', '/dapi/v1/order/asyn/id', 'signed', 'coinm.account.getOrderDownloadStatus'],
  ['account.tradeDownloadId', 'GET', '/dapi/v1/trade/asyn', 'signed', 'coinm.account.requestTradeDownload'],
  ['account.tradeDownloadStatus', 'GET', '/dapi/v1/trade/asyn/id', 'signed', 'coinm.account.getTradeDownloadStatus'],
  ['account.leverageBracketsV2', 'GET', '/dapi/v2/leverageBracket', 'signed', 'coinm.account.leverageBracketsV2'],
  ['account.pmAccountInfo', 'GET', '/dapi/v1/pmAccountInfo', 'signed', 'coinm.account.pmAccountInfo'],
  ['account.forceOrders', 'GET', '/dapi/v1/forceOrders', 'signed', 'coinm.account.forceOrders'],
  ['account.positionMarginHistory', 'GET', '/dapi/v1/positionMargin/history', 'signed', 'coinm.account.positionMarginHistory'],

  // ---- Trading (CoinMTrading) ----
  ['trading.setLeverage', 'POST', '/dapi/v1/leverage', 'signed', 'coinm.trading.setLeverage'],
  ['trading.setMarginType', 'POST', '/dapi/v1/marginType', 'signed', 'coinm.trading.setMarginType'],
  ['trading.createOrder', 'POST', '/dapi/v1/order', 'signed', 'coinm.trading.createOrder'],
  ['trading.createTestOrder', 'POST', '/dapi/v1/order/test', 'signed', 'coinm.trading.createTestOrder'],
  ['trading.getOrder', 'GET', '/dapi/v1/order', 'signed', 'coinm.trading.getOrder'],
  ['trading.modifyOrder', 'PUT', '/dapi/v1/order', 'signed', 'coinm.trading.modifyOrder'],
  ['trading.cancelOrder', 'DELETE', '/dapi/v1/order', 'signed', 'coinm.trading.cancelOrder'],
  ['trading.cancelAllOpenOrders', 'DELETE', '/dapi/v1/allOpenOrders', 'signed', 'coinm.trading.cancelAllOpenOrders'],
  ['trading.getOpenOrder', 'GET', '/dapi/v1/openOrder', 'signed', 'coinm.trading.getCurrentOrder'],
  ['trading.getOpenOrders', 'GET', '/dapi/v1/openOrders', 'signed', 'coinm.trading.getOpenOrders'],
  ['trading.getAllOrders', 'GET', '/dapi/v1/allOrders', 'signed', 'coinm.trading.getAllOrders'],
  ['trading.modifyPositionMargin', 'POST', '/dapi/v1/positionMargin', 'signed', 'coinm.trading.modifyPositionMargin'],
  ['trading.createBatchOrders', 'POST', '/dapi/v1/batchOrders', 'signed', 'coinm.trading.createBatchOrders'],
  ['trading.modifyBatchOrders', 'PUT', '/dapi/v1/batchOrders', 'signed', 'coinm.trading.modifyBatchOrders'],
  ['trading.cancelBatchOrders', 'DELETE', '/dapi/v1/batchOrders', 'signed', 'coinm.trading.cancelBatchOrders'],
  ['trading.setCountdownCancelAll', 'POST', '/dapi/v1/countdownCancelAll', 'signed', 'coinm.trading.setCountdownCancelAll'],
  ['trading.getOrderAmendHistory', 'GET', '/dapi/v1/orderAmendment', 'signed', 'coinm.trading.getOrderAmendHistory'],
  ['trading.adlQuantile', 'GET', '/dapi/v1/adlQuantile', 'signed', 'coinm.trading.adlQuantile'],

  // ---- Market data extensions (CoinMMarket) — gap closure ----
  ['market.constituents', 'GET', '/dapi/v1/constituents', 'public', 'coinm.market.constituents'],
  ['market.fundingInfo', 'GET', '/dapi/v1/fundingInfo', 'public', 'coinm.market.fundingInfo'],
  ['market.premiumIndexKlines', 'GET', '/dapi/v1/premiumIndexKlines', 'public', 'coinm.market.premiumIndexKlines'],

  // ---- Futures analytics (CoinMData; /futures/data host) ----
  ['data.basis', 'GET', '/futures/data/basis', 'public', 'coinm.data.basis'],
  ['data.globalLongShortAccountRatio', 'GET', '/futures/data/globalLongShortAccountRatio', 'public', 'coinm.data.globalLongShortAccountRatio'],
  ['data.takerBuySellVol', 'GET', '/futures/data/takerBuySellVol', 'public', 'coinm.data.takerBuySellVol'],
  ['data.topLongShortAccountRatio', 'GET', '/futures/data/topLongShortAccountRatio', 'public', 'coinm.data.topLongShortAccountRatio'],
  ['data.topLongShortPositionRatio', 'GET', '/futures/data/topLongShortPositionRatio', 'public', 'coinm.data.topLongShortPositionRatio'],

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
