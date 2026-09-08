# Changelog

All notable changes to `binance-sdk` are documented here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [2.1.0] - 2026-09-08

Core hardening: correctness and architecture over endpoint count. No breaking changes —
every addition is opt-in; defaults preserve 2.0.0 behavior exactly.

### Added — execution correctness

- **OrderExecution** (`client.futures.execution` / `client.spot.execution`): idempotent order
  submission with reconcile-by-`clientOrderId`. On an ambiguous outcome the reconciler queries
  the exchange: found → the existing order is returned (no duplicate submission); `-2013` not
  found → one provably-safe retry; unresolvable → `OrderUnconfirmedError`. Concurrent
  submissions sharing a `clientOrderId` are deduped; a `newClientOrderId` is generated when
  omitted.
- **Endpoint-aware HTTP retry**: 429/418 (definitive rejections) are always retried; 5xx and
  network failures are retried only for reads or mutations explicitly marked idempotent
  (`{ retryMutation: 'always' }`). Ambiguous mutations raise the new
  `AmbiguousExecutionError` (carrying method/endpoint/params/clientOrderId) instead of being
  silently duplicated. ListenKey keep-alive PUTs are marked idempotent.
- **AmbiguousExecutionError / OrderUnconfirmedError** error types.

### Added — WebSocket lifecycle

- **State machine** (`WsState`: IDLE/CONNECTING/OPEN/RECONNECTING/CLOSING/CLOSED) for every
  stream connection, with a single authoritative socket. Superseded sockets are retired with
  listeners detached, eliminating the reconnect race (old socket's close scheduling a
  duplicate reconnect). `getState()` is exposed.
- **Subscription acknowledgement**: `await ws.subscribe([...])` resolves on the exchange's
  ack frame on live connections (and on the handshake for URL-embedded streams); failed
  subscriptions are rolled back out of the reconnect set. `listSubscriptions()`
  (LIST_SUBSCRIPTIONS) added.
- **Proactive 24h connection rotation**: derivatives market connections dial a replacement
  before Binance's 24-hour validity expires; the old socket keeps dispatching until the
  replacement is OPEN (gapless), and a failed rotation attempt falls back to the live
  connection with retry. Configurable via `connectionLifetimeMs` (default 23h).
- User-stream connections (futures/spot/COIN-M) share a `UserWSBase` with the same
  guarantees; the listenKey is re-read on every reconnect so rotated keys are picked up.

### Added — market state

- **LocalOrderBook**: maintained L2 state from a depth snapshot plus diff stream, with exact
  decimal-string levels, per-product sequence semantics (spot `U/u`, futures `pu` chaining),
  pre-snapshot diff buffering, desync detection and events. Analytics: best bid/ask, spread,
  mid, microprice, top-N imbalance, per-side VWAP, depth.
- **watchOrderBook()** / `client.watchFuturesOrderBook()` / `client.watchSpotOrderBook()`:
  subscribe + snapshot + auto-resync wiring over the existing market WS connections.

### Added — risk & safety

- **RiskGateway** (extends TradingPolicy, constructible via the same `safety` option):
  stateful `maxOpenOrders`, `maxOrdersPerMinute` (sliding window), `maxLeverage`,
  `maxSymbolNotional`, `maxTotalNotional`, `maxDailyLoss` kill switch with a sticky circuit
  breaker (tripped → all mutations refused until `reset()`), and a `status()` snapshot.
  `client.risk` exposes the instance; orders accepted via `execution` are tracked
  automatically.

### Added — numerics, simulation, architecture

- **Exact decimal arithmetic** (`src/util/decimal.ts`, exported): BigInt-scaled
  add/sub/mul/div/compare, `floorToStepExact`/`roundToStepExact`/`formatExact`. `FuturesOps`
  quantization and risk sizing now compute exactly — no IEEE-754 round-trip on the wire
  values.
- **Paper execution models**: pluggable `ExecutionModel` (default `InstantFillModel`,
  opt-in `SlippageExecutionModel`) and `FeeModel` (default `NoFeeModel`, opt-in
  `TakerMakerFeeModel`); fee accounting on `PaperAccount.totalFees` and `PaperOrder.fee`.
