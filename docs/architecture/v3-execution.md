# v3 Architecture — Milestone 3: Execution Platform

> Status: prerelease (`3.0.0-next.3`). Builds on [v3 Foundation](./v3-foundation.md)
> and the [v3 WebSocket Platform](./v3-websocket.md).

Milestone 3 turns execution from a per-call concern into a platform. The v2.x
execution manager already owned the *policy* of reliable submission —
idempotency keys, the reconciliation matrix, the intent ledger. What callers
still lacked was everything *around* that policy:

- the listen-key dance (create → keep-alive every 30 min → notice the key died
  → restart) was left to every consumer, and its failure modes silently lose
  fills;
- the account's own order book and positions had no live view — the intent
  ledger tracks *your* intents, not what the account is actually holding;
- "can I retry this error?" was implicit inside the manager's branches, not an
  answer callers (or agents) could consume directly.

The execution platform closes all three, additively — nothing from v2.x or
milestones 1–2 changed API shape.

```
src/execution/platform/
├── types.ts              domain vocabulary: OrderRecord, PositionRecord,
│                         UserSessionState, RetrySafety, ListenKeyApi
├── normalize.ts          raw frames → decimal-string OrderUpdate/PositionUpdate
├── OrderTracker.ts       live order-state feed (all orders, all sources)
├── PositionTracker.ts    live position-state feed (ACCOUNT_UPDATE)
├── UserStreamSession.ts  managed listen-key lifecycle over WsConnection
├── RetrySafety.ts        semantic retry classifier (safe / idempotent /
│                         reconciliation-required / never-retry)
└── ExecutionPlatform.ts  per-product composition root
```

## Managed user-data stream session

`UserStreamSession` (extends `WsConnection`) owns the full listen-key
lifecycle:

- `start()` creates the key, connects, schedules 30-minute keep-alive;
  idempotent — concurrent calls share one start.
- Three failure signatures trigger **key rotation** (create a fresh key, swap
  the connection onto it, keep the process alive):
  1. three consecutive keep-alive REST failures (dead key),
  2. six reconnect attempts without an OPEN (upgrade refused / network
     partition),
  3. five consecutive **flaps** — connections that open and die within 10s
     without delivering a single frame. Flap detection is the escape hatch for
     the accept-then-kill behavior a dead listen key actually exhibits on the
     wire: the ws client's `open` fires on handshake, so the reconnect-attempt
     counter resets every cycle and attempt thresholds never fire.
- The connection's own 23-hour rotation preempts Binance's 24-hour kill (same
  key, per the renewal semantics).
- `close()` stops timers, disconnects, and deletes the key server-side
  (best-effort); start-after-close rejects.

Sessions implement the `userData` on/off contract, so
`executionManager.setUserStream(session)` feeds the intent ledger live fills
exactly like the v2 product WS classes did.

Frames are validated through the typed Zod schemas, then normalized from the
**raw frame strings** — never the schema-transformed numbers. Binance
transmits exact decimal strings precisely because binary floats cannot
represent values like `123.456`; coercing through `Number` and back corrupts
exactly the fields money math depends on. Unknown-but-shaped event types
(new Binance events) pass through unvalidated; shapeless frames surface as
`error` events without killing the stream.

## Order and position state feeds

`OrderTracker` folds one `OrderRecord` per order from every observing source —
user-stream execution reports, REST order views, manual `applyUpdate` calls.
Records hold exact decimal strings, per-trade fills deduplicated by trade id,
and become immutable once terminal. The record set includes orders placed
outside this SDK (by hand, other bots, the UI) because the user stream
reports them all. `waitForTerminal(clientOrderId)` gives the promise form.

`PositionTracker` folds `ACCOUNT_UPDATE` events into one `PositionRecord` per
`symbol` + `positionSide` (one-way `BOTH`, hedge `LONG`/`SHORT`), with signed
amounts as decimal strings.

Both publish to the shared observability bus (`execution.order.updated`,
`execution.position.updated`) alongside the session's own
`execution.session.*` lifecycle events.

## Semantic retry classification

`classifyRetrySafety(err)` answers "can I retry this?" with one of four
meanings:

