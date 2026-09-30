# USDS-M Futures WebSocket streams reference

Live URLs (2026 migration — old `/stream` and `/ws` paths shut down on April 23, 2026):
- **Public** (high-frequency public all-market data, e.g. `!ticker@arr`, `!contractInfo`): `wss://fstream.binance.com/public/stream` (combined)
- **Market** (per-symbol market streams): `wss://fstream.binance.com/market/stream` (combined)
- **User data** (private listenKey streams): `wss://fstream.binance.com/public/ws/<listenKey>` (keepalive every 30 min)
- **WS API (request/response)**: `wss://ws-fapi.binance.com/ws-fapi/v1`

Testnet: `wss://fstream.binancefuture.com/market/stream` (or `/public/stream`, `/public/ws/<listenKey>`).

Topics are **lowercase** `<symbol>@<stream>`; aggregate/all-symbol topics use a leading `!`.

## Market data streams (public / market)

| Stream | Example | Payload | Notes |
|--------|---------|---------|-------|
| Aggregate trades | `<symbol>@aggTrade` | `{e:'aggTrade',T,...,p,a}` | Same price+side aggregated. |
| Trades | `<symbol>@trade` | trade | Raw executions. |
| Liquidations | `<symbol>@forceOrder` \| `!forceOrder@arr` | forceOrder | Per-symbol / all. |
| Mark price | `<symbol>@markPrice` \| `<symbol>@markPrice@1s` \| `!markPrice@arr` \| `!markPrice@arr@1s` | markPrice (array for `@arr`) | 3s default, 1s opt-in. `!markPrice@arr@1s` is the 2026 1s aggregate stream. |
| Mini ticker | `<symbol>@miniTicker` \| `!miniTicker@arr` | miniTicker | Price + 24h %. |
| 24h ticker | `<symbol>@ticker` | 24hrMiniTicker | |
| Rolling ticker | `<symbol>@ticker@1h`/`@4h`/`@1d` | rollingWindow | Windowed tickers. |
| All book tickers | `!bookTicker` | bookTicker | Top of book all symbols. |
| Symbol book ticker | `<symbol>@bookTicker` | bookTicker | Top of book single. |
| Depth delta | `<symbol>@depth` / `@depth@0ms` / `@depth@100ms` | depthUpdate | Apply to REST snapshot. |
| Snapshot | `<symbol>@depth<limit>` (5/10/20/50/100/500/1000/5000) | partial | Snapshot of N levels. |
| Kline | `<symbol>@kline_<interval>` | kline | 1m…1M. |
| Continuous kline | `<symbol>_<contractType>@continuousKline_<interval>` | kline | perpetual/current_quarter/next_quarter. The contract type sits **between** the symbol and the stream kind — `<symbol>@continuousKline_<type>_<interval>` is NOT routed by Binance. |
| Mark-price kline | `<symbol>@markPriceKline_<interval>` | kline | |
| Index-price kline | `<symbol>@indexPriceKline_<interval>` | kline | |
| Premium-index kline | `<symbol>@premiumIndexKline_<interval>` | kline | |
| Composite index | `<symbol>@compositeIndex` | compositeIndex | Multi-asset index weights. |
| Asset index | `<symbol>@assetIndex` / `!assetIndex@arr` | assetIndex | Multi-assets collateral index. |
| Contract info | `!contractInfo` | contractInfo | Pushed on listing/settlement changes. |
| RPI depth | `<symbol>@rpiDepth@500ms` | rpiDepthUpdate | Retail Price Improvement book diff, 500ms. |
| Trading session | `tradingSession` | tradingSession | Platform session phase transitions (introduced Dec 2025 alongside `/fapi/v1/tradingSchedule`). |

## Kline intervals
`1m 3m 5m 15m 30m 1h 2h 4h 6h 8h 12h 1d 3d 1w 1M`.

## Private user data streams (over listenKey)
Connect `wss://fstream.binance.com/public/ws/<listenKey>` (keepalive every 30 min).

| Event | Payload top-level `e` | Fields |
|-------|----------------------|--------|
| Account update | `ACCOUNT_UPDATE` | `a.m` (assets), `a.P` (positions), `a.B` (balances), `a.bp` (cross). |
| Order/trade update | `ORDER_TRADE_UPDATE` | `o.*` order state, `o.x` execution type, `o.X` order status. |
| Margin call | `MARGIN_CALL` | `p.m` margin level, `p.P` (positions). |
| Account config | `ACCOUNT_CONFIG_UPDATE` | `s.S` (symbol settings), `s.V` values. |
| Listen key expired | `listenKeyExpired` | Reconnect with a fresh listenKey. |

## WebSocket API (request/response over `wss://ws-fapi.binance.com/ws-fapi/v1`)
HMAC/RSA/Ed25519 auth via `session.logon`. Responses: `{ id, status, result, rateLimits[] }`.
Methods: `session.logon|status|logout|login`, `depth`, `trades.recent|historical|aggregate`,
`klines`, `avgPrice`, `executionRules`, `referencePrice`, `ticker.tradingDay|ticker|price|book`,
`order.place|test|status|cancel|cancelReplace|amend.keepPriority`, `openOrders.status|cancelAll`,
`orderList.place*`, `sor.order.place|test`, `account.status|balance|position|commission|rateLimits.orders`,
`myTrades`, `allOrders`, `position.margin`, `futures.algoOrder.place|cancel`, `userDataStream.*`.

## Notes
- Depth deltas are incremental — reconcile `U`/`pu` sequence numbers against the REST
  `GET /fapi/v1/depth` snapshot.
- `@depth@0ms` = real-time (dynamically throttled); `@depth@100ms` = 100ms.
- The SDK (`FuturesMarketWS`) auto-routes topics to public/market/private and re-subscribes on reconnect.