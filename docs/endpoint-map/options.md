# Options — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

43 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `options.cancelAllOptionOrdersByUnderlyingTrade` | DELETE | `/eapi/v1/allOpenOrdersByUnderlying` | SIGNED | `options.cancelAllOptionOrdersByUnderlyingTrade` |
| `options.cancelBlockTradeOrderTrade` | DELETE | `/eapi/v1/block/order/create` | SIGNED | `options.cancelBlockTradeOrderTrade` |
| `options.queryBlockTradeDetailsUserData` | GET | `/eapi/v1/block/order/execute` | SIGNED | `options.queryBlockTradeDetailsUserData` |
| `options.getAutoCancelAllOpenOrdersKillSwitchConfigTrade` | GET | `/eapi/v1/countdownCancelAll` | SIGNED | `options.getAutoCancelAllOpenOrdersKillSwitchConfigTrade` |
| `options.querySingleOrderTrade` | GET | `/eapi/v1/order` | SIGNED | `options.querySingleOrderTrade` |
| `options.autoCancelAllOpenOrdersKillSwitchHeartbeatTrade` | POST | `/eapi/v1/countdownCancelAllHeartBeat` | SIGNED | `options.autoCancelAllOpenOrdersKillSwitchHeartbeatTrade` |
| `options.extendBlockTradeOrderTrade` | PUT | `/eapi/v1/block/order/create` | SIGNED | `options.extendBlockTradeOrderTrade` |
| `market.ping` | GET | `/eapi/v1/ping` | PUBLIC | `options.market.ping` |
| `market.time` | GET | `/eapi/v1/time` | PUBLIC | `options.market.time` |
| `market.exchangeInfo` | GET | `/eapi/v1/exchangeInfo` | PUBLIC | `options.market.exchangeInfo` |
| `market.depth` | GET | `/eapi/v1/depth` | PUBLIC | `options.market.depth` |
| `market.trades` | GET | `/eapi/v1/trades` | PUBLIC | `options.market.trades` |
| `market.klines` | GET | `/eapi/v1/klines` | PUBLIC | `options.market.klines` |
| `market.mark` | GET | `/eapi/v1/mark` | PUBLIC | `options.market.mark` |
| `market.index` | GET | `/eapi/v1/index` | PUBLIC | `options.market.index` |
| `market.ticker` | GET | `/eapi/v1/ticker` | PUBLIC | `options.market.ticker` |
| `market.openInterest` | GET | `/eapi/v1/openInterest` | PUBLIC | `options.market.openInterest` |
| `account.marginAccount` | GET | `/eapi/v1/marginAccount` | SIGNED | `options.account.marginAccount` |
| `account.bill` | GET | `/eapi/v1/bill` | SIGNED | `options.account.bill` |
| `account.position` | GET | `/eapi/v1/position` | SIGNED | `options.account.position` |
| `account.userTrades` | GET | `/eapi/v1/userTrades` | SIGNED | `options.account.userTrades` |
| `account.commission` | GET | `/eapi/v1/commission` | SIGNED | `options.account.commission` |
| `account.exerciseRecord` | GET | `/eapi/v1/exerciseRecord` | SIGNED | `options.account.exerciseRecord` |
| `account.exerciseHistory` | GET | `/eapi/v1/exerciseHistory` | SIGNED | `options.account.exerciseHistory` |
| `trading.placeOrder` | POST | `/eapi/v1/order` | SIGNED | `options.trading.placeOrder` |
| `trading.batchOrders` | POST | `/eapi/v1/batchOrders` | SIGNED | `options.trading.batchOrders` |
| `trading.cancelOrder` | DELETE | `/eapi/v1/order` | SIGNED | `options.trading.cancelOrder` |
| `trading.cancelBatchOrders` | DELETE | `/eapi/v1/batchOrders` | SIGNED | `options.trading.cancelBatchOrders` |
| `trading.cancelAllOpenOrders` | DELETE | `/eapi/v1/allOpenOrders` | SIGNED | `options.trading.cancelAllOpenOrders` |
| `trading.openOrders` | GET | `/eapi/v1/openOrders` | SIGNED | `options.trading.openOrders` |
| `trading.historyOrders` | GET | `/eapi/v1/historyOrders` | SIGNED | `options.trading.historyOrders` |
| `trading.countdownCancelAll` | POST | `/eapi/v1/countdownCancelAll` | SIGNED | `options.trading.countdownCancelAll` |
| `mmp.get` | GET | `/eapi/v1/mmp` | SIGNED | `options.mmp.getMmp` |
| `mmp.set` | POST | `/eapi/v1/mmpSet` | SIGNED | `options.mmp.setMmp` |
| `mmp.reset` | POST | `/eapi/v1/mmpReset` | SIGNED | `options.mmp.resetMmp` |
| `block.createOrder` | POST | `/eapi/v1/block/order/create` | SIGNED | `options.block.createOrder` |
| `block.executeOrder` | POST | `/eapi/v1/block/order/execute` | SIGNED | `options.block.executeOrder` |
| `block.orders` | GET | `/eapi/v1/block/order/orders` | SIGNED | `options.block.orders` |
| `block.userTrades` | GET | `/eapi/v1/block/user-trades` | SIGNED | `options.block.userTrades` |
| `block.trades` | GET | `/eapi/v1/blockTrades` | PUBLIC | `options.block.trades` |
| `userStream.create` | POST | `/eapi/v1/listenKey` | API_KEY | `options.userStream.createListenKey` |
| `userStream.keepAlive` | PUT | `/eapi/v1/listenKey` | API_KEY | `options.userStream.keepAliveListenKey` |
| `userStream.close` | DELETE | `/eapi/v1/listenKey` | API_KEY | `options.userStream.closeListenKey` |
