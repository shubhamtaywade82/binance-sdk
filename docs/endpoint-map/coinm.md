# COIN-M Futures — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

40 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `market.ping` | GET | `/dapi/v1/ping` | PUBLIC | `coinm.market.ping` |
| `market.serverTime` | GET | `/dapi/v1/time` | PUBLIC | `coinm.market.serverTime` |
| `market.exchangeInfo` | GET | `/dapi/v1/exchangeInfo` | PUBLIC | `coinm.market.exchangeInfo` |
| `market.depth` | GET | `/dapi/v1/depth` | PUBLIC | `coinm.market.depth` |
| `market.trades` | GET | `/dapi/v1/trades` | PUBLIC | `coinm.market.trades` |
| `market.historicalTrades` | GET | `/dapi/v1/historicalTrades` | API_KEY | `coinm.market.historicalTrades` |
| `market.aggTrades` | GET | `/dapi/v1/aggTrades` | PUBLIC | `coinm.market.aggTrades` |
| `market.klines` | GET | `/dapi/v1/klines` | PUBLIC | `coinm.market.klines` |
| `market.ticker24hr` | GET | `/dapi/v1/ticker/24hr` | PUBLIC | `coinm.market.ticker24hr` |
| `market.tickerPrice` | GET | `/dapi/v1/ticker/price` | PUBLIC | `coinm.market.tickerPrice` |
| `market.bookTicker` | GET | `/dapi/v1/ticker/bookTicker` | PUBLIC | `coinm.market.bookTicker` |
| `market.continuousKlines` | GET | `/dapi/v1/continuousKlines` | PUBLIC | `coinm.market.continuousKlines` |
| `market.indexPriceKlines` | GET | `/dapi/v1/indexPriceKlines` | PUBLIC | `coinm.market.indexPriceKlines` |
| `market.markPriceKlines` | GET | `/dapi/v1/markPriceKlines` | PUBLIC | `coinm.market.markPriceKlines` |
| `market.premiumIndex` | GET | `/dapi/v1/premiumIndex` | PUBLIC | `coinm.market.premiumIndex` |
| `market.fundingRateHistory` | GET | `/dapi/v1/fundingRate` | PUBLIC | `coinm.market.fundingRateHistory` |
| `market.openInterest` | GET | `/dapi/v1/openInterest` | PUBLIC | `coinm.market.openInterest` |
| `market.openInterestHist` | GET | `/futures/data/openInterestHist` | PUBLIC | `coinm.market.openInterestHist` |
| `account.balance` | GET | `/dapi/v1/balance` | SIGNED | `coinm.account.balance` |
| `account.account` | GET | `/dapi/v1/account` | SIGNED | `coinm.account.account` |
| `account.positionRisk` | GET | `/dapi/v1/positionRisk` | SIGNED | `coinm.account.positionRisk` |
| `account.incomeHistory` | GET | `/dapi/v1/income` | SIGNED | `coinm.account.incomeHistory` |
| `account.userTrades` | GET | `/dapi/v1/userTrades` | SIGNED | `coinm.account.userTrades` |
| `account.leverageBrackets` | GET | `/dapi/v1/leverageBracket` | SIGNED | `coinm.account.leverageBrackets` |
| `account.commissionRate` | GET | `/dapi/v1/commissionRate` | SIGNED | `coinm.account.commissionRate` |
| `account.positionMode` | GET | `/dapi/v1/positionSide/dual` | SIGNED | `coinm.account.positionMode` |
| `account.setPositionMode` | POST | `/dapi/v1/positionSide/dual` | SIGNED | `coinm.account.setPositionMode` |
| `trading.setLeverage` | POST | `/dapi/v1/leverage` | SIGNED | `coinm.trading.setLeverage` |
| `trading.setMarginType` | POST | `/dapi/v1/marginType` | SIGNED | `coinm.trading.setMarginType` |
| `trading.createOrder` | POST | `/dapi/v1/order` | SIGNED | `coinm.trading.createOrder` |
| `trading.createTestOrder` | POST | `/dapi/v1/order/test` | SIGNED | `coinm.trading.createTestOrder` |
| `trading.getOrder` | GET | `/dapi/v1/order` | SIGNED | `coinm.trading.getOrder` |
| `trading.cancelOrder` | DELETE | `/dapi/v1/order` | SIGNED | `coinm.trading.cancelOrder` |
| `trading.cancelAllOpenOrders` | DELETE | `/dapi/v1/allOpenOrders` | SIGNED | `coinm.trading.cancelAllOpenOrders` |
| `trading.getOpenOrders` | GET | `/dapi/v1/openOrders` | SIGNED | `coinm.trading.getOpenOrders` |
| `trading.getAllOrders` | GET | `/dapi/v1/allOrders` | SIGNED | `coinm.trading.getAllOrders` |
| `trading.modifyPositionMargin` | POST | `/dapi/v1/positionMargin` | SIGNED | `coinm.trading.modifyPositionMargin` |
| `userStream.create` | POST | `/dapi/v1/listenKey` | API_KEY | `coinm.userStream.createListenKey` |
| `userStream.keepAlive` | PUT | `/dapi/v1/listenKey` | API_KEY | `coinm.userStream.keepAliveListenKey` |
| `userStream.close` | DELETE | `/dapi/v1/listenKey` | API_KEY | `coinm.userStream.closeListenKey` |
