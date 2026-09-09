# Margin — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

18 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `account.crossMarginAccount` | GET | `/sapi/v1/margin/account` | SIGNED | `margin.account.crossAccount` |
| `account.isolatedMarginAccount` | GET | `/sapi/v1/margin/isolated/account` | SIGNED | `margin.account.isolatedAccount` |
| `account.maxBorrowable` | GET | `/sapi/v1/margin/maxBorrowable` | SIGNED | `margin.account.maxBorrowable` |
| `account.maxTransferable` | GET | `/sapi/v1/margin/maxTransferable` | SIGNED | `margin.account.maxTransferable` |
| `borrowRepay.record` | GET | `/sapi/v1/margin/borrow-repay` | SIGNED | `margin.account.borrowRepayRecord` |
| `account.interestHistory` | GET | `/sapi/v1/margin/interestHistory` | SIGNED | `margin.account.interestHistory` |
| `account.forceLiquidationRecord` | GET | `/sapi/v1/margin/forceLiquidationRec` | SIGNED | `margin.account.forceLiquidationRecord` |
| `account.priceIndex` | GET | `/sapi/v1/margin/priceIndex` | PUBLIC | `margin.account.priceIndex` |
| `trading.borrowRepay` | POST | `/sapi/v1/margin/borrow-repay` | SIGNED | `margin.trading.borrowRepay` |
| `transfer.crossMargin` | POST | `/sapi/v1/margin/transfer` | SIGNED | `margin.trading.transfer` |
| `transfer.isolatedMargin` | POST | `/sapi/v1/margin/isolated/transfer` | SIGNED | `margin.trading.isolatedTransfer` |
| `trading.createOrder` | POST | `/sapi/v1/margin/order` | SIGNED | `margin.trading.createOrder` |
| `trading.cancelOrder` | DELETE | `/sapi/v1/margin/order` | SIGNED | `margin.trading.cancelOrder` |
| `trading.cancelAllOpenOrders` | DELETE | `/sapi/v1/margin/openOrders` | SIGNED | `margin.trading.cancelAllOpenOrders` |
| `trading.getOrder` | GET | `/sapi/v1/margin/order` | SIGNED | `margin.trading.getOrder` |
| `trading.getOpenOrders` | GET | `/sapi/v1/margin/openOrders` | SIGNED | `margin.trading.getOpenOrders` |
| `trading.getAllOrders` | GET | `/sapi/v1/margin/allOrders` | SIGNED | `margin.trading.getAllOrders` |
| `trading.myTrades` | GET | `/sapi/v1/margin/myTrades` | SIGNED | `margin.trading.myTrades` |
