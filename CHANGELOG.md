# Changelog

All notable changes to `binance-sdk` are documented here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
