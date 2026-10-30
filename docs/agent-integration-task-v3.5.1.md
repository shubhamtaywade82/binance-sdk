# crypto-trading-agent — v3.5.1 SDK Integration Task (file-specific)

**Status:** specification for the next change window — produced by the
`binance-sdk` v3.5.1 remediation (branch
`fix/v3.5.1-protocol-correctness`, commit `73a32ed`).
**Agent baseline audited:** `nemesis-crypto-agent@2.4.1`, main @
`26298204721368796079582e3f3852a5cd66f866` ("refactor(risk): enhance drawdown
handling and safety checks").

This brief maps the SDK-remediation requirements (execution consistency,
unified state, risk gating) onto the agent's **actual** architecture. It is
deliberately surgical: the agent's live order path already implements more of
the safety matrix than the generic plan assumed, so most items below are
deltas, not rewrites. **Do not introduce a second order manager, stream
manager or state engine** — extend the listed files.

## 0. Verified agent baseline (what already exists — do not recreate)

| Requirement (SDK brief) | Already in the agent | Where |
|---|---|---|
| Ambiguous submit: lookup before deciding failure | `sendOrder()` catches `VenueUnavailableError` and resolves via `api.findOrder(clientOrderId)` | `src/binance/remoteOrders.ts:56-66` |
| Cancel/exit under one stable id through outages | `RemoteExits` retries the **same** clientOrderId ("the order may already have landed, so re-deciding with a new id could reduce twice") | `src/binance/remoteOrders.ts:126-260` |
| Duplicate-id awareness at the exchange | `DUPLICATE_CLIENT_ORDER_ID = -4116` treated as "the earlier request did land" | `src/binance/client.ts:33` |
| Startup reconciliation plan | `planStartupReconciliation(openOrders, positions)` | `src/binance/liveProtection.ts:74` |
| Durable sidecar (crash-safe) | `RemoteStore` atomic tmp+rename file persistence; crash-between-steps explicitly handled in `RemoteBroker.init()` | `src/binance/remoteState.ts:105-192`, `remoteBroker.ts:71-85` |
| Stale-view gating before entries | `open()` refuses unless a fresh sync succeeds; refuses in-flight symbols; ownership refusal before any order is sent | `src/binance/remoteBroker.ts:128-140` |
| Live user-data event parsing | `parseOrderTradeUpdate()`, entry/protection order id prefixes | `src/binance/liveProtection.ts:116+`, `liveEntry.ts` |
| Live journal + owners | `LiveJournal`, `LiveOwners`, funding/fill views | `src/binance/liveJournal.ts` |

**Not yet present (the gaps this task closes):** crash-durable *order intents*
(the release-gate scenario), V3 account/position reconciliation, private
user-data stream adoption with the new routing, explicit unresolved-intent
gating of new entries, and the SDK pin at 3.5.1.

## 1. Pin `@nemesis-oss/binance-sdk@3.5.1`

- `package.json` currently pins `"@nemesis-oss/binance-sdk": "3.2.0"`.
  Bump to `"^3.5.1"` once the v3.5.1 release PR is merged and published.
  Interim validation pin: the released tag, or
  `"@nemesis-oss/binance-sdk": "github:shubhamtaywade82/binance-sdk#fix/v3.5.1-protocol-correctness"`.
- Current SDK consumers in the agent are market-data only
  (`src/runtime/Orchestrator.ts`, `src/microstructure/MicrostructureFeed.ts`,
  `src/playbooks/marketData.ts`, `src/marketBrief/MarketBriefDataProvider.ts`,
  `src/options/OptionChainService.ts`) — none touch `wsUser`,
  `startUserStream`, `Execution` or the platform trackers, so the v3.5.1
  breaking changes (`executedQuantity: string | null`, `CancelOrderResult`,
  `endpoints.wsUser` → `/private`) are **type-compatible for existing usage**.
  Run `npm run check` (typecheck + build + tests) to confirm.
- The live venue path uses the official `binance` connector
  (`src/binance/client.ts` imports `USDMClient, WebsocketClient` from
  `'binance'`). Two acceptable end-states; pick one deliberately:
  (a) keep the connector for the venue path and adopt the SDK only where it
  already lives (minimum change), or (b) migrate the venue path onto the
  SDK's `ExecutionManager`/`ExecutionPlatform` (larger change, out of scope
  here). **Do not run both order stacks against the same account.**

