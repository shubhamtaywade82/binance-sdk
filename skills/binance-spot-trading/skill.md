---
name: binance-spot-trading
description: "LLM tool-calling + MCP for Binance Spot trading. Use the binance-sdk Spot layer (client.spot.account / client.spot.trading) for balances, orders, cancel-replace and OCO order lists. Public market data first; signed order/account actions only on explicit CONFIRM."
metadata:
  version: 1.0.0
  package: '@nemesis-oss/binance-sdk'
  mcp: binance-sdk-mcp
---

# Binance Spot — Trading & Account Tools

Wired once in [`binance-sdk`](https://github.com/shubhamtaywade82/binance-sdk) and exposed to
any MCP-capable agent through `binance-sdk-mcp` or `createFuturesToolkit(...)` (the toolkit now also
returns a `spot` group). Use for **Spot** (not USD-M futures, COIN-M, or Options).

## Connection & Auth

- Env: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_TESTNET=true` (→ `testnet.binance.vision`).
- Public market-data tools are unsigned; account/trade tools are signed.
- Base URL (live): REST `https://api.binance.com/api/v3`; user-data WS `wss://stream.binance.com:9443/ws`.

## Rules (KISS / Safety)

1. **Public-first** — answer analysis questions from `spot_*` market-data tools before any signed call.
2. **Symbols** are uppercase Spot pairs, e.g. `BTCUSDT`, `ETHBTC`.
3. **No destructive action without `CONFIRM`** — placing/cancelling/replacing orders or OCO lists needs
   the user to type `CONFIRM` (or an explicit allowance). Reads never need it.
4. **Validate before trading** — fetch `spot_exchange_info`, then `spot_ticker_price` / `spot_order_book`
   to confirm the symbol is TRADING and the price is sane before sizing.
5. **Use `spot_test_order`** to validate a draft order (and margin) before submitting.

## Account Tools (signed)

| Tool | Purpose |
| ------ | --------- |
| `spot_account` | Balances (free/locked), commissions, permissions. |
| `spot_my_trades` | Filled trades for a symbol (time range / fromId). |
| `spot_my_prevented_matches` | Orders expired by self-trade-prevention (STP). |
| `spot_account_commission` | Commission rates for a symbol. |
| `spot_rate_limit_order` | Current order rate-limit usage. |

## Trading Tools (signed)

Spot order types: `LIMIT`, `MARKET`, `LIMIT_MAKER`, `STOP_LOSS`, `STOP_LOSS_LIMIT`, `TAKE_PROFIT`,
`TAKE_PROFIT_LIMIT`. `MARKET` accepts `quantity` **or** `quoteOrderQty` (spend N quote units).

| Tool | Purpose |
| ------ | --------- |
| `spot_new_order` | Place an order (returns ACK; use `newOrderRespType=RESULT`/`FULL` for fill state). |
| `spot_test_order` | Validate without submitting. |
| `spot_get_order` | Query a specific order. |
| `spot_cancel_order` | Cancel an open order. |
| `spot_open_orders` | Open orders (one symbol or all). |
| `spot_all_orders` | Historical orders. |
| `spot_cancel_open_orders` | Cancel all for a symbol. |
| `spot_cancel_replace_order` | Cancel-replace (cancel + new order atomically). |

## OCO Order List Tools (signed)

A Spot OCO is one stop-loss limit + one limit-maker take-profit that cancel each other.

| Tool | Purpose |
| ------ | --------- |
| `spot_new_oco_order` | Create an OCO (price + stopPrice; optional stopLimitPrice). |
| `spot_get_oco_order` | Query an OCO by `orderListId` / `listClientOrderId`. |
| `spot_cancel_oco_order` | Cancel an entire OCO list. |
| `spot_open_oco_orders` | All open OCO lists. |
| `spot_all_oco_orders` | Historical OCO lists. |
| `spot_cancel_open_oco_orders` | Cancel all OCO lists for a symbol. |

## User Data Stream

| Tool | Purpose |
|------|---------|
| `spot_ws_start_user_stream` | Connect the WebSocket API and subscribe to the user data stream. |
| `spot_ws_stop_user_stream` | Close the connection, ending the subscription. |

Events (via `client.spot.wsUser`): `executionReport`, `outboundAccountPosition`, `balanceUpdate`, `listStatus`.

## MCP Resources

| URI | Contents |
|-----|----------|
| `binance://spot/symbols` | Every tradeable Spot symbol with status, base/quote assets and permissions. |

## LLM Wiring (one-time)

```ts
import { BinanceClient, createFuturesToolkit } from '@nemesis-oss/binance-sdk';
const client = new BinanceClient({ apiKey, apiSecret, testnet });
const tk = createFuturesToolkit(client);
await tk.spot.find(t => t.name === 'spot_new_order')!.handler(
  { symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: '0.001', price: '60000', timeInForce: 'GTC' },
  { env: 'live', isSigned: true },
);
```

## Notes

- Spot `LIMIT` orders **require** `timeInForce` (GTC/IOC/FOK). `LIMIT_MAKER` is a post-only limit (no `timeInForce`).
- Pass `quoteOrderQty` (instead of `quantity`) to buy a MARKET order by spend amount.
