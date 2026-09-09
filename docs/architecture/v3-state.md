# v3 Architecture — Milestone 4: State Engine & Paper Execution Backend

> Status: prerelease (`3.0.0-next.4`). Builds on [v3 Foundation](./v3-foundation.md),
> the [v3 WebSocket Platform](./v3-websocket.md) and the
> [v3 Execution Platform](./v3-execution.md).

Milestone 4 completes the trading state picture with two capabilities, both
behind boundaries that already existed:

1. **The state engine** — local L2 books rebuilt on the platform surfaces:
   pooled WS subscriptions (milestone 2) instead of connection-centric
   sockets, shared REST transports instead of ad-hoc fetchers, and the
   canonical Binance sync algorithm (buffer diffs while the snapshot is in
   flight) instead of a resubscribe dance. Plus the execution platform's
   missing half: a **REST reconciliation pass** that folds the account's
   authoritative state into the order/position trackers — the gap-fill for
   everything the user stream cannot see (orders that predate the session,
   changes during a partition).
2. **Paper as a first-class execution backend** — the simulator now sits
   *behind the execution-platform boundary*: its fills replay as
   exchange-shaped user-data frames through the exact same session contract,
   so the trackers, `waitForTerminal()`, retry classification and
   reconciliation behave identically whether orders route to the exchange or
   to the simulator.

```
src/state/platform/
├── ManagedBook.ts        one symbol's book: sync lifecycle + events
│                         (buffering, gap detection, recovery, waitForSync)
└── BookEngine.ts         multi-symbol manager: pooled subscriptions,
                          REST snapshots, desync resync

src/execution/platform/
├── PaperSession.ts       simulator fills → ORDER_TRADE_UPDATE /
│                         ACCOUNT_UPDATE frames (the userData contract)
├── PaperBackend.ts       createPaperExecutionPlatform(): the assembled
│                         paper runtime over one CoreContext
└── Reconciler.ts         REST openOrders + positionRisk fold into the
                          M3 trackers (live) / simulator book (paper)
```

## The state engine

### ManagedBook

The pure `OrderBook` class (unchanged since v2.1) owns the L2 algorithm:
snapshot application, diff application with `pu`/`U` sequence checks, sorted
exact-decimal levels, metrics (spread, microprice, imbalance, depth, VWAP).
`ManagedBook` owns the *lifecycle* around it:

```
syncing ──snapshot──▶ live ──gap──▶ desynced ──snapshot──▶ live
   │                    │                          │
   └─ diffs buffer ────-┘      interrupted ────────┘
                                (next diff proves continuity → live,
                                 or reveals a gap → desynced)
```

- **Buffering**: diffs that arrive before the first REST snapshot buffer
  (capped, default 2000). `applySnapshot()` applies the *tail* — diffs whose
  final id exceeds the snapshot's `lastUpdateId` — so there is no blind
  window between snapshot and stream. This is the algorithm Binance
  documents for futures; the v2 engine approximated it with a resubscribe.
- **Gap detection**: a `pu` mismatch (futures) or `U > lastUpdateId + 1`
  (both products) desyncs immediately and emits `desync` with the reason.
- **Interrupted recovery**: an interrupted subscription marks the book
  desynced *at once* (missed diffs are a known fact, not a guess); when the
  next diff applies cleanly, sequence continuity is proven and the book
  returns to live without a resnapshot.
- **Ergonomics**: `waitForSync(timeout)` (the tracker pattern), `update`
  events with top-of-book summaries, `bestBid` / `bestAsk` / `metrics()` on
  exact decimal strings.

### BookEngine

`new BookEngine({ product: 'usdm' | 'spot', core })` manages books across
symbols on one product's pooled stream family:

```ts
const engine = new BookEngine({ product: 'usdm', core });
const book = await engine.watch('BTCUSDT');   // resolves once synced
book.bestBid;                                  // { price: '42150.1', … }
book.metrics();                                // spread, imbalance, microprice
await engine.unwatch('BTCUSDT');               // refcounted UNSUBSCRIBE
engine.close();                                // everything, terminal
```

Design decisions:

- **No private sockets.** The engine subscribes `btcusdt@depth@100ms` through
  `core.ws.usdm` — depth streams share pooled connections with every other
  stream the context runs. Connection placement, 23-hour renewal and
  reconnects are the WS platform's job; the engine only reacts
  (`interrupted` → desync → resync with backoff).
- **No private REST clients.** Snapshots come from `core.http('fapi')` /
  `core.http('spot')` — the same weight budget, environment and request
  mocks as everything else. A testnet book engine reads testnet snapshots.