## 2. P0 — crash-durable order intents (the release gate)

Scenario: Binance accepts an order → the connection drops before the response
→ the agent restarts. Today `RemoteExits.jobs`, `RemoteBroker.pendingOpens`
and `LiveEntryTracker` state are in-memory; a restart loses the intent and
nothing stops a fresh, duplicate submission.

### 2.1 Durable intent ledger (`src/binance/remoteState.ts`)

Extend `RemoteStateFile`/`RemoteStore` (same atomic tmp+rename pattern):

```ts
interface OrderIntentRecord {
  clientOrderId: string;      // reconciliation key — Binance's -4116 dedup anchor
  symbol: string; side: 'buy' | 'sell'; kind: 'OPEN' | 'EXIT' | 'PROTECTION';
  params: SubmitOrderParams;   // exact exchange parameters, persisted
  owner?: AgentId; decisionId?: string;   // strategy metadata
  state: 'SUBMITTING' | 'UNKNOWN_OUTCOME' | 'ACKNOWLEDGED' | 'RESOLVED' | 'REJECTED';
  createdAt: number; updatedAt: number;
}
// state.intents: Record<string, OrderIntentRecord>  (keyed by clientOrderId)
appendIntent(intent) / resolveIntent(id, outcome) / unresolvedIntents(): OrderIntentRecord[]
```

