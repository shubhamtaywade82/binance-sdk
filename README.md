# binance-sdk

TypeScript SDK for Binance — **Spot, USD-M Futures, COIN-M Futures, Margin, Wallet, and
Sub-account**, REST + WebSocket, public market data and authenticated trading, with
zod-validated typed responses throughout.

Canonical Binance client for the `trading-workspace` `sdk/` directory (mirrors `sdk/dhanhq-ts`'s
role for DhanHQ). Feature-parity with `binance-client-js` (REST + WS), with typed schemas, plus
production infrastructure (header-based rate-limit tracking, server time sync, HMAC/Ed25519/RSA
signing) and client-side safety guardrails for autonomous/LLM-driven callers.

## Install

```bash
npm install @nemesis-oss/binance-sdk
```

## Usage

```typescript
import { BinanceClient } from '@nemesis-oss/binance-sdk';

const client = new BinanceClient({
  apiKey: 'YOUR_API_KEY',      // only needed for authenticated endpoints
  apiSecret: 'YOUR_API_SECRET',
  testnet: true,               // or demo: true; defaults to live
});

// Public market data (no keys needed)
const klines = await client.spot.market.klines('SOLUSDT', '15m', { limit: 500 });
const funding = await client.futures.data.fundingRateHistory('ETHUSDT', { limit: 100 });
const oi = await client.futures.data.openInterest('XRPUSDT');

// Authenticated account
const balance = await client.futures.account.balance();
const positions = await client.futures.account.positionRisk();

// Composite ops — sizing/rounding handled for you
const sizing = await client.futures.ops.sizePosition({
  symbol: 'BTCUSDT',
  side: 'BUY',
  stopPrice: 59000,
  riskAmount: 100,   // or riskPct: 1
  leverage: 10,
});
if (sizing.ok) {
  await client.futures.ops.placeBracketOrder({
    symbol: 'BTCUSDT',
    side: 'BUY',
    quantity: sizing.quantityStr,
    stopLossPrice: 59000,
    takeProfitPrice: 63000,
  });
}
await client.futures.ops.closePosition({ symbol: 'BTCUSDT' });

// Trading
const order = await client.futures.trading.createOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 0.01,
  price: 60000,
  timeInForce: 'GTC',
});
await client.futures.trading.cancelOrder('BTCUSDT', { orderId: order.orderId });

// Spot account + trading
const spotAccount = await client.spot.account.account();
const spotOrder = await client.spot.trading.createOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  quantity: '0.001',
  price: '60000',
  timeInForce: 'GTC',
});
await client.spot.trading.cancelOrder('BTCUSDT', { orderId: spotOrder.orderId });

// Market WebSocket (combined stream, auto-reconnect)
client.futures.ws.subscribe([
  client.futures.ws.kline('SOLUSDT', '15m'),
  client.futures.ws.markPrice('ETHUSDT', '1s'),
]);
client.futures.ws.on('message', (stream, payload) => console.log(stream, payload));

// User data stream (listenKey lifecycle managed automatically)
const listenKey = await client.startUserStream();
client.futures.wsUser.on('ORDER_TRADE_UPDATE', (event) => console.log(event.o));
client.futures.wsUser.on('ACCOUNT_UPDATE', (event) => console.log(event.a));
client.closeUserStream();

// Spot user data stream
await client.startSpotUserStream();
client.spot.wsUser.on('executionReport', (event) => console.log(event.s));
client.closeSpotUserStream();

// COIN-M Futures (inverse contracts, margined in the base asset)
const coinmBalance = await client.coinm.account.balance();
await client.coinm.trading.createOrder({
  symbol: 'BTCUSD_PERP',
  side: 'BUY',
  type: 'LIMIT',
  price: 60000,
  quantity: 1,          // contracts, not base-asset quantity
  timeInForce: 'GTC',
});
client.coinm.ws.subscribe([client.coinm.ws.kline('BTCUSD_PERP', '1m')]);
await client.startCoinMUserStream();

// Margin (cross + isolated)
const marginAccount = await client.margin.account.crossAccount();
await client.margin.account.borrow('USDT', 100);
await client.margin.trading.createOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: 60000, quantity: 0.001 });

// Wallet
await client.wallet.universalTransfer({ type: 'MAIN_UMFUTURE', asset: 'USDT', amount: 500 });
const deposits = await client.wallet.depositHistory({ coin: 'USDT' });

// Sub-accounts (master account only)
const subAccounts = await client.subaccount.list();

// Server time sync — mitigates -1021 (timestamp outside recvWindow) from local clock drift
await client.syncTime();
```

