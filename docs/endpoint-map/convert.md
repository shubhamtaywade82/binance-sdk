# Convert SAPI — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

9 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `convert.acceptQuote` | POST | `/sapi/v1/convert/acceptQuote` | SIGNED | `convert.acceptQuote` |
| `convert.getQuote` | POST | `/sapi/v1/convert/getQuote` | SIGNED | `convert.getQuote` |
| `convert.limit.cancelOrder` | POST | `/sapi/v1/convert/limit/cancelOrder` | SIGNED | `convert.limitCancelOrder` |
| `convert.limit.placeOrder` | POST | `/sapi/v1/convert/limit/placeOrder` | SIGNED | `convert.limitPlaceOrder` |
| `convert.limit.queryOpenOrders` | GET | `/sapi/v1/convert/limit/queryOpenOrders` | SIGNED | `convert.limitQueryOpenOrders` |
| `convert.orderStatus` | GET | `/sapi/v1/convert/orderStatus` | SIGNED | `convert.orderStatus` |
| `convert.tradeFlow` | GET | `/sapi/v1/convert/tradeFlow` | SIGNED | `convert.tradeFlow` |
| `convert.assetInfo` | GET | `/sapi/v1/convert/assetInfo` | SIGNED | `convert.assetInfo` |
| `convert.exchangeInfo` | GET | `/sapi/v1/convert/exchangeInfo` | SIGNED | `convert.exchangeInfo` |
