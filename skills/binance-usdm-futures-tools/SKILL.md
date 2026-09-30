---
name: binance-usdm-futures-tools
description: "LLM tool-calling + MCP + agent skill for Binance USD-M Futures. Use the binance-sdk tool layer. Public market data (no auth) first, then private signed endpoints on explicit user confirmation."
metadata:
  version: 1.0.0
  package: '@nemesis-oss/binance-sdk'
  mcp: binance-sdk-mcp
---

# Binance USDⓈ-M Futures — LLM Tools & MCP

Wired once in [`binance-sdk`](https://github.com/shubhamtaywade82/binance-sdk), used everywhere
(chat-ui, trading-agent-ts, any MCP-capable agent). All tool names below are stable SDK entry points; the
host (MCP server `binance-sdk-mcp`, or a chat-ui's `createFuturesToolkit(...)` output) exposes them to the model.

## Connection & Auth

- Configure once via env: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_TESTNET=true` (→ `testnet.binancefuture.com`).
- Public market-data tools are **unsigned**; account/trade/private tools are **signed** and require the keys above.
- Base URLs (live, 2026 USDⓈ-M WS routing — legacy `/stream` and `/ws` paths shut down April 23, 2026):
  REST `https://fapi.binance.com`, WS market streams `wss://fstream.binance.com/market/stream`,
  WS public aggregate streams `wss://fstream.binance.com/public/stream`,
  WS user data `wss://fstream.binance.com/public/ws`, WS API `wss://ws-fapi.binance.com/ws-fapi/v1`.
- Rate limits: **2400 weight/min** (REST, per IP) + **1200 orders/10s** + 300 orders/10s/uid (WS API). The SDK
  paces every request through a local Bottleneck queue; it does not yet read back the
  `X-MBX-USED-WEIGHT-*` / `X-MBX-ORDER-COUNT-*` response headers, so leave headroom under the caps above.

## Trigger

Use these tools when the user asks about Binance **USD-M futures** (tickers, order books, trades, klines,
funding, open interest, positions, balances, orders) — whether for live data, execution, or a chat-ui /
trading-agent analysis. Do **not** use for spot, COIN-M, or Delta-Exchange contexts.

## Rules (KISS / Safety)

1. **Public-first.** Satisfy analysis questions from the market-data tools before any signed call.
2. **Symbols** are always uppercase USD-M pair form, e.g. `BTCUSDT`, `ETHUSDT`, `ETHBTC`. For index/pair
   queries (klines, basis) pass the base pair.
3. **No destructive action without `CONFIRM`.** Placing/cancelling/modifying orders requires the user to
   type `CONFIRM` (or set explicit allowance). Read-only tools never need it.
4. **Validate before trading.** Fetch `futures_exchange_info`, symbol tick, mark price, and open interest
   before sizing; confirm the symbol is TRADING.
5. **Depth + klines**: order-book snapshots come from `futures_order_book`; live updates come as deltas
   over WebSocket via `futures_ws_subscribe` + `futures_ws_events` and must be **applied to the snapshot**.
6. **Prefer a composite over a chain.** Where a composite tool exists (below), use it instead of chaining
   primitives — they exist to keep tick/step arithmetic and mode-dependent order fields out of the model.

## Composite Tools (prefer these)

Each fans out over several endpoints and returns one answer. Round-off and mode handling live here,
not in the model.

| Tool | Replaces | Why it exists |
| ------ | ---------- | --------------- |
| `futures_symbol_rules` | `futures_exchange_info` + filter parsing | Flattens the `filters` array into typed tickSize / stepSize / minQty / maxQty / minNotional. |
| `futures_quantize` | manual rounding | Rounds a price to the tick and a quantity to the step, returning **exchange-ready strings**. Off-tick values are rejected with `-1111`. |
| `futures_size_position` | exchangeInfo + markPrice + balance + arithmetic | Turns a risk budget (`riskAmount` or `riskPct`) plus a stop into a step-aligned quantity, and reports every failed constraint (min notional, lot bounds, wrong-side stop) instead of quietly adjusting risk. |
| `futures_close_position` | `futures_position_risk` + `futures_new_order` | Derives the closing side from the position sign and picks `reduceOnly` (one-way) vs `positionSide` (hedge) — Binance rejects the wrong one. Supports `portion` and `dryRun`. |
| `futures_market_snapshot` | 4 market-data calls | 24h stats + mark/funding + open interest + long/short in one call; a failing feed degrades to an `error` field. |
| `futures_account_overview` | balance + positions + open orders | Funded balances, non-flat positions, working orders, and PnL/notional totals. |
| `futures_place_bracket_order` | 3 `futures_new_order` calls | Entry + stop-loss + optional take-profit, all tick-quantized. If a protective leg fails it returns `protectionComplete: false`; the entry is **not** auto-cancelled since it may already have filled — resolve manually. |

**Never do tick/step arithmetic yourself.** `futures_quantize` or `futures_size_position` returns the
string to send. Floating-point rounding in the model is the most common source of `-1111` (precision)
and `-4164` (min notional) rejections.

## Public — Market Data Tools (unsigned)

| Tool | Purpose |
| ------ | --------- |
| `futures_ping` | Test connectivity (REST). |
| `futures_server_time` | Server time in ms. |
| `futures_exchange_info` | Symbol/metadata, contract types, filters, delivery dates. |
| `futures_ticker_price` | Latest price for one symbol (v1). |
| `futures_ticker_price_v2` | Latest price, one symbol or **all**. |
| `futures_ticker_24hr` | 24h change stats (price, volume, open interest, high/low). |
| `futures_book_ticker` | Best bid/ask for one symbol (v1). |
| `futures_book_ticker_v2` | Best bid/ask, one symbol or **all**. |
| `futures_order_book` | Order-book depth (limits 5/10/20/50/100/500/1000/5000). |
| `futures_rpi_depth` | Retail Price Improvement order-book depth. |
| `futures_recent_trades` | Most recent trades. |
| `futures_historical_trades` | Older trades by `fromId`. |
| `futures_agg_trades` | Compressed/aggregate trades. |
| `futures_klines` | Candlesticks (1m…1M; max 1500). |
| `futures_continuous_klines` | Continuous-contract klines (perpetual/current_quarter/next_quarter). |
| `futures_index_price_klines` | Index-price klines. |
| `futures_mark_price_klines` | Mark-price klines. |
| `futures_premium_index_klines` | Premium-index klines (mark price premium over index). |
| `futures_trading_day_ticker` | Trading-day rolling ticker stats. |
| `futures_mark_price` | Mark+index price, funding rate, next funding time. |
| `futures_funding_rate_history` | Historical funding rates. |
| `futures_funding_info` | Adjusted cap/floor/interval funding config. |
| `futures_open_interest` | Current open interest. |
| `futures_open_interest_hist` | Historical open-interest stats (per period). |
| `futures_top_long_short_account_ratio` | Top-trader L/S by account count. |
| `futures_top_long_short_position_ratio` | Top-trader L/S by position. |
| `futures_global_long_short_ratio` | Global L/S account ratio. |
| `futures_taker_long_short_ratio` | Taker buy/sell volume ratio. |
| `futures_basis` | Spot-futures basis (per pair/contract type). |
| `futures_asset_index` | Multi-assets-mode collateral index (one or all). |
| `futures_composite_index_info` | Composite-index constituents (e.g. DEFIUSDT). |
| `futures_insurance_balance` | Insurance-fund balance snapshots. |
| `futures_index_price_constituents` | Exchange weights for an index price. |
| `futures_delivery_price` | Historical quarterly-contract settlement/delivery prices. |
| `futures_convert_exchange_info` | Asset pairs eligible for futures Convert. |
| `futures_symbol_adl_risk` | ADL risk level for a symbol or all symbols (signed). |
| `futures_adl_quantile` | Position ADL quantile (signed). |
| `futures_force_orders` | Force orders (liquidations/ADL) (signed). |

## Real-time — WebSocket Tools (public)

Subscribe → poll buffered events → act on the parsed payloads:

| Tool | Purpose |
| ------ | --------- |
| `futures_ws_subscribe` | Subscribe to one or more topics, e.g. `btcusdt@aggTrade`, `btcusdt@kline_1m`, `btcusdt@depth20`, `btcusdt@markPrice@1s`, `btcusdt@bookTicker`, `btcusdt@ticker`, `!ticker@arr`, `!markPrice@arr`, `!forceOrder@arr`. |
| `futures_ws_unsubscribe` | Unsubscribe topics. |
| `futures_ws_subscriptions` | List active subscriptions. |
| `futures_ws_events` | Read buffered payloads for subscribed streams (depth deltas are incremental; apply to `futures_order_book`). |
| `futures_ws_clear_events` | Flush the buffer. |
| `futures_ws_start_user_stream` | Start the private user data stream (listenKey + keep-alive). |
| `futures_ws_stop_user_stream` | Stop & invalidate the user data stream. |

## Private — Account Tools (signed, USER_DATA)

| Tool | Purpose |
| ------ | --------- |
| `futures_balance` | Balances (v3): asset, wallet/margin/unrealized. |
| `futures_account` | Full account snapshot (v3). |
| `futures_account_config` | Fee tier, trading permissions, dual-side position setting. |
| `futures_position_risk` | Open positions (v3): entry, mark, liq, leverage, unrealized PnL. |
| `futures_income_history` | Income (realized PnL, funding, commission,…). |
| `futures_user_trades` | Filled trades for a symbol. |
| `futures_leverage_brackets` | Notional/leverage tier caps. |
| `futures_commission_rate` | User taker/maker fees for a symbol. |
| `futures_multi_assets_mode` / `futures_set_multi_assets_mode` | Collateral mode (7-day cooldown). |
| `futures_fee_burn_status` / `futures_set_fee_burn` | BNB fee burn on/off. |
| `futures_position_mode` / `futures_set_position_mode` | One-way vs hedge mode (30-day cooldown). |
| `futures_api_trading_status` | Trading-rule indicators & disable intervals. |
| `futures_portfolio_margin_account_info` | Portfolio Margin cross balance/liability for an asset. |
| `futures_position_margin_history` | Isolated position margin add/reduce history. |
| `futures_rate_limit_order` | Current order-rate limit usage. |
| `futures_request_order_download` / `futures_order_download_status` | Async order-history export. |
| `futures_request_trade_download` / `futures_trade_download_status` | Async trade-history export. |
| `futures_request_income_download` / `futures_income_download_status` | Async income/transaction-history export. |

## Private — Trading Tools (signed, TRADE)

Order types: `LIMIT`, `MARKET`, `STOP`, `STOP_MARKET`, `TAKE_PROFIT`, `TAKE_PROFIT_MARKET`, `TRAILING_STOP_MARKET`.
`priceProtect` + `workingType=MARK_PRICE` are recommended for stop triggers.

| Tool | Purpose |
| ------ | --------- |
| `futures_new_order` | Place order (returns ACK; use `newOrderRespType=RESULT` for immediate fill state). |
| `futures_test_order` | Validate a draft order without submitting. |
| `futures_get_order` | Query a specific order. |
| `futures_cancel_order` | Cancel an open order. |
| `futures_get_open_order` | Current open order. |
| `futures_open_orders` | All open orders (one symbol or all). |
| `futures_all_orders` | Historical orders (7-day window). |
| `futures_cancel_all_orders` | Cancel all for a symbol. |
| `futures_modify_order` | Patch an open order (price/qty/stop). |
| `futures_order_modify_history` | Modification history. |
| `futures_batch_orders` | Place up to 5 orders atomically. |
| `futures_cancel_batch_orders` | Cancel many by id list. |
| `futures_set_leverage` | Change leverage (1–125). |
| `futures_set_margin_type` | Isolated vs cross (close all positions first). |
| `futures_modify_position_margin` | Add/remove isolated margin (type 1/2). |
| `futures_countdown_cancel_all` | Auto-cancel after N ms circuit-breaker. |
| `futures_new_algo_order` | Conditional / VP algo order. |
| `futures_cancel_algo_order` | Cancel an algo order. |
| `futures_cancel_all_algo_orders` | Cancel all algo orders for a symbol. |
| `futures_get_algo_order` | Query an algo order. |
| `futures_open_algo_orders` | All open algo orders. |
| `futures_all_algo_orders` | Historical algo orders. |
| `futures_convert_get_quote` | Request a Convert quote between two assets (expires quickly). |
| `futures_convert_accept_quote` | Accept a Convert quote by `quoteId`. |
| `futures_convert_order_status` | Query a Convert order by `orderId` or `quoteId`. |

## MCP Resources

Besides tools, the server exposes reference data as MCP resources, which a host can attach to
context directly without the model calling anything first:

| URI | Contents |
|-----|----------|
| `binance://futures/symbols` | Every tradeable USD-M symbol with contract type and status. |
| `binance://futures/premium-index` | Mark/index price and funding across all pairs. |

## LLM Wiring (one-time)

- **MCP server:** `npx binance-sdk-mcp` (stdio) or `BINANCE_API_KEY=… BINANCE_API_SECRET=… npx binance-sdk-mcp --http` (HTTP health on `:PORT`).
  Configure the MCP host (Claude Desktop / Cursor / Claude Code) with
  `command: npx`, `args: ["binance-sdk-mcp"]`. (Stdio transport; no URL needed.)
- **Direct SDK:**

  ```ts
  import { BinanceClient, createFuturesToolkit, toolkitToFormats } from '@nemesis-oss/binance-sdk';
  const client = new BinanceClient({ apiKey, apiSecret, testnet });
  const tk = createFuturesToolkit(client);
  const openaiTools = toolkitToFormats(tk).openai;      // for function-calling agents
  const anthropicTools = toolkitToFormats(tk).anthropic; // for Claude tool use
  const mcpTools = toolkitToFormats(tk).mcp;            // raw JSON-schemas
  await tk.tools.find(t => t.name === 'futures_new_order')!.handler({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.001 }, { env: 'live', isSigned: true });
  ```

- The toolkit is generic over a `BinanceClient` instance, so the same tool
  set is reused by **chat-ui** (OpenAI tools), **Claude Code/Cursor** (MCP), and
  **trading-agent-ts** (Anthropic tools) — single wire-up, no duplication.

## Notes

- `recvWindow` is fixed to 5000 ms; increase only if server clock skew is observed.
- The **primitive** order tools (`futures_new_order`, `futures_modify_order`, …) pass price/qty through
  un-rounded. Get the values from `futures_quantize` / `futures_size_position` first, or call
  `futures_place_bracket_order`, which quantizes internally.
- WebSocket topics are always lowercase; symbol-less aggregate topics begin with `!`.

## Layering

```
resources (client.futures.market|data|account|trading)   REST, one endpoint per method, typed
        ↑
client.futures.ops                                       composites — fan-out + arithmetic
        ↑
tools (91 primitive + 7 composite)                       LLM/MCP surface
```

Composites compose the **resource** layer, never other tool handlers: handlers return formatted JSON
strings, so handler-to-handler calls would add a parse/stringify round-trip per step and lose the
zod-parsed numeric types. Anything new that needs more than one endpoint belongs in `FuturesOps`.
