# Changelog

All notable changes to `binance-sdk` are documented here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [3.0.0] - 2026-08-24

Nothing past `1.0.0` has been published to npm before this release, so everything below —
accumulated across local development — ships together as one major version. The breaking
changes are limited to the package/binary rename; every SDK method from `1.0.0` still works
the same way.

### Breaking

- Package renamed from `@shubhamtaywade82/binance-sdk` to `@nemesis-oss/binance-sdk`. Update
  imports accordingly.
- MCP server binary renamed from `binance-usdm-mcp` to `binance-sdk-mcp` (`npx binance-sdk-mcp`);
  MCP server name changed from `binance-usdm-futures` to `binance-sdk`.

### Added

**New product coverage**

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
- **Full Spot support**: `client.spot.account` (account info, myTrades, myPreventedMatches,
  commission, rate limits), `client.spot.trading` (orders + OCO order lists + cancelReplace),
  `client.spot.userStream` / `wsUser` (spot user-data stream), and `client.spot.wsApi` — the
  Spot WebSocket API (`order.place`/`cancel`/`status`, account, market data) with its own
  method names, distinct from the futures WS API. Plus spot market REST (`uiKlines`,
  rolling-window & trading-day tickers) and spot market WS (diff-depth, `avgPrice`,
  rolling-window ticker + all-market variants).
- **Spot LLM tools + MCP + skills**: `spotTools` group (`spot_*` — market data, account, trading,
  OCO, user-data stream) wired into `createFuturesToolkit`; WS-API tools (`futures_ws_api_*`)
  for order/account/position/user-data-stream over the signed WS API; `binance://spot/symbols`
  MCP resource; and `binance-spot-trading` / `binance-spot-market-data` skills.
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
- `mcp-config/local-dev.json`, a host config that runs the MCP server from source
  (`npx tsx src/mcp/index.ts`) for local development without publishing first.

### Fixed

- `FuturesData.insuranceFundBalance` now hits the correct `/futures/data/insuranceBalance` endpoint
  (was incorrectly calling `/fapi/v1/insuranceBalance`).
- `FuturesData.blvtInfo` now sends the required `interval` (plus optional `startTime`/`endTime`/`limit`)
  for BLVT NAV klines (`/fapi/v1/lvtKlines`).
- `WsApi` (futures WebSocket API) previously hardcoded HMAC-only signing, so a client configured
  with an Ed25519/RSA `privateKey` could sign REST requests but not WS trading requests. It now
  shares the same `Signer` as `HttpClient`.

## [2.2.0] - 2026-08-04

### Added

- **LLM tool layer** (`src/tools/`): 80 framework-agnostic tools (31 market / 22 account / 22 trading / 7 ws / 7 paper),
  with OpenAI / Anthropic / MCP / JSON-schema adapters (`createFuturesToolkit`, `toolkitToFormats`).
- **Paper-trading engine** (`src/tools/paper.tools.ts`): in-memory simulated positions with live pricing, no keys required.
- **MCP server** (`src/mcp/`): `binance-usdm-mcp` binary, stdio + HTTP health transport, auto-registers all 80 tools.
- **AI agent skills**: 7 Binance Skills-Hub skills under `skills/` (`derivatives-trading-usds`,
  `derivatives-trading-usds-streams`, `futures-algo-trading`, `futures-portfolio-margin`,
  plus updated `binance-futures-market-data` / `binance-futures-trading` / `binance-futures-paper-trading`).
- `examples/quickstart.ts`, `examples/ws-streams.ts`, `examples/paper-trading.ts`.
- `.env.example`, `CHANGELOG.md`, GitHub Actions CI workflow.
- Package `bin` entry `binance-usdm-mcp`.

### Dependencies

- Added `@modelcontextprotocol/sdk` ^1.30.0.

## [2.1.0]

- Feature-parity with binance-client-js: orders, batch, algo, modify, leverage,
  margin type, countdown-cancel, full market-data + user data streams, signed WS API.

## [2.0.0]

- TypeScript rewrite with zod-validated responses and typed WebSocket streams.