## Execution Correctness (v2.1)

### Idempotent order submission

`POST /fapi/v1/order` can be accepted by Binance while the response is lost (timeout, connection
reset, 5xx). A generic retry then creates a *duplicate order*. The HTTP layer refuses to
blind-retry ambiguous mutations (it raises `AmbiguousExecutionError` instead), and
`client.futures.execution` / `client.spot.execution` close the loop:

```typescript
const result = await client.futures.execution.submitOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: '0.001',
  newClientOrderId: 'strategy-abc-123', // generated when omitted
});
// result.outcome: 'created' | 'reconciled-existing' | 'retried'
// 'reconciled-existing' => the exchange HAD the order (response was lost) —
// no duplicate was submitted, the existing order is returned instead.
```

On ambiguity the reconciler queries by `clientOrderId`: found → return the existing order;
`-2013` not found → retry once (provably safe); reconciliation itself ambiguous →
`OrderUnconfirmedError` for manual follow-up. Concurrent submissions with the same
`clientOrderId` are deduped.

Retry semantics are endpoint-aware everywhere: 429/418 (definitive rejections) are always
retried; 5xx and network failures are retried only for reads, or for mutations explicitly
marked idempotent (`{ retryMutation: 'always' }` — the SDK already marks listenKey keep-alive).

### WebSocket lifecycle

All stream connections run a state machine (`IDLE → CONNECTING → OPEN → RECONNECTING →
CLOSING/CLOSED`) with a single authoritative socket. Superseded sockets are retired with their
listeners detached, which eliminates the reconnect race where an old socket's close event
schedules a duplicate connection. `await ws.subscribe([...])` now resolves only on the
exchange's ack frame (`{"result":null,"id":n}`) — or the completed handshake for URL-embedded
streams — and `LIST_SUBSCRIPTIONS` is exposed. Derivatives market connections proactively
rotate before Binance's 24h validity window: the replacement dials first and the old socket
keeps dispatching until the handoff, so rotation is gapless.

```typescript
const ws = client.futures.ws;
await ws.subscribe(['btcusdt@depth@100ms', 'btcusdt@kline_1m']);
console.log(ws.getState());            // 'open'
console.log(await ws.listSubscriptions());
```

### Local order book

```typescript
const feed = await client.watchFuturesOrderBook('BTCUSDT'); // or client.watchSpotOrderBook
feed.book.bestBid();     // { price: '60000.1', quantity: '2' } — exact decimal strings
feed.book.spread();      // best ask - best bid
feed.book.microprice();  // size-weighted mid
feed.book.imbalance(5);  // bid share of top-5 depth
feed.book.vwap('bids', 5);
feed.book.depth(10);     // top levels, bids desc / asks asc
feed.book.on('desync', () => { /* automatic re-snapshot handles this */ });
await feed.close();
```

The book follows Binance's documented sync procedure per product (spot `U/u` semantics, futures
`pu` chaining), buffers diffs that arrive before the snapshot, detects sequence gaps, and
re-snapshots automatically. Levels are keyed by *canonical exact decimals* — a snapshot level
`60000.1` and a diff level `60000.10` are the same price, never two entries.

### Risk gateway

`TradingPolicy`'s static rules (dryRun, readOnly, symbol allowlist, per-order notional,
withdrawal/transfer switches) are extended with stateful, account-aware limits:

```typescript
const client = new BinanceClient({
  apiKey, apiSecret,
  safety: {
    allowedSymbols: ['BTCUSDT', 'ETHUSDT'],
    maxNotionalPerOrder: 5000,
    maxOrdersPerMinute: 30,      // sliding window, client-side
    maxOpenOrders: 10,
    maxLeverage: 20,
    maxSymbolNotional: { BTCUSDT: 50_000 },
    maxTotalNotional: 100_000,
    maxDailyLoss: 2_000,         // kill switch: trips the circuit breaker
  },
});

client.risk?.recordRealizedPnl(-150);      // feed from user-stream events
client.risk?.status();                     // exposure, order count, breaker state
```

