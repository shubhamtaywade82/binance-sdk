# Algo SAPI — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

12 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `futures.historicalOrders` | GET | `/sapi/v1/algo/futures/historicalOrders` | SIGNED | `algo.futures.historicalOrders` |
| `futures.newOrderTwap` | POST | `/sapi/v1/algo/futures/newOrderTwap` | SIGNED | `algo.futures.newOrderTwap` |
| `futures.newOrderVp` | POST | `/sapi/v1/algo/futures/newOrderVp` | SIGNED | `algo.futures.newOrderVp` |
| `futures.openOrders` | GET | `/sapi/v1/algo/futures/openOrders` | SIGNED | `algo.futures.openOrders` |
| `futures.cancelOrder` | DELETE | `/sapi/v1/algo/futures/order` | SIGNED | `algo.futures.cancelOrder` |
| `futures.subOrders` | GET | `/sapi/v1/algo/futures/subOrders` | SIGNED | `algo.futures.subOrders` |
| `spot.historicalOrders` | GET | `/sapi/v1/algo/spot/historicalOrders` | SIGNED | `algo.spot.historicalOrders` |
| `spot.newOrderTwap` | POST | `/sapi/v1/algo/spot/newOrderTwap` | SIGNED | `algo.spot.newOrderTwap` |
| `spot.newOrderVp` | POST | `/sapi/v1/algo/spot/newOrderVp` | SIGNED | `algo.spot.newOrderVp` |
| `spot.openOrders` | GET | `/sapi/v1/algo/spot/openOrders` | SIGNED | `algo.spot.openOrders` |
| `spot.cancelOrder` | DELETE | `/sapi/v1/algo/spot/order` | SIGNED | `algo.spot.cancelOrder` |
| `spot.subOrders` | GET | `/sapi/v1/algo/spot/subOrders` | SIGNED | `algo.spot.subOrders` |