- **Product registry**: `client.products.{spot, futures.usdm, futures.coinm, margin, wallet,
  subaccount}` with capability metadata; ergonomic aliases `client.futures.usdm` /
  `client.futures.coinm`.
- **Structured logging**: `logger: createConsoleLogger(level)` on `BinanceClient` emits
  single-line JSON telemetry (HTTP requests/retries/ambiguity, WS lifecycle/rotation,
  order reconciliation). Silent by default.

### Fixed

- Spot depth diff streams: the depth payload schema no longer requires `e: 'depthUpdate'`
  (spot diffs carry no event field), and `E` is optional.
- Order-book levels arriving under different formatting (`'60000.10'` vs `'60000.1'`) can no
  longer exist as two separate levels — prices/quantities are canonicalized on entry.
- `BaseWS`/user-stream `reconnect()` could schedule duplicate reconnects via the retired
  socket's close event (race described in review); fixed by the state machine.
- Futures depth diff stream speeds now include `250ms`; spot includes `1000ms`.

## [2.0.0] - 2026-08-24

The only version ever published to npm before this release is `1.0.0`. Everything below —
accumulated across local development in several rounds that never shipped — goes out together
as this one release, numbered `2.0.0` because it contains breaking changes (the package rename,
and the TypeScript/Zod rewrite of the original client). If you're upgrading from the `1.0.0` on
npm, read the Breaking section below; if you're picking this package up for the first time,
everything else is just capability.

### Breaking

- Package renamed from `@shubhamtaywade82/binance-sdk` to `@nemesis-oss/binance-sdk`. Update
  imports accordingly.
- MCP server binary renamed from `binance-usdm-mcp` to `binance-sdk-mcp` (`npx binance-sdk-mcp`);
  MCP server name changed from `binance-usdm-futures` to `binance-sdk`.
- Full TypeScript rewrite of the original client, with Zod-validated responses and typed
  WebSocket streams throughout.

### Added

**Core REST + WebSocket parity**

- Feature parity with `binance-client-js`: orders, batch orders, algo orders, order
  modification, leverage, margin type, countdown-cancel-all, full market-data and user-data
  streams, signed WS API (futures).
- **LLM tool layer** (`src/tools/`): framework-agnostic tools across market data, account,
  trading, WS, and paper trading, with OpenAI / Anthropic / MCP / JSON-schema adapters
  (`createFuturesToolkit`, `toolkitToFormats`).
- **Paper-trading engine** (`src/tools/paper.tools.ts`): in-memory simulated positions with
  live pricing, no keys required.
- **MCP server** (`src/mcp/`): `binance-sdk-mcp` binary, stdio + HTTP health transport,
  auto-registers the full toolkit as MCP tools and resources.
- **AI agent skills** under `skills/` for futures market data, trading, paper trading,
  derivatives streams, algo trading, and portfolio margin.
- `examples/quickstart.ts`, `examples/ws-streams.ts`, `examples/paper-trading.ts`,
  `mcp-config/local-dev.json` for running the MCP server from source.

**New product coverage**

- **Full Spot support**: `client.spot.account` (account info, myTrades, myPreventedMatches,
  commission, rate limits), `client.spot.trading` (orders + OCO order lists + cancelReplace),
  `client.spot.userStream` / `wsUser` (spot user-data stream), and `client.spot.wsApi` — the
  Spot WebSocket API (`order.place`/`cancel`/`status`, account, market data) with its own
  method names, distinct from the futures WS API. Plus spot market REST (`uiKlines`,
  rolling-window & trading-day tickers) and spot market WS (diff-depth, `avgPrice`,
  rolling-window ticker + all-market variants). Spot LLM tools (`spot_*`) and the
  `binance://spot/symbols` MCP resource.
- **COIN-M Futures** (`client.coinm`): `market` (klines, funding-rate history, open interest
  and its history, premium index), `account` (balance, account info, position risk, income
  history, user trades, leverage brackets, commission rate, position mode), `trading` (order
  CRUD, leverage/margin-type changes, position margin), plus `userStream`, `ws` (market streams),
  and `wsUser` (user data stream) — full REST + WebSocket parity with USD-M.