Once the daily-loss kill switch trips, every mutating request is refused until
`client.risk.reset()` — a misbehaving strategy cannot retry its way past it. Orders accepted
through `execution` are counted automatically.

### Decimal-safe financial math

Tick/step quantization and risk sizing use exact BigInt-scaled decimal arithmetic
(`src/util/decimal.ts`), never IEEE-754 floats: `floorToStepExact('0.0037', '0.001') ===
'0.003'`, `0.1 + 0.2 === 0.3` exactly. `FuturesOps.quantize()` and `sizePosition()` emit
strings that are exactly what Binance will accept.

### Paper trading execution models

```typescript
import { PaperTradingEngine, SlippageExecutionModel, TakerMakerFeeModel } from '@nemesis-oss/binance-sdk';

const engine = new PaperTradingEngine({
  executionModel: new SlippageExecutionModel({ marketSlippageBps: 5 }),
  feeModel: new TakerMakerFeeModel({ takerFeeBps: 4.5, makerFeeBps: 2 }),
});
```

The default remains the legacy instant-fill, no-fee simulator (existing behavior unchanged);
opting into models adds adverse slippage, taker/maker fees and fee accounting for
execution-quality research.

### Product architecture & observability

`client.products` is the capability-oriented registry over the same resource instances
(`products.spot === client.spot`, `products.futures.usdm === client.futures`), with
`client.futures.usdm` / `client.futures.coinm` ergonomic aliases — the seam future products
(options, portfolio margin, ...) will slot into. Pass `logger: createConsoleLogger('debug')`
to get single-line JSON telemetry for HTTP retries, ambiguity events, WS lifecycle, rotation
and order reconciliation.

## API Surface

### Spot (`client.spot`)

- `market` — public REST (klines + uiKlines, tickers incl. rolling-window & trading-day, depth,
  trades, aggTrades, exchangeInfo, avgPrice)
- `account` — authenticated account (account info, myTrades, myPreventedMatches, commission, rate limits)
- `trading` — order lifecycle (create/test/get/cancel, open/all orders, cancelReplace, OCO order lists)
- `userStream` — listenKey lifecycle (create / keep-alive / close)
- `ws` — market WebSocket streams (kline, trade, aggTrade, depth incl. diff-depth, ticker incl.
  rolling-window, bookTicker, miniTicker, avgPrice + all-market/arr variants)
- `wsUser` — spot user data stream (executionReport, outboundAccountPosition, balanceUpdate, listStatus)
- `wsApi` — Spot WebSocket API (`wss://ws-api.binance.com/ws-api/v3`): signed trading
  (`order.place/test/cancel/cancelReplace/status`, `openOrders.status/cancelAll`,
  `orderList.place/cancel/status`, `openOrderLists.status`), account (`account.status/commission`,
  `allOrders`, `allOrderLists`, `myTrades`), `userDataStream.start/ping/stop`, and public market
  data (`ping`, `time`, `exchangeInfo`, `depth`, `trades.recent/historical/aggregate`, `klines`,
  `uiKlines`, `avgPrice`, `ticker.24hr/tradingDay/price/book`) — its own method names, distinct
  from the futures WS API below.

### COIN-M Futures (`client.coinm`)

Inverse contracts (e.g. `BTCUSD_PERP`) margined in the base asset rather than USDT — same shape
as `client.futures`, against `dapi.binance.com`.

- `market` — klines (incl. continuous/index/mark-price variants), funding-rate history, open
  interest + history, premium index, plus the standard public REST inherited from spot/futures
- `account` — balance, account info, position risk, income history, user trades, leverage
  brackets, commission rate, position mode
- `trading` — order lifecycle (create/test/get/cancel/cancelAll/all), leverage/margin-type
  changes, position margin
- `userStream` — listenKey lifecycle (create / keep-alive / close)
- `ws` — market WebSocket streams, same naming scheme as `client.futures.ws`
- `wsUser` — user data stream (ACCOUNT_UPDATE, ORDER_TRADE_UPDATE, MARGIN_CALL)

### Margin (`client.margin`)

Cross and isolated margin trading.

- `account` — cross/isolated account info, max borrowable/transferable, `borrow`/`repay` (via
  the unified `borrow-repay` endpoint), cross/isolated transfers, interest history,
  force-liquidation history, price index
- `trading` — order lifecycle (create/get/cancel/cancelAll/all), myTrades

