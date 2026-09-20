import type { ToolAnnotations, ToolDefinition } from './types.js';

/**
 * MCP `ToolAnnotations` for every tool in the toolkit — see the doc comment
 * on {@link ToolAnnotations} in `types.ts` for the vocabulary itself. This
 * file is the per-tool classification.
 *
 * Every entry below was assigned by reading that tool's actual handler —
 * which resource method it calls, whether that call mutates exchange
 * state, and whether the SDK gives it any idempotency guarantee — never
 * inferred from its name alone. A few distinctions are worth calling out
 * because they contradict what the name would suggest on its own:
 *
 *  - `futures_test_order` / `spot_test_order` hit Binance's dedicated
 *    validation-only endpoint (`/order/test`). It is genuinely read-only
 *    despite being a POST, and despite sitting next to "place a real
 *    order" tools in the same file.
 *  - `execution_place_order` / `execution_cancel_order` (the
 *    ExecutionGateway-routed tools) ARE idempotent — the SDK guarantees a
 *    duplicate `intentId` returns the original execution rather than
 *    acting twice (see `src/execution/ExecutionManager.ts`). Their raw-REST
 *    siblings `futures_new_order` / `futures_cancel_order` are NOT:
 *    nothing stops a retry from placing a second order.
 *  - Every `paper_*` tool is `openWorldHint: false`: it mutates only an
 *    in-memory simulator, never the real exchange, even though a couple of
 *    them read a live ticker price to mark the simulated position.
 *  - `execution_reconcile_order` and `futures_ws_subscriptions`/
 *    `futures_ws_events` are read-only even though they sit in
 *    "mutating"-heavy files: reconciliation only refreshes the SDK's local
 *    ledger view (it never sends an order/cancel itself), and listing
 *    subscriptions/buffered events doesn't touch anything either.
 */

