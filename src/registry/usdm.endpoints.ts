import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/**
 * [operation, method, path, auth, implementedBy] rows for USDⓈ-M Futures.
 * Market-data rows come from MarketDataBase (base https://fapi.binance.com/fapi/v1),
 * account/trading from FuturesAccount/FuturesTrading (same base), market-analytics
 * from FuturesMarket/FuturesData (fapi/v1, /fapi/v2, /fapi/v3, /futures/data).
 */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Market data (MarketDataBase on /fapi/v1) ----
  ['market.ping', 'GET', '/fapi/v1/ping', 'public', 'futures.market.ping'],
  ['market.serverTime', 'GET', '/fapi/v1/time', 'public', 'futures.market.serverTime'],
  ['market.exchangeInfo', 'GET', '/fapi/v1/exchangeInfo', 'public', 'futures.market.exchangeInfo'],
  ['market.depth', 'GET', '/fapi/v1/depth', 'public', 'futures.market.depth'],
  ['market.trades', 'GET', '/fapi/v1/trades', 'public', 'futures.market.trades'],
  ['market.historicalTrades', 'GET', '/fapi/v1/historicalTrades', 'apiKey', 'futures.market.historicalTrades'],
  ['market.aggTrades', 'GET', '/fapi/v1/aggTrades', 'public', 'futures.market.aggTrades'],
  ['market.klines', 'GET', '/fapi/v1/klines', 'public', 'futures.market.klines'],
  ['market.ticker24hr', 'GET', '/fapi/v1/ticker/24hr', 'public', 'futures.market.ticker24hr'],
  ['market.tickerPrice', 'GET', '/fapi/v1/ticker/price', 'public', 'futures.market.tickerPrice'],
  ['market.bookTicker', 'GET', '/fapi/v1/ticker/bookTicker', 'public', 'futures.market.bookTicker'],

  // ---- Market data extensions (FuturesMarket) ----
  ['market.continuousKlines', 'GET', '/fapi/v1/continuousKlines', 'public', 'futures.market.continuousKlines'],
  ['market.indexPriceKlines', 'GET', '/fapi/v1/indexPriceKlines', 'public', 'futures.market.indexPriceKlines'],
  ['market.markPriceKlines', 'GET', '/fapi/v1/markPriceKlines', 'public', 'futures.market.markPriceKlines'],
  ['market.premiumIndexKlines', 'GET', '/fapi/v1/premiumIndexKlines', 'public', 'futures.market.premiumIndexKlines'],
  ['market.rpiDepth', 'GET', '/fapi/v1/rpiDepth', 'public', 'futures.market.rpiDepth'],
  ['market.tradingDayTicker', 'GET', '/fapi/v1/tradingDayTicker', 'public', 'futures.market.tradingDayTicker'],
  ['market.tickerPriceV2', 'GET', '/fapi/v2/ticker/price', 'public', 'futures.market.tickerPriceV2'],
  ['market.bookTickerV2', 'GET', '/fapi/v2/ticker/bookTicker', 'public', 'futures.market.bookTickerV2'],

  // ---- Market analytics (FuturesData; fapi/v1 hosts + /futures/data hosts) ----
  ['data.fundingRateHistory', 'GET', '/fapi/v1/fundingRate', 'public', 'futures.data.fundingRateHistory'],
  ['data.premiumIndex', 'GET', '/fapi/v1/premiumIndex', 'public', 'futures.data.premiumIndex'],
  ['data.openInterest', 'GET', '/fapi/v1/openInterest', 'public', 'futures.data.openInterest'],
  ['data.openInterestHist', 'GET', '/futures/data/openInterestHist', 'public', 'futures.data.openInterestHist'],
  ['data.topLongShortAccountRatio', 'GET', '/futures/data/topLongShortAccountRatio', 'public', 'futures.data.topLongShortAccountRatio'],
  ['data.topLongShortPositionRatio', 'GET', '/futures/data/topLongShortPositionRatio', 'public', 'futures.data.topLongShortPositionRatio'],
  ['data.globalLongShortAccountRatio', 'GET', '/futures/data/globalLongShortAccountRatio', 'public', 'futures.data.globalLongShortAccountRatio'],
  ['data.takerLongShortRatio', 'GET', '/futures/data/takerlongshortRatio', 'public', 'futures.data.takerLongShortRatio'],
  ['data.basis', 'GET', '/futures/data/basis', 'public', 'futures.data.basis'],
  ['data.insuranceBalance', 'GET', '/futures/data/insuranceBalance', 'public', 'futures.data.insuranceFundBalance'],
  ['data.deliveryPrice', 'GET', '/futures/data/delivery-price', 'public', 'futures.data.deliveryPrice'],
  ['data.fundingInfo', 'GET', '/fapi/v1/fundingInfo', 'public', 'futures.data.fundingInfo'],
  ['data.assetIndex', 'GET', '/fapi/v1/assetIndex', 'public', 'futures.data.assetIndex'],
  ['data.indexInfo', 'GET', '/fapi/v1/indexInfo', 'public', 'futures.data.compositeIndexInfo'],
  ['data.adlQuantile', 'GET', '/fapi/v1/adlQuantile', 'signed', 'futures.data.adlQuantile'],
  ['data.lvtKlines', 'GET', '/fapi/v1/lvtKlines', 'public', 'futures.data.blvtInfo'],
  ['data.constituents', 'GET', '/fapi/v1/constituents', 'public', 'futures.data.indexPriceConstituents'],
  ['data.symbolConfig', 'GET', '/fapi/v1/symbolConfig', 'signed', 'futures.data.symbolConfig'],
  ['data.forceOrders', 'GET', '/fapi/v1/forceOrders', 'signed', 'futures.data.forceOrders'],
  ['data.pmExchangeInfo', 'GET', '/fapi/v1/pmExchangeInfo', 'public', 'futures.data.pmExchangeInfo'],
  ['data.delistSchedule', 'GET', '/fapi/v1/delistSchedule', 'public', 'futures.data.delistSchedule'],
  ['data.symbolAdlRisk', 'GET', '/fapi/v1/symbolAdlRisk', 'signed', 'futures.data.symbolAdlRisk'],

  // ---- Account (FuturesAccount) ----
  ['account.balanceV2', 'GET', '/fapi/v2/balance', 'signed', 'futures.account.balance'],
  ['account.accountV2', 'GET', '/fapi/v2/account', 'signed', 'futures.account.account'],
  ['account.positionRiskV2', 'GET', '/fapi/v2/positionRisk', 'signed', 'futures.account.positionRisk'],
  ['account.balanceV3', 'GET', '/fapi/v3/balance', 'signed', 'futures.account.balanceV3'],
  ['account.accountV3', 'GET', '/fapi/v3/account', 'signed', 'futures.account.accountV3'],
  ['account.positionRiskV3', 'GET', '/fapi/v3/positionRisk', 'signed', 'futures.account.positionRiskV3'],
  ['account.income', 'GET', '/fapi/v1/income', 'signed', 'futures.account.incomeHistory'],
  ['account.userTrades', 'GET', '/fapi/v1/userTrades', 'signed', 'futures.account.userTrades'],
  ['account.leverageBracket', 'GET', '/fapi/v1/leverageBracket', 'signed', 'futures.account.leverageBrackets'],
  ['account.commissionRate', 'GET', '/fapi/v1/commissionRate', 'signed', 'futures.account.getCommissionRate'],
  ['account.multiAssetsMargin', 'GET', '/fapi/v1/multiAssetsMargin', 'signed', 'futures.account.multiAssetsMargin'],
  ['account.setMultiAssetsMargin', 'POST', '/fapi/v1/multiAssetsMargin', 'signed', 'futures.account.setMultiAssetsMargin'],
  ['account.feeBurn', 'GET', '/fapi/v1/feeBurn', 'signed', 'futures.account.feeBurnStatus'],
  ['account.setFeeBurn', 'POST', '/fapi/v1/feeBurn', 'signed', 'futures.account.setFeeBurnStatus'],
  ['account.positionMode', 'GET', '/fapi/v1/positionSide/dual', 'signed', 'futures.account.positionMode'],
  ['account.setPositionMode', 'POST', '/fapi/v1/positionSide/dual', 'signed', 'futures.account.setPositionMode'],
  ['account.apiTradingStatus', 'GET', '/fapi/v1/apiTradingStatus', 'signed', 'futures.account.apiTradingStatus'],
  ['account.positionMarginHistory', 'GET', '/fapi/v1/positionMargin/history', 'signed', 'futures.account.getPositionMarginHistory'],
  ['account.orderRateLimit', 'GET', '/fapi/v1/rateLimit/order', 'signed', 'futures.account.rateLimitOrder'],
  ['account.accountConfig', 'GET', '/fapi/v1/accountConfig', 'signed', 'futures.account.getAccountConfig'],
  ['account.pmAccountInfo', 'GET', '/fapi/v1/pmAccountInfo', 'signed', 'futures.account.getPmAccountInfo'],
  ['account.incomeDownloadId', 'GET', '/fapi/v1/income/asyn', 'signed', 'futures.account.requestIncomeDownload'],
  ['account.incomeDownloadStatus', 'GET', '/fapi/v1/income/asyn/id', 'signed', 'futures.account.getIncomeDownloadStatus'],
  ['account.orderDownloadId', 'GET', '/fapi/v1/order/asyn', 'signed', 'futures.account.requestOrderDownload'],
  ['account.orderDownloadStatus', 'GET', '/fapi/v1/order/asyn/id', 'signed', 'futures.account.getOrderDownloadStatus'],
  ['account.tradeDownloadId', 'GET', '/fapi/v1/trade/asyn', 'signed', 'futures.account.requestTradeDownload'],
  ['account.tradeDownloadStatus', 'GET', '/fapi/v1/trade/asyn/id', 'signed', 'futures.account.getTradeDownloadStatus'],

  // ---- Trading (FuturesTrading) ----
  ['trading.setLeverage', 'POST', '/fapi/v1/leverage', 'signed', 'futures.trading.setLeverage'],
  ['trading.createOrder', 'POST', '/fapi/v1/order', 'signed', 'futures.trading.createOrder'],
  ['trading.createTestOrder', 'POST', '/fapi/v1/order/test', 'signed', 'futures.trading.createTestOrder'],
  ['trading.getOrder', 'GET', '/fapi/v1/order', 'signed', 'futures.trading.getOrder'],
  ['trading.cancelOrder', 'DELETE', '/fapi/v1/order', 'signed', 'futures.trading.cancelOrder'],
  ['trading.getOpenOrder', 'GET', '/fapi/v1/openOrder', 'signed', 'futures.trading.getCurrentOrder'],
  ['trading.getOpenOrders', 'GET', '/fapi/v1/openOrders', 'signed', 'futures.trading.getOpenOrders'],
  ['trading.getAllOrders', 'GET', '/fapi/v1/allOrders', 'signed', 'futures.trading.getAllOrders'],
  ['trading.cancelAllOpenOrders', 'DELETE', '/fapi/v1/allOpenOrders', 'signed', 'futures.trading.cancelAllOpenOrders'],
  ['trading.modifyOrder', 'PUT', '/fapi/v1/order', 'signed', 'futures.trading.modifyOrder'],
  ['trading.createBatchOrders', 'POST', '/fapi/v1/batchOrders', 'signed', 'futures.trading.createBatchOrders'],
  ['trading.modifyBatchOrders', 'PUT', '/fapi/v1/batchOrders', 'signed', 'futures.trading.modifyBatchOrders'],
  ['trading.cancelBatchOrders', 'DELETE', '/fapi/v1/batchOrders', 'signed', 'futures.trading.cancelBatchOrders'],
  ['trading.orderModifyHistory', 'GET', '/fapi/v1/orderAmendment', 'signed', 'futures.trading.getOrderModifyHistory'],
  ['trading.setMarginType', 'POST', '/fapi/v1/marginType', 'signed', 'futures.trading.setMarginType'],
  ['trading.modifyPositionMargin', 'POST', '/fapi/v1/positionMargin', 'signed', 'futures.trading.modifyPositionMargin'],
  ['trading.setCountdownCancelAll', 'POST', '/fapi/v1/countdownCancelAll', 'signed', 'futures.trading.setCountdownCancelAll'],

  // ---- Algo orders (FuturesTrading) ----
  ['trading.createAlgoOrder', 'POST', '/fapi/v1/algoOrder', 'signed', 'futures.trading.createAlgoOrder'],
  ['trading.cancelAlgoOrder', 'DELETE', '/fapi/v1/algoOrder', 'signed', 'futures.trading.cancelAlgoOrder'],
  ['trading.cancelAllOpenAlgoOrders', 'DELETE', '/fapi/v1/algoOpenOrders', 'signed', 'futures.trading.cancelAllOpenAlgoOrders'],
  ['trading.getAlgoOrder', 'GET', '/fapi/v1/algoOrder', 'signed', 'futures.trading.getAlgoOrder'],
  ['trading.getOpenAlgoOrders', 'GET', '/fapi/v1/openAlgoOrders', 'signed', 'futures.trading.getOpenAlgoOrders'],
  ['trading.getAllAlgoOrders', 'GET', '/fapi/v1/allAlgoOrders', 'signed', 'futures.trading.getAllAlgoOrders'],

  // ---- Convert (served from the futures host) ----
  ['convert.exchangeInfo', 'GET', '/fapi/v1/convert/exchangeInfo', 'public', 'futures.trading.convertExchangeInfo'],
  ['convert.getQuote', 'POST', '/fapi/v1/convert/getQuote', 'signed', 'futures.trading.convertGetQuote'],
  ['convert.acceptQuote', 'POST', '/fapi/v1/convert/acceptQuote', 'signed', 'futures.trading.convertAcceptQuote'],
  ['convert.orderStatus', 'GET', '/fapi/v1/convert/orderStatus', 'signed', 'futures.trading.convertOrderStatus'],

  // ---- User data stream (UserDataStream) ----
  ['userStream.create', 'POST', '/fapi/v1/listenKey', 'apiKey', 'futures.userStream.createListenKey'],
  ['userStream.keepAlive', 'PUT', '/fapi/v1/listenKey', 'apiKey', 'futures.userStream.keepAliveListenKey'],
  ['userStream.close', 'DELETE', '/fapi/v1/listenKey', 'apiKey', 'futures.userStream.closeListenKey'],
];

export const USDM_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'usdm',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