- **`watch()` cleans up after itself.** A failing snapshot rejects and
  leaves no half-wired book or subscription behind.
- On `USDMClient`: `usdm.books` (lazy, closed by `usdm.close()`).

## REST reconciliation (`platform.reconcile()`)

The user stream sees the present and the future, never the past. Orders
placed before `startUserSession()` — by hand, by another bot, by a previous
process — never appear in it, and after a partition the stream resumes
without replaying what was missed. `reconcile()` closes that gap:

```ts
await platform.startUserSession();
const summary = await platform.reconcile();   // startup gap-fill
// → { orders: 3, positions: 2, fetchedAt: … }
```

- USDⓈ-M: one `GET /fapi/v1/openOrders` + one `GET /fapi/v2/positionRisk`
  (both over the shared fapiRoot transport, signed).
- Spot: per-symbol `GET /api/v3/openOrders` (`{ symbols: [...] }` required —
  Binance removed the account-wide form); positions do not exist on spot.
- Every fold emits the same `execution.order.updated` /
  `execution.position.updated` events a stream fold emits; the pass
  summarizes via `execution.reconciled`.
- Position folds are *authoritative zeros*: a `positionAmt: '0'` row folds
  to a flat record, exactly like the exchange reporting flat.

## Paper behind the platform boundary

The v2.x `PaperExecutionAdapter` already gave the paper simulator live
execution *semantics* (same `Execution` envelope, same `-2011`/`-2013`
reconciliation errors). Milestone 4 gives it the platform *surfaces*:

### `PaperSession`

A user-data stream session with no network. It hooks the paper adapter's
fill reports (which since M4 fan out to every listener — the execution
manager's ledger and the session both consume them) and translates each
fill into the frames a live USDⓈ-M session would deliver:

- an `ORDER_TRADE_UPDATE` frame field-for-field identical to the exchange
  shape (`o.c`, `o.X`, `o.z`, `o.ap`, `o.l`/`o.L`, `o.n`/`o.N`, …), so
  `OrderTracker.applyUserEvent` cannot tell it from a real fill;
- an `ACCOUNT_UPDATE` frame carrying the position the fill produced —
  signed one-way amounts (`pa` negative for shorts), `ps: 'BOTH'`, only
  changed symbols, like Binance.

Because translation is synchronous, a fill is folded into the trackers
*before* `placeOrder()` resolves — `platform.orders.get(id)` is already
terminal when the await returns.

### `createPaperExecutionPlatform(core, options)`

The one-call wiring: simulator + adapter + execution manager + execution
platform, over one shared `CoreContext`. The simulator's price feed rides
the shared transports (`core.http('fapi')`), so environment selection and
request mocks apply to paper runs exactly as they do to live ones.

```ts
const core = new CoreContext({ apiKey, apiSecret });
const paper = createPaperExecutionPlatform(core, { initialBalance: 25_000 });

await paper.platform.startUserSession();      // no network — local session
const fill = await paper.execution.placeOrder({
  symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01',
});

paper.platform.orders.get(fill.clientOrderId);   // OrderRecord, status FILLED
await paper.platform.orders.waitForTerminal(fill.clientOrderId);
paper.platform.positions.get('BTCUSDT');         // PositionRecord, '0.01'
paper.platform.reconcile();                      // folds the simulator book
paper.platform.classify(err).safety;             // same classifier as live
```

Strategy code written against this runs unchanged live: same session
contract, same tracker records, same promise APIs, same retry semantics.

### Decimal fidelity at the boundary

The simulator's internal arithmetic is IEEE-754 by design — it is a model,
not a ledger. The *boundary* is decimal-exact: `decimalString()` formats
simulator floats at twelve significant digits (stripping representation
noise like `0.1 + 0.2 → 0.30000000000000004`), and everything downstream —
tracker records, ledger math, metrics — is exact decimal strings on
`Decimal`/`BigInt`, as everywhere else in v3.

## Compatibility

Everything is additive:

- all 498 milestone-3 tests pass unchanged (530 total with the 32 new);
- v2.x surfaces (`OrderBookEngine`, `PaperTradingEngine`,
  `createPaperExecutionManager`, `ExecutionGateway`, tools) untouched;
- `PaperExecutionAdapter.onReport` now fans out to every registered listener
  instead of replacing the previous one — the documented single-listener
  usage is unaffected;
- `ExecutionPlatform.userSession` widens to
  `UserStreamSession | PaperSession` (both carry the `userData` contract,
  `close()`, `waitForOpen()`; `liveUserSession` narrows back when needed).

Next milestone (5): product surface completion (Spot product client,
generated-coverage compiler) on the same core.