- **Margin Trading** (`client.margin`): cross and isolated account info, max borrowable/transferable,
  borrow/repay via the unified `borrow-repay` endpoint, cross/isolated transfers, interest and
  force-liquidation history, and margin order CRUD.
- **Wallet** (`client.wallet`): universal transfer (+ history), deposit history, withdraw history
  and submission, deposit address, funding/user asset queries, account snapshot, API key
  permissions, asset detail, dust log/conversion, trade fees.
- **Sub-account management** (`client.subaccount`): list/status, spot/futures/margin summaries,
  universal transfer (+ history), virtual sub-account creation, futures/margin enablement,
  deposit address/history.
- Order-book diff-depth market streams: `FuturesMarketWS.depthDiff` (`<symbol>@depth`) and
  `depthDiffSpeed` (`<symbol>@depth@100ms` / `@depth@500ms`); depth payloads now preserve `pu`/`T`.
- All-market rolling-window ticker stream: `FuturesMarketWS.allRollingWindowTickers` (`!ticker_<w>@arr`).
- `WsApi` unsigned/public market-data methods (`time`, `exchangeInfo`, `klines`, `aggTrades`, `trades`,
  `depth`, `avgPrice`, `ticker.price/bookTicker/24hr`) and signed `order.status`, `orderList.*`,
  `account.status/position`, and `userDataStream.start/ping/stop`.

**Agent safety and production infrastructure**

- `TradingPolicy` (`BinanceClientOptions.safety`): client-side guardrails evaluated before a
  mutating request leaves the process — `dryRun` (throws `DryRunError` carrying the suppressed
  request instead of sending it), `readOnly`, `allowedSymbols`, `maxNotionalPerOrder` (an order
  whose notional can't be verified is refused, not waved through), `allowWithdrawals` (denied
  by default once a policy is active), `allowTransfers`, `blockedPaths`. Shared across every
  product namespace.
- Header-based rate-limit tracking: `RateLimitTracker` parses `X-MBX-USED-WEIGHT-*` /
  `X-MBX-ORDER-COUNT-*` response headers and delays queued requests once usage crosses a
  configurable safety margin (`rateLimitWeightPerMinute` / `rateLimitSafetyMargin`), replacing
  the previously-declared-but-unused `rateLimitTokensPerSecond`/`rateLimitMaxTokens` options.
- Server time sync: `HttpClient.syncTime()` / `BinanceClient.syncTime()` fetch each REST host's
  server time and apply the offset to every signed request's `timestamp`, mitigating `-1021`
  errors from local clock drift.
- Ed25519 and RSA signing (`Signer`): `apiSecret`/HMAC remains the default; `privateKey` +
  `signatureAlgorithm` switch to an asymmetric key, for both REST (`HttpClient`) and the WS
  APIs (`WsApi`, `SpotWsApi`).
- `httpsAgent`/`proxy` pass-through on `HttpClient`/`BinanceClient`, for corporate network setups.
- `BinanceApiError` now carries `endpoint`/`method`/response-header context and exposes
  `isRateLimitError()`/`isTimestampError()`/`isInsufficientBalance()` classification helpers;
  `RateLimitError` captures `retryAfterMs` from the `Retry-After` header.
- `HttpClient`'s query serialization supports array values as repeated keys (needed for the
  Wallet dust-conversion asset list).

### Fixed

- `FuturesData.insuranceFundBalance` now hits the correct `/futures/data/insuranceBalance` endpoint
  (was incorrectly calling `/fapi/v1/insuranceBalance`).
- `FuturesData.blvtInfo` now sends the required `interval` (plus optional `startTime`/`endTime`/`limit`)
  for BLVT NAV klines (`/fapi/v1/lvtKlines`).
- `WsApi` (futures WebSocket API) previously hardcoded HMAC-only signing, so a client configured
  with an Ed25519/RSA `privateKey` could sign REST requests but not WS trading requests. It now
  shares the same `Signer` as `HttpClient`.

### Dependencies

- Added `@modelcontextprotocol/sdk` ^1.30.0.
