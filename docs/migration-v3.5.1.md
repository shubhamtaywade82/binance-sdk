# v3.5.1 Migration Notes — Protocol Correctness & Execution Safety

`@nemesis-oss/binance-sdk` v3.5.1 remediates the P0 protocol and
execution-safety gaps found in the v3.5.0 audit: the 2026 USDⓈ-M WebSocket
routing migration, the private user-data stream lifecycle, the WebSocket API
RPC/authentication lifecycle, the per-endpoint order response contracts, and
V3 account reconciliation.

Sources verified for this release (retrieved 2026-10-30):

- Binance "Important WebSocket Change Notice — Base URL Split",
  developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Important-WebSocket-Change-Notice
  (page last modified 2026-10-28)
- Binance USDⓈ-M Futures user data streams page
  (developers.binance.com/en/docs/products/derivatives-trading-usds-futures/user-data-streams)
- Binance USDⓈ-M Futures change log
  (developers.binance.com/en/docs/products/derivatives-trading-usds-futures/change-log)
- Binance USDⓈ-M WebSocket API catalog — user data stream methods
  (developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-api/user-data-streams)
- Binance USDⓈ-M REST API catalog — Account & Trade sections
  (developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/account)

## 1. Protocol verification table

| Feature | v3.5.0 (audited) | Verified Binance contract | v3.5.1 change |
|---|---|---|---|
| USDⓈ-M market endpoint | `wss://fstream.binance.com/market/stream` | `/market` base, `stream` mode `?streams=` | unchanged (correct) |
| USDⓈ-M public endpoint | `wss://fstream.binance.com/public/stream` | `/public` base — book tickers, depth | unchanged (correct) |
| USDⓈ-M private endpoint | *(absent)* — user data on legacy `wss://fstream.binance.com/public/ws` | `wss://fstream.binance.com/private` base; legacy `/ws` and `/stream` decommissioned 2026-04-23; unmigrated connections only receive `/public` data (i.e. **no user events at all**) | `endpoints.wsPrivate` added; `wsUser` now its deprecated alias (live/testnet/demo resolved independently) |
| Private listen-key URL format | `${wsUser}/${listenKey}` (path segment on the legacy route) | Migration notice: `wss://fstream.binance.com/private/ws?listenKey=<listenKey1>&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE`. Multiple events join with `/`; `stream` mode accepts repeated `listenKey`+`events` pairs. **Documented conflict:** the user-data-streams page shows `…/private/ws/<listenKey>` as a path — the migration notice (routing authority, updated 2026-04-02) wins as the default; the path form is retained as an escape hatch | shared `buildPrivateStreamUrl()`; `listenKey` percent-encoded; `events` optional (omitted ⇒ all events, preserving prior behavior); `privateUrlStyle: 'path'` escape hatch; listen keys redacted from every log/event |
| Listen-key creation | `POST /fapi/v1/listenKey` | unchanged; WS API `userDataStream.start` (API_KEY, IP weight 1) also exists | unchanged; WS API methods already exposed on `wsApi` surface |
| Listen-key keepalive | 30-minute interval (PUT) | Key valid 60 minutes; PUT extends 60 minutes; POST returns the active key and extends it | cadence kept (30 min, comfortably inside expiry); failures now **surfaced**, key recreated after 3 consecutive failures; `listenKeyExpired` event triggers immediate rotation |
| WebSocket API authentication | Per-request HMAC/Ed25519 only; `WsSession` exported but never wired | Persistent session auth via `session.logon` (Ed25519); after a successful logon, subsequent requests may omit signature params; re-login required after reconnect | `WsApiClient` gains `session` + `useSessionAuth`; explicit `AUTHENTICATING → READY` / `REAUTHENTICATING` states; stale-callback & concurrent-logon guards; auth failure is terminal `FAILED`. **Per-request signing remains the default** (constraint: never remove signing for consumers that rely on it) |
| Session reconnect | State machine existed at socket level; all in-flight RPCs failed as generic `NetworkError`; no replay (verified) — but dispatched order writes were indistinguishable from never-sent | No documented replay guarantee; order writes are non-idempotent on the wire (Binance does not enforce `newClientOrderId` uniqueness for retries) | generation-tracked pending map; dispatched-but-unanswered **order writes** reject with `RpcOutcomeUnknownError` (reconcile-before-retry); reads/never-sent stay retryable `NetworkError`s; no replay path, bounded pending queue |
| Position Risk V3 | Reconciler used `GET /fapi/v2/positionRisk` | `GET /fapi/v3/positionRisk` is the current reconciliation source (V2 still served but not the default) | Reconciler folds V3 rows; `breakEvenPrice` carried into `PositionTracker` |
| Balance V3 | `FuturesAccount.balanceV3()` existed (`/fapi/v3/balance`) but no consumer guidance | `GET /fapi/v3/balance` / `/fapi/v3/account` / `/fapi/v3/positionRisk` are the V3 account endpoints | Reconciliation guidance updated; agent integration task mandates V3 for balance/position reconciliation |
| Order response fields (ACK) | `NewOrderAckSchema` required `avgPrice`, `executedQty`, `cumQuote`, `reduceOnly` | ACK contract carries order identity only; execution fields are RESULT-only; default response type is RESULT for MARKET/LIMIT, ACK otherwise | ACK fields now optional; RESULT parsing unchanged |
| Order response fields (cancel) | Parsed with the full query-order schema — real cancel payloads violate it (`cumQty`, no `avgPrice`/`origQty`/`reduceOnly`) | `DELETE /fapi/v1/order` returns the documented cancel contract | dedicated `CancelOrderResultSchema` / `CancelOrderResult` |
| User-data event fields | `ORDER_TRADE_UPDATE` missing `M`/`V`/`pP`/`pm`/`gtd`/`er`; `ACCOUNT_UPDATE` missing `bep`/`S`; `ACCOUNT_CONFIG_UPDATE` and `listenKeyExpired` threw `Unknown user-data event type` | Change log: `M` (modifyId) added 2026-07-21, `V` (STP) added 2026-03-11; `ACCOUNT_CONFIG_UPDATE` = `ac` (leverage) xor `ai` (multi-assets); `listenKeyExpired` = `{e, E, listenKey}` | all modeled; unknown-but-typed events pass through (`unknownEvent`), shapeless frames still error |
| COIN-M / Spot / Options / PM endpoints | unchanged | USDⓈ-M migration is product-specific | deliberately untouched (COIN-M `/private` behavior is unverified — not introduced) |