### Wallet (`client.wallet`)

- Universal transfer (+ history) between Spot/Margin/USD-M/COIN-M/Funding
- Deposit history, deposit address, withdraw history, withdraw submission
- Funding wallet / user asset queries, account snapshot, API key permissions, asset detail
- Dust log + dust-to-BNB conversion, trade fees

### Sub-account (`client.subaccount`, master account only)

List/status, spot/futures/margin summaries, universal transfer (+ history), virtual sub-account
creation, futures/margin enablement, deposit address/history.

### Futures (`client.futures`)

- `market` — public REST market data (klines incl. continuous/index/mark/premium-index variants,
  tickers, depth incl. RPI depth, trades, aggTrades, exchangeInfo)
- `data` — futures analytics (funding rate, premium index, open interest, long/short ratios, basis,
  delivery price, insurance fund balance, ADL risk, force orders, index constituents, delist schedule)
- `account` — authenticated account endpoints (balance v2/v3, account v2/v3, positionRisk v2/v3,
  account config, income, userTrades, commission, leverage brackets, position mode, multi-assets
  margin, fee burn, API trading status, portfolio margin account info, position margin history,
  rate limit orders, order/trade/income data downloads)
- `trading` — order lifecycle (create/test/get/cancel/modify, open/all orders, batch orders,
  algo orders, order-modify history, leverage/margin/countdown-cancel config, Convert
  quote/accept/status)
- `ops` — composite operations layered over the above: `symbolRules` (typed tick/step/notional
  filters), `quantize`, `sizePosition` (risk-based sizing), `closePosition`, `marketSnapshot`,
  `accountOverview`, `placeBracketOrder`
- `userStream` — listenKey lifecycle (create / keep-alive / close)
- `ws` — market WebSocket streams (kline, continuous/index/mark klines, aggTrade, trade, depth
  incl. full order-book diff-depth, ticker, rolling-window ticker + all-market variant, mark price,
  book ticker, mini ticker, liquidations, composite index, asset index + all-market/arr variants)
- `wsUser` — user data stream (ACCOUNT_UPDATE, ORDER_TRADE_UPDATE, MARGIN_CALL; auto-reconnect)
- `wsApi` — WebSocket API: signed trading (order.place/cancel/modify/status, algoOrder.place/cancel,
  orderList.place/cancel/status, account.status/position, userDataStream.start/ping/stop) and public
  market data (time, exchangeInfo, klines, aggTrades, trades, depth, avgPrice,
  ticker.price/bookTicker/24hr)

### Client options

`apiKey`, `apiSecret`, `privateKey` + `signatureAlgorithm` (Ed25519/RSA, instead of HMAC),
`testnet`, `demo`, `recvWindow`, `apiBase`, `wsBase`, `wsUserBase`, `wsApiBase`, `dapiBase`,
`wsSpotApiBase`, `wsDapiBase`, `timeoutMs`, `maxRetries`, `retryBaseDelayMs`, `retryMaxDelayMs`,
`rateLimitWeightPerMinute`, `rateLimitSafetyMargin`, `httpsAgent`, `proxy`, `safety`
(see [Agent safety](#agent-safety)).

### Reliability

- **Rate-limit tracking**: `RateLimitTracker` parses `X-MBX-USED-WEIGHT-*` /
  `X-MBX-ORDER-COUNT-*` response headers and delays queued requests once usage crosses a
  configurable safety margin (`rateLimitWeightPerMinute` / `rateLimitSafetyMargin`), to preempt
  `-1003` IP bans rather than react to them. Inspect the live per-host snapshot via
  `client.getRateLimitUsage()`.
- **Server time sync**: `client.syncTime()` fetches each REST host's server time and applies the
  offset to every signed request's `timestamp`, mitigating `-1021` errors from local clock drift.
- **Retry**: exponential backoff with jitter on `429`/`418`/`5xx`, configurable via
  `maxRetries`/`retryBaseDelayMs`/`retryMaxDelayMs`.

### Agent safety

`BinanceClientOptions.safety` configures a `TradingPolicy`, evaluated on every mutating request
before it leaves the process — for autonomous/LLM-driven callers where a misread prompt
shouldn't be able to spend the account. Shared across every product namespace.

```typescript
const client = new BinanceClient({
  apiKey, apiSecret,
  safety: {
    dryRun: true,                          // throws DryRunError instead of sending the request
    allowedSymbols: ['BTCUSDT', 'ETHUSDT'],
    maxNotionalPerOrder: 100,              // an order whose notional can't be verified is refused
    allowWithdrawals: false,               // default once `safety` is set at all
  },
});
```

- `dryRun` — intercepts `POST`/`PUT`/`DELETE` and throws `DryRunError` (carrying the request that
  would have been sent, via `.describe()`) instead of sending it. It never returns a synthetic
  success payload — a fabricated `orderId` would lead a caller to believe an order exists.
- `readOnly` — refuses mutating requests outright.
- `allowedSymbols` — rejects orders naming a symbol outside the list.
- `maxNotionalPerOrder` — caps a single order's notional (from `price*quantity` or
  `quoteOrderQty`); an order whose notional can't be determined (e.g. a MARKET order with no
  price) is refused rather than waved through.