| safety | meaning | examples |
| --- | --- | --- |
| `safe` | no side effect occurred; retry freely | `-2013` after ambiguous submit (proven never created), `-2011` cancel target already gone, throttling `-1003`/429/418, `-1021` clock skew |
| `idempotent` | backend enforces the key; retry cannot double-execute | reserved — live Binance never earns this (clientOrderId uniqueness is not enforced); for keyed backends |
| `reconciliation-required` | outcome unknown; reconcile before retry | `NetworkError`, `ExecutionUnknownError`, exchange `-1000/-1001/-1007` |
| `never-retry` | deterministic failure; the same request fails the same way | filter rejections `-1013/-4164`, insufficient balance `-2010`, margin `-2019`, unrecognized errors |

The execution manager already embodies this matrix (its resubmit-after-`-2013`
path is the `safe` branch; `ExecutionUnknownError` is `reconciliation-required`
made fatal). The classifier exposes the same reasoning to callers holding raw
errors — agents and tools can decide without reimplementing it. A
classification never auto-retries anything; it only states the semantics.

## Composition: ExecutionPlatform

`ExecutionPlatform` is the per-product composition root over a shared
`CoreContext`:

```ts
const usdm = new USDMClient(core);

const session = await usdm.executionPlatform.startUserSession();
// listen key created + WS connected + keep-alive running; the product's
// execution manager auto-attached:

await usdm.execution.placeOrder({
  symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.001',
});
// ledger now tracks live fills from the stream, and:

usdm.executionPlatform.orders.get('nbsdk-…');     // live OrderRecord
usdm.executionPlatform.positions.get('BTCUSDT');  // live PositionRecord
usdm.executionPlatform.classify(err).safety;      // 'reconciliation-required'
```

- USDⓈ-M routes listen-key REST through `core.http('fapiRoot')`
  (`/fapi/v1/listenKey`) and the session to `core.endpoints.wsUser`;
- Spot routes through `core.http('spot')` (`/api/v3/userDataStream`) and
  `wsSpotUser`;
- `usdm.executionPlatform` is lazy (a REST-only caller never pays for it) and
  closed by `USDMClient.close()`;
- standalone construction (`new ExecutionPlatform({ product, core })`) accepts
  any product wiring, with an optional `executionManager` to auto-attach.

## What deliberately did *not* change

- The 2.x / milestone-1 surfaces keep their shapes: `USDMClient.startUserStream()`
  (the M1 manual path) and `ExecutionManager.setUserStream()` work exactly as
  before; the session is the platform path *alongside* them (strangler order:
  USDⓈ-M first, formal deprecation decisions come with milestone 5).
- The intent ledger stays private to the execution manager. Trackers are views
  (what does the account hold), not ledgers (what did this process intend) —
  conflating them is how double-counting bugs are born.
- No REST endpoints were added, so the contract catalog is unchanged this
  milestone.

## Testing

47 new tests (`test/execution/platform/`) on a real `WebSocketServer` user
stream mock plus MSW for listen-key REST:

- OrderTracker: futures + spot folding, decimal fidelity, fill dedup,
  terminal lock, REST views, eviction, defensive copies, event emission;
- PositionTracker: one-way + hedge keys, replacement semantics, nonZero;
- UserStreamSession: start/live/idempotence, frame passthrough, reconnect,
  keep-alive cadence + rotation on failure, flap-storm rotation + recovery,
  close semantics, bus events, execution-manager contract;
- RetrySafety: the full classification matrix;
- ExecutionPlatform: end-to-end session over CoreContext (MSW listen keys +
  mock WS), manager auto-attach with live ledger updates, idempotence,
  failure teardown, spot routes, USDMClient laziness + close.

Also fixed along the way (found by these tests): `WsConnection.retireSocket`
now swallows the asynchronous `error` the `ws` library emits when terminating
a socket that never finished establishing — previously an uncaught exception
when a session was closed mid-connect.

## Milestone 4 preview (state engine + paper)

The trackers are intentionally plain folds; milestone 4 formalizes the state
engine around them (order-book/position/account state objects with
gap detection and REST resynchronization), upgrades the paper simulator to a
first-class execution backend behind the same `ExecutionPlatform` boundary,
and drives the tool layer's agent path through the risk gateway into it.