## 2. Breaking changes

1. **`Execution.executedQuantity` / `cumulativeQuoteQuantity` are `string | null`.**
   Same for `OrderRecord` / `OrderUpdate` (`executedQuantity`) and
   `OrderShape` (`executedQty` / `cumQuote` / `avgPrice`). `null` means *not
   supplied / unknown* — never treat it as zero. When you need a number,
   reconcile (REST fold) or await the next `ORDER_TRADE_UPDATE`.
   ```ts
   const qty = execution.executedQuantity; // string | null
   if (qty === null) await manager.reconcile(intentId);
   ```
2. **`FuturesTrading.cancelOrder()` returns `CancelOrderResult`** (has `cumQty`;
   no `avgPrice` / `origQty` / `reduceOnly`).
3. **`endpoints.wsUser` now equals the `/private` base** (was
   `…/public/ws`). It is deprecated — use `endpoints.wsPrivate` and
   `buildPrivateStreamUrl({ baseUrl, listenKey, events })`; never append the
   key as a raw path segment.
4. **`UserStreamSession` URL style**: default `'path'` builds
   `${base}/ws/<key>` from a bare host (full bases ending in `/ws` are
   detected and not doubled). USDⓈ-M wiring uses `'query'` internally.
5. **`session.started` / `session.rotated` carry `listenKeyFingerprint`** —
   the raw key is no longer published on the event bus.
6. **Unknown user-data events no longer emit `error`** — they emit
   `unknownEvent` (plus the normal `userData` / event-name emissions). Error
   listeners that treated "new event type" as a failure should subscribe to
   `unknownEvent` instead.

## 3. Execution-safety semantics (unchanged contracts, now explicit)

- **Idempotent placement** (`ExecutionManager`): deterministic
  `newClientOrderId` per intent; ambiguous transport failures reconcile via
  `GET /fapi/v1/order?origClientOrderId=…`; `-2013` proves non-arrival and
  allows exactly one resubmission with the *same* id; anything else surfaces
  `ExecutionUnknownError` with the intent preserved.
- **WS API order writes**: a lost response (drop or timeout) rejects with
  `RpcOutcomeUnknownError` carrying the request id, method, client order id
  and connection generation. `classifyRetrySafety()` →
  `reconciliation-required`. The client never replays it.
- **Fills are idempotent**: both the execution ledger and the platform
  trackers deduplicate by trade id; cumulative quantities (`z`, `Z`) remain
  authoritative.
- **A definitive rejection records `'0'` executed** (provably no execution);
  *unknown* states record `null`.

## 4. Testnet / demo validation status

Live routing is taken verbatim from the migration notice. The testnet
(`wss://fstream.binancefuture.com/private`) and demo
(`wss://demo-fstream.binance.com/private`) hosts mirror the live structure on
the same hosts this SDK already used for market data — the migration notice
does not document testnet/demo routing separately, so these require a live
smoke test (`npm run smoke:testnet`) before trading. The `privateUrlStyle:
'path'` escape hatch exists precisely so a consumer can switch styles
without an SDK release if a gateway disagrees.

## 5. Companion integration task

`crypto-trading-agent` consumes `@nemesis-oss/binance-sdk@3.2.0`. The
agent-side work (state engine, durable order intents, V3 balance
reconciliation, stale-state gating) is specified in the integration brief
shipped with this remediation: `docs/agent-integration-task-v3.5.1.md` in
this repository.