- `allowWithdrawals` / `allowTransfers` / `blockedPaths` — withdrawals are denied by default the
  moment any `safety` config is set; transfers and arbitrary endpoints can be pinned off too.

Omitting `safety` entirely leaves behavior exactly as without a policy.

### Errors

`BinanceError` base, `BinanceAuthError`, `BinanceApiError` (`code`, `status`, `endpoint`,
`method`, response `headers`, plus `isRateLimitError()`/`isTimestampError()`/
`isInsufficientBalance()`), `RateLimitError` (`retryAfterMs`), `NetworkError`,
`PolicyViolationError` (a `TradingPolicy` rule blocked the request), `DryRunError` (dry-run
suppressed the request).

### Paper trading

Simulates fills against live public prices — nothing is sent to the exchange. Margin is locked
at the requested leverage and released pro-rata as a position is reduced.

```typescript
import { PaperTradingEngine } from '@nemesis-oss/binance-sdk';

const engine = new PaperTradingEngine({ initialBalance: 10_000 });
await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.05, leverage: 5 });
await engine.updatePositions();               // re-mark against live prices
const close = await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: 0.05 });
console.log(close.realizedPnl, engine.getAccountInfo().balance);
```

## LLM Tools & MCP

The SDK ships a framework-agnostic tool layer plus an MCP server, so any function-calling agent
(OpenAI, Anthropic/Claude, MCP hosts) can drive the client.

```ts
import { BinanceClient, createFuturesToolkit, toolkitToFormats } from '@nemesis-oss/binance-sdk';
const tk = createFuturesToolkit(new BinanceClient({ apiKey, apiSecret, testnet }));
const { openai, anthropic, mcp } = toolkitToFormats(tk); // tool schemas per format
```

- **Tool groups**: `market`, `account`, `trading` (USD-M futures), `spot` (Spot), `ws`
  (streams + WS API), `derived` (composites like size/close/bracket), `paper`.
- **MCP server**: `npx binance-sdk-mcp` (stdio) auto-registers every tool plus reference
  resources (`binance://futures/symbols`, `binance://futures/premium-index`, `binance://spot/symbols`).
  For local development against source instead of the published package, point your MCP host at
  `mcp-config/local-dev.json` (runs `npx tsx src/mcp/index.ts` directly).
- **Agent skills**: Markdown skills under `skills/` — futures trading / market-data / algo /
  portfolio-margin, plus spot trading / market-data — for Skills-Hub-style agents.

## Examples

```bash
npx tsx examples/quickstart.ts      # market data, symbol rules, risk-based sizing
npx tsx examples/ws-streams.ts      # live kline / trade / mark-price / book streams
npx tsx examples/paper-trading.ts   # simulated position lifecycle
```

## Development

```bash
npm install
npm test        # vitest, HTTP/WS mocked
npm run typecheck
npm run build   # tsup -> dist/ (ESM + CJS + .d.ts)
npm run smoke   # hits live public Binance endpoints, no keys needed
npm run smoke:testnet  # exercises COIN-M/Margin/Wallet/Sub-account/Spot-WS-API against
                        # Binance testnet (see script header for the required env vars);
                        # unauthenticated sections still run without keys
```

CI runs typecheck, build and tests on Node LTS and latest. Publishing to npm happens by
cutting a GitHub Release (`.github/workflows/release.yml` runs on `release: published`), a
separate, deliberate step — not on every push or tag.