const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
/** Mutates client-side or account-config state; not capital-affecting; repeated calls converge to the same state. */
const WRITE_SAFE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
/** Same as WRITE_SAFE but each call is a distinct action (e.g. queues a new async job) rather than converging. */
const WRITE_SAFE_ONCE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};
/** Places/cancels/modifies real orders or moves real assets; each call is a distinct, hard-to-reverse action. */
const WRITE_DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};
/** Destructive, but repeated calls with the same arguments converge to the same end state (e.g. "cancel all"). */
const WRITE_DESTRUCTIVE_CONVERGES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};
/** Destructive, but the SDK gives it a real idempotency guarantee (ExecutionGateway intentId). */
const WRITE_DESTRUCTIVE_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};
const PAPER_READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
/** Mutates only the local paper-trading state; distinct action per call. */
const PAPER_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
/** Mutates only the local paper-trading state; repeated calls converge (e.g. re-init to the same balance). */
const PAPER_WRITE_CONVERGES: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // ---- market-data.tools.ts: every tool is a public/apiKey GET read ----
  futures_ping: READ,
  futures_server_time: READ,
  futures_exchange_info: READ,
  futures_ticker_price: READ,
  futures_ticker_price_v2: READ,
  futures_ticker_24hr: READ,
  futures_book_ticker: READ,
  futures_book_ticker_v2: READ,
  futures_order_book: READ,
  futures_recent_trades: READ,
  futures_historical_trades: READ,
  futures_agg_trades: READ,
  futures_klines: READ,
  futures_continuous_klines: READ,
  futures_index_price_klines: READ,
  futures_mark_price_klines: READ,
  futures_trading_day_ticker: READ,
  futures_mark_price: READ,
  futures_funding_rate_history: READ,
  futures_funding_info: READ,
  futures_open_interest: READ,
  futures_open_interest_hist: READ,
  futures_top_long_short_account_ratio: READ,
  futures_top_long_short_position_ratio: READ,
  futures_global_long_short_ratio: READ,
  futures_taker_long_short_ratio: READ,
  futures_basis: READ,
  futures_asset_index: READ,
  futures_composite_index_info: READ,
  futures_insurance_balance: READ,
  futures_index_price_constituents: READ,
  futures_premium_index_klines: READ,
  futures_rpi_depth: READ,
  futures_delivery_price: READ,
  futures_symbol_adl_risk: READ,
  futures_adl_quantile: READ,
  futures_force_orders: READ,

  // ---- account.tools.ts ----
  futures_balance: READ,
  futures_account: READ,
  futures_balance_v2: READ,
  futures_account_v2: READ,
  futures_position_risk: READ,
  futures_income_history: READ,
  futures_user_trades: READ,
  futures_leverage_brackets: READ,
  futures_commission_rate: READ,
  futures_multi_assets_mode: READ,
  futures_set_multi_assets_mode: WRITE_DESTRUCTIVE_CONVERGES, // 7-day cooldown between toggles
  futures_fee_burn_status: READ,
  futures_set_fee_burn: WRITE_DESTRUCTIVE_CONVERGES,
  futures_position_mode: READ,
  futures_set_position_mode: WRITE_DESTRUCTIVE_CONVERGES, // 30-day cooldown between toggles
  futures_api_trading_status: READ,
  futures_position_margin_history: READ,
  futures_rate_limit_order: READ,
  futures_request_order_download: WRITE_SAFE_ONCE, // queues an async export job; no trading/capital effect
  futures_order_download_status: READ,
  futures_request_trade_download: WRITE_SAFE_ONCE,
  futures_trade_download_status: READ,
  futures_account_config: READ,
  futures_portfolio_margin_account_info: READ,
  futures_request_income_download: WRITE_SAFE_ONCE,
  futures_income_download_status: READ,

  // ---- trading.tools.ts ----
  futures_new_order: WRITE_DESTRUCTIVE,
  futures_test_order: READ, // Binance's dedicated validation-only endpoint -- never places anything
  futures_get_order: READ,
  futures_cancel_order: WRITE_DESTRUCTIVE,
  futures_get_open_order: READ,
  futures_open_orders: READ,
  futures_all_orders: READ,
  futures_cancel_all_orders: WRITE_DESTRUCTIVE_CONVERGES, // repeat calls converge to "no open orders"
  futures_modify_order: WRITE_DESTRUCTIVE,
  futures_order_modify_history: READ,
  futures_batch_orders: WRITE_DESTRUCTIVE,
  futures_cancel_batch_orders: WRITE_DESTRUCTIVE,
  futures_set_leverage: WRITE_DESTRUCTIVE_CONVERGES,
  futures_set_margin_type: WRITE_DESTRUCTIVE, // repeat call on an unchanged type errors rather than no-ops
  futures_modify_position_margin: WRITE_DESTRUCTIVE,
  futures_countdown_cancel_all: WRITE_DESTRUCTIVE_CONVERGES, // arms/disarms a timer; same value converges
  futures_new_algo_order: WRITE_DESTRUCTIVE,
  futures_cancel_algo_order: WRITE_DESTRUCTIVE,
  futures_cancel_all_algo_orders: WRITE_DESTRUCTIVE_CONVERGES,
  futures_get_algo_order: READ,
  futures_open_algo_orders: READ,
  futures_all_algo_orders: READ,
  futures_convert_exchange_info: READ,
  futures_convert_get_quote: WRITE_SAFE_ONCE, // requests a quote only; nothing converts until accepted
  futures_convert_accept_quote: WRITE_DESTRUCTIVE, // actually executes the conversion
  futures_convert_order_status: READ,

  // ---- spot.tools.ts ----
  spot_ping: READ,
  spot_server_time: READ,
  spot_exchange_info: READ,
  spot_ticker_price: READ,
  spot_ticker_24hr: READ,
  spot_book_ticker: READ,
  spot_order_book: READ,
  spot_recent_trades: READ,
  spot_historical_trades: READ,
  spot_agg_trades: READ,
  spot_klines: READ,
  spot_ui_klines: READ,
  spot_avg_price: READ,
  spot_rolling_window_ticker: READ,
  spot_trading_day_ticker: READ,
  spot_account: READ,
  spot_my_trades: READ,
  spot_my_prevented_matches: READ,
  spot_account_commission: READ,
  spot_rate_limit_order: READ,
  spot_new_order: WRITE_DESTRUCTIVE,
  spot_test_order: READ, // validation-only, see file header
  spot_get_order: READ,
  spot_cancel_order: WRITE_DESTRUCTIVE,
  spot_open_orders: READ,
  spot_all_orders: READ,
  spot_cancel_open_orders: WRITE_DESTRUCTIVE_CONVERGES,
  spot_cancel_replace_order: WRITE_DESTRUCTIVE,
  spot_new_oco_order: WRITE_DESTRUCTIVE,
  spot_cancel_oco_order: WRITE_DESTRUCTIVE,
  spot_get_oco_order: READ,
  spot_open_oco_orders: READ,
  spot_all_oco_orders: READ,
  spot_cancel_open_oco_orders: WRITE_DESTRUCTIVE_CONVERGES,
  spot_ws_start_user_stream: WRITE_SAFE_ONCE,
  spot_ws_stop_user_stream: WRITE_SAFE,

  // ---- derived.tools.ts ----
  futures_symbol_rules: READ,
  futures_quantize: READ,
  futures_size_position: READ, // computes and reports; never places an order
  futures_close_position: WRITE_DESTRUCTIVE, // places a real reduce-only order unless dryRun is set
  futures_market_snapshot: READ,
  futures_account_overview: READ,
  futures_place_bracket_order: WRITE_DESTRUCTIVE,

  // ---- execution.tools.ts: ExecutionGateway-routed, SDK-guaranteed idempotency ----
  execution_place_order: WRITE_DESTRUCTIVE_IDEMPOTENT,
  execution_cancel_order: WRITE_DESTRUCTIVE_IDEMPOTENT,
  execution_get_order: READ,
  execution_list_orders: READ,
  execution_reconcile_order: READ, // refreshes the local ledger; never mutates the exchange itself
  execution_status: READ, // "Read-only, never places orders" per its own description

  // ---- ws.tools.ts: subscribe/unsubscribe mutate local client state only ----
  futures_ws_subscribe: WRITE_SAFE,
  futures_ws_unsubscribe: WRITE_SAFE,
  futures_ws_subscriptions: READ,
  futures_ws_events: READ,
  futures_ws_clear_events: WRITE_SAFE,
  futures_ws_start_user_stream: WRITE_SAFE_ONCE,
  futures_ws_stop_user_stream: WRITE_SAFE,
  futures_ws_api_order_status: READ,
  futures_ws_api_account_status: READ,
  futures_ws_api_account_position: READ,
  futures_ws_api_user_data_stream_start: WRITE_SAFE_ONCE,
  futures_ws_api_user_data_stream_stop: WRITE_SAFE,
  futures_ws_api_ticker_price: READ,
  futures_ws_api_order_book: READ,

  // ---- paper.tools.ts: local simulator only, no real capital or exchange state ----
  paper_init: PAPER_WRITE_CONVERGES,
  paper_balance: PAPER_READ,
  paper_open_position: PAPER_WRITE,
  paper_close_position: PAPER_WRITE,
  paper_positions: PAPER_READ,
  paper_history: PAPER_READ,
  paper_summary: PAPER_READ,
};

/**
 * Fallback for a tool added without a matching entry above. Deliberately
 * the most cautious classification (mutating, destructive, not idempotent,
 * open-world) rather than the most permissive — a host that over-prompts
 * for confirmation on a genuinely-safe new tool is a papercut; one that
 * silently trusts a genuinely-risky new tool is not.
 */
const FALLBACK_PAPER: ToolAnnotations = PAPER_WRITE;
const FALLBACK_DEFAULT: ToolAnnotations = WRITE_DESTRUCTIVE;

export function classifyToolAnnotations(name: string): ToolAnnotations {
  const known = TOOL_ANNOTATIONS[name];
  if (known) return known;
  return name.startsWith('paper_') ? FALLBACK_PAPER : FALLBACK_DEFAULT;
}

/** Attach annotations (in place) to every tool that doesn't already carry one. */
export function annotateTools<T extends ToolDefinition[]>(tools: T): T {
  for (const tool of tools) {
    if (!tool.annotations) tool.annotations = classifyToolAnnotations(tool.name);
  }
  return tools;
}
