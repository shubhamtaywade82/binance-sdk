# Spot — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

37 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `market.ping` | GET | `/api/v3/ping` | PUBLIC | `spot.market.ping` |
| `market.serverTime` | GET | `/api/v3/time` | PUBLIC | `spot.market.serverTime` |
| `market.exchangeInfo` | GET | `/api/v3/exchangeInfo` | PUBLIC | `spot.market.exchangeInfo` |
| `market.depth` | GET | `/api/v3/depth` | PUBLIC | `spot.market.depth` |
| `market.trades` | GET | `/api/v3/trades` | PUBLIC | `spot.market.trades` |
| `market.historicalTrades` | GET | `/api/v3/historicalTrades` | API_KEY | `spot.market.historicalTrades` |
| `market.aggTrades` | GET | `/api/v3/aggTrades` | PUBLIC | `spot.market.aggTrades` |
| `market.klines` | GET | `/api/v3/klines` | PUBLIC | `spot.market.klines` |
| `market.uiKlines` | GET | `/api/v3/uiKlines` | PUBLIC | `spot.market.uiKlines` |
| `market.avgPrice` | GET | `/api/v3/avgPrice` | PUBLIC | `spot.market.avgPrice` |
| `market.ticker24hr` | GET | `/api/v3/ticker/24hr` | PUBLIC | `spot.market.ticker24hr` |
| `market.tickerPrice` | GET | `/api/v3/ticker/price` | PUBLIC | `spot.market.tickerPrice` |
| `market.bookTicker` | GET | `/api/v3/ticker/bookTicker` | PUBLIC | `spot.market.bookTicker` |
| `market.rollingWindowTicker` | GET | `/api/v3/ticker` | PUBLIC | `spot.market.rollingWindowTicker` |
| `market.tradingDayTicker` | GET | `/api/v3/ticker/tradingDay` | PUBLIC | `spot.market.tradingDayTicker` |
| `trading.createOrder` | POST | `/api/v3/order` | SIGNED | `spot.trading.createOrder` |
| `trading.createTestOrder` | POST | `/api/v3/order/test` | SIGNED | `spot.trading.testOrder` |
| `trading.getOrder` | GET | `/api/v3/order` | SIGNED | `spot.trading.getOrder` |
| `trading.cancelOrder` | DELETE | `/api/v3/order` | SIGNED | `spot.trading.cancelOrder` |
| `trading.cancelOpenOrders` | DELETE | `/api/v3/openOrders` | SIGNED | `spot.trading.cancelOpenOrders` |
| `trading.getOpenOrders` | GET | `/api/v3/openOrders` | SIGNED | `spot.trading.getOpenOrders` |
| `trading.getAllOrders` | GET | `/api/v3/allOrders` | SIGNED | `spot.trading.getAllOrders` |
| `trading.cancelReplace` | POST | `/api/v3/order/cancelReplace` | SIGNED | `spot.trading.cancelReplaceOrder` |
| `trading.createOCO` | POST | `/api/v3/orderList/oco` | SIGNED | `spot.trading.createOCOOrder` |
| `trading.cancelOCO` | DELETE | `/api/v3/orderList` | SIGNED | `spot.trading.cancelOCOOrder` |
| `trading.getOCO` | GET | `/api/v3/orderList` | SIGNED | `spot.trading.getOCOOrder` |
| `trading.getOpenOCOs` | GET | `/api/v3/openOrderLists` | SIGNED | `spot.trading.getOpenOCOOrders` |
| `trading.getAllOCOs` | GET | `/api/v3/allOrderLists` | SIGNED | `spot.trading.getAllOCOOrders` |
| `trading.cancelOpenOCOs` | DELETE | `/api/v3/openOrderLists` | SIGNED | `spot.trading.cancelOpenOCOOrders` |
| `account.getAccount` | GET | `/api/v3/account` | SIGNED | `spot.trading.account` |
| `account.myTrades` | GET | `/api/v3/myTrades` | SIGNED | `spot.trading.myTrades` |
| `account.myPreventedMatches` | GET | `/api/v3/myPreventedMatches` | SIGNED | `spot.trading.myPreventedMatches` |
| `account.commission` | GET | `/api/v3/account/commission` | SIGNED | `spot.trading.accountCommission` |
| `account.orderRateLimit` | GET | `/api/v3/rateLimit/order` | SIGNED | `spot.trading.rateLimitOrder` |
| `userStream.create` | POST | `/api/v3/userDataStream` | API_KEY | `spot.userStream.createListenKey` |
| `userStream.keepAlive` | PUT | `/api/v3/userDataStream` | API_KEY | `spot.userStream.keepAliveListenKey` |
| `userStream.close` | DELETE | `/api/v3/userDataStream` | API_KEY | `spot.userStream.closeListenKey` |