Write points (all in the agent's own files — no new abstractions):

- `src/binance/remoteOrders.ts — sendOrder()`: persist the intent **before**
  `api.submitOrder()`; mark `RESOLVED`/`REJECTED` after; on
  `VenueUnavailableError` mark `UNKNOWN_OUTCOME` (the `findOrder` hit resolves
  it; a miss after a definitive -2013/-4112-style absence resolves it as
  never-landed and allows exactly one resubmission **with the same id**).
- `src/binance/remoteOrders.ts — RemoteExits.enqueue()`: persist the exit
  intent alongside the in-memory `ExitJob`; delete it in `complete()` /
  `dropAlreadyFlat()` / non-venue failures. Restart recovery re-creates the
  in-memory jobs from `unresolvedIntents()` where `kind === 'EXIT'`.

### 2.2 Startup resolution (`src/binance/client.ts` + `liveProtection.ts`)

- On boot, after `planStartupReconciliation`, drain `unresolvedIntents()`:
  for each, query the exchange by client order id
  (`GET /fapi/v1/order?symbol=…&origClientOrderId=…` via the connector's
  `getSingleOrder`, or `ExecutionManager.reconcile()` if path (b) is chosen).
  Found → fold the fill into `LiveJournal`, mark `RESOLVED`. Absent (-2013) →
  mark `REJECTED` (never landed). Still ambiguous (network down) → keep and
  surface.
- **Gate:** while any `UNKNOWN_OUTCOME` intent exists for a symbol,
  `RemoteBroker.open()` and `LiveEntryTracker` must refuse **new
  risk-increasing entries** on that symbol (`OrderInFlightError`-style
  refusal — reuse the existing `isBusy()` check in
  `remoteBroker.ts:213`). Risk-reducing actions (exits, protective stops)
  stay available, per the existing exit path.
- Order lifecycle states (`CREATED → SUBMITTING → ACKNOWLEDGED → …`) live in
  the ledger record's `state` field; `RESOLVED` is set when the fill is
  journaled. Do not invent a parallel state machine class.

### 2.3 Acceptance tests (`tests/`, mirroring the existing style)

Extend `tests/remoteBroker.orders.test.ts` / `remoteBroker.exits.test.ts` /
`liveEntry.test.ts` with:

1. Restart with an unresolved OPEN intent → new entry on that symbol refused
   until the intent resolves; exit path still works.
2. Restart, exchange holds the order (lookup finds it) → intent resolves,
   fill journaled exactly once, next entry permitted.
3. Restart, exchange reports -2013 → intent marked never-landed; exactly one
   resubmission with the **same** clientOrderId.
4. Duplicate `ORDER_TRADE_UPDATE` for the same trade id → journaled once
   (`liveJournal` already keys fills — assert it).
5. `liveProtection` bracket order on an unknown-outcome entry is itself
   unknown until the entry resolves.

## 3. P0 — private user-data stream + V3 reconciliation

The agent's live event source is the `binance` connector's `WebsocketClient`.
Binance's 2026-03-06 routing migration applies to **any** client library:

- **Verify the connector version's USDⓈ-M user-data URL.** If `binance@2.15.x`
  still dials `wss://fstream.binance.com/ws/<listenKey>` or `/stream`, its user
  stream receives **no events since 2026-04-23** (unmigrated connections only
  get `/public` data). If the connector is patched for
  `wss://fstream.binance.com/private/ws?listenKey=…&events=…`, pin the patched
  version; otherwise switch the user-data socket to
  `@nemesis-oss/binance-sdk@3.5.1` (`client.futures.wsUser` /
  `executionPlatform.startUserSession()`), which implements the documented
  query form. This is the single highest-impact action item in this document.
- Event subscriptions: subscribe
  `ORDER_TRADE_UPDATE` + `ACCOUNT_UPDATE` + `ACCOUNT_CONFIG_UPDATE` +
  `listenKeyExpired` (new in SDK 3.5.1; previously parse errors). On
  `listenKeyExpired`, force the listen-key rotation path immediately.
- **V3 reconciliation:** the connector's `USDMClient.getPositionRisk()` /
  `getBalance()` default to the V2 endpoints. Replace with
  `GET /fapi/v3/positionRisk` + `GET /fapi/v3/balance` (or the SDK's
  `FuturesAccount.positionRiskV3()` / `balanceV3()`), in
  `client.ts`'s snapshot refresh and `RemoteBroker.refreshOnce()`. Keep
  positions keyed by `symbol + positionSide` (hedge-mode LONG/SHORT must stay
  distinct — verify `VenuePositionView` carries `positionSide`).
- Key positions by `symbol + positionSide` in `VenuePositionView` consumers;
  never collapse hedge-mode sides.

## 4. P1 — state freshness + LLM boundary (current state)

- `VenueStatus.state` already models `connected | degraded | down`
  (`remoteBroker.ts:122-125`). Extend the degraded rule: state is `degraded`
  (and new entries blocked) when (a) the private stream is not live, (b)
  unresolved intents exist, or (c) `lastSyncAt` is older than the loop's
  tolerance. Keep the existing DOWN_AFTER_FAILURES semantics.
- The LLM/decision modules (`src/decision/`, `src/llm/`) must keep consuming
  `RemoteBroker`'s normalized views only; the brief's "LLM never fetches
  Binance data directly / never reconstructs account state" is already the
  agent's shape — enforce it in review, no code change expected.

## 5. Definition of done (agent side)

- [ ] SDK pinned at 3.5.1; `npm run check` green.
- [ ] User-data stream verified against `/private` (connector patched or SDK socket adopted); `listenKeyExpired` handled.
- [ ] Position/balance snapshots from V3 endpoints; hedge-mode sides distinct.
- [ ] Durable intent ledger with restart recovery (section 2).
- [ ] Unknown-outcome intents block new entries on the affected symbol.
- [ ] Test matrix 2.3 (1-5) passing; no live orders placed during tests.
- [ ] The ambiguous-order release gate demonstrated by test: accepted order →
      connection drop → restart → reconciliation precedes any new submission.
