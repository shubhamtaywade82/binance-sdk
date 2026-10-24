import { z } from 'zod';
import type { BinanceClient } from '../client/BinanceClient.js';
import { KlineIntervalSchema } from '../types/market.types.js';
import type { ToolDefinition } from './types.js';
import { textResult, normalizeSymbol } from './types.js';

const spotSymbol = z.string().min(1).describe('Spot pair, e.g. BTCUSDT');
const optionalSymbol = z.string().min(1).describe('Spot pair, e.g. BTCUSDT').optional();
const limit = z.number().int().positive().max(1000).default(100);
const startTime = z.number().int().positive().optional();
const endTime = z.number().int().positive().optional();
const side = z.enum(['BUY', 'SELL']);

export const spotOrderParamsSchema = z.object({
  symbol: spotSymbol,
  side,
  type: z.enum(['LIMIT', 'MARKET', 'LIMIT_MAKER', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT']),
  quantity: z.union([z.string(), z.number()]).optional().describe('Base-asset quantity; omit if using quoteOrderQty'),
  quoteOrderQty: z.union([z.string(), z.number()]).optional().describe('Quote-asset quantity (e.g. spend 100 USDT on a MARKET order)'),
  price: z.union([z.string(), z.number()]).optional().describe('Required for LIMIT / STOP_LOSS_LIMIT / TAKE_PROFIT_LIMIT'),
  stopPrice: z.union([z.string(), z.number()]).optional().describe('Trigger price for STOP_LOSS / TAKE_PROFIT variants'),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional().describe('Required for LIMIT'),
  newClientOrderId: z.string().optional(),
  newOrderRespType: z.enum(['ACK', 'RESULT', 'FULL']).optional(),
  icebergQty: z.union([z.string(), z.number()]).optional(),
  selfTradePreventionMode: z.enum(['NONE', 'EXPIRE_TAKER', 'EXPIRE_MAKER', 'EXPIRE_BOTH']).optional(),
});

export function spotTools(client: BinanceClient): ToolDefinition[] {
  const m = client.spot.market;
  const a = client.spot.account;
  const t = client.spot.trading;

  const tools: ToolDefinition[] = [
    // ---- Market data (public) ----
    {
      name: 'spot_ping',
      description: 'Test connectivity to the Binance Spot REST API.',
      inputSchema: z.object({}),
      handler: async () => textResult(await m.ping()),
    },
    {
      name: 'spot_server_time',
      description: 'Get the current Binance Spot server time in ms since epoch.',
      inputSchema: z.object({}),
      handler: async () => textResult(await m.serverTime()),
    },
    {
      name: 'spot_exchange_info',
      description: 'Get Spot exchange trading rules and symbol metadata (status, base/quote assets, filters, permissions).',
      inputSchema: z.object({}),
      handler: async () => textResult(await m.exchangeInfo()),
    },
    {
      name: 'spot_ticker_price',
      description: 'Get the latest price for a Spot symbol.',
      inputSchema: z.object({ symbol: spotSymbol }),
      handler: async ({ symbol }) => textResult(await m.tickerPrice(normalizeSymbol(symbol))),
    },
    {
      name: 'spot_ticker_24hr',
      description: 'Get 24-hour rolling price change statistics for a Spot symbol.',
      inputSchema: z.object({ symbol: spotSymbol }),
      handler: async ({ symbol }) => textResult(await m.ticker24hr(normalizeSymbol(symbol))),
    },
    {
      name: 'spot_book_ticker',
      description: 'Get the best bid/ask (top of book) for a Spot symbol.',
      inputSchema: z.object({ symbol: spotSymbol }),
      handler: async ({ symbol }) => textResult(await m.bookTicker(normalizeSymbol(symbol))),
    },
    {
      name: 'spot_order_book',
      description: 'Get the Spot order book depth for a symbol (limits 5/10/20/50/100/500/1000/5000).',
      inputSchema: z.object({
        symbol: spotSymbol,
        limit: z.enum(['5', '10', '20', '50', '100', '500', '1000', '5000']).default('100'),
      }),
      handler: async ({ symbol, limit }) => textResult(await m.depth(normalizeSymbol(symbol), Number(limit))),
    },
    {
      name: 'spot_recent_trades',
      description: 'Get the most recent executed trades for a Spot symbol.',
      inputSchema: z.object({ symbol: spotSymbol, limit: limit.default(500) }),
      handler: async ({ symbol, limit }) => textResult(await m.trades(normalizeSymbol(symbol), Number(limit))),
    },
    {
      name: 'spot_historical_trades',
      description: 'Get older Spot trades for a symbol by fromId.',
      inputSchema: z.object({ symbol: spotSymbol, limit: limit.default(500), fromId: z.number().int().positive().optional() }),
      handler: async ({ symbol, limit, fromId }) =>
        textResult(await m.historicalTrades(normalizeSymbol(symbol), { limit: Number(limit), fromId })),
    },
    {
      name: 'spot_agg_trades',
      description: 'Get compressed/aggregate Spot trades for a symbol within an optional time window.',
      inputSchema: z.object({ symbol: spotSymbol, limit: limit.default(500), startTime, endTime }),
      handler: async ({ symbol, limit, startTime, endTime }) =>
        textResult(await m.aggTrades(normalizeSymbol(symbol), { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'spot_klines',
      description: 'Get Spot candlesticks (OHLCV). Intervals 1m…1M; max 1000 per request.',
      inputSchema: z.object({ symbol: spotSymbol, interval: KlineIntervalSchema, limit: limit.default(500), startTime, endTime }),
      handler: async ({ symbol, interval, limit, startTime, endTime }) =>
        textResult(await m.klines(normalizeSymbol(symbol), interval, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'spot_ui_klines',
      description: 'Get Spot candlesticks via the optimized uiKlines endpoint (same shape as spot_klines).',
      inputSchema: z.object({ symbol: spotSymbol, interval: KlineIntervalSchema, limit: limit.default(500), startTime, endTime }),
      handler: async ({ symbol, interval, limit, startTime, endTime }) =>
        textResult(await m.uiKlines(normalizeSymbol(symbol), interval, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'spot_avg_price',
      description: 'Get the current average price (5-minute rolling average) for a Spot symbol.',
      inputSchema: z.object({ symbol: spotSymbol }),
      handler: async ({ symbol }) => textResult(await m.avgPrice(normalizeSymbol(symbol))),
    },
    {
      name: 'spot_rolling_window_ticker',
      description: 'Get rolling-window price change statistics (1d/7d/30d). Omit symbol for all symbols.',
      inputSchema: z.object({
        symbol: optionalSymbol,
        windowSize: z.enum(['1d', '7d', '30d']).optional(),
      }),
      handler: async ({ symbol, windowSize }) =>
        textResult(await m.rollingWindowTicker(symbol ? normalizeSymbol(symbol) : undefined, windowSize)),
    },
    {
      name: 'spot_trading_day_ticker',
      description: 'Get the Spot trading-day ticker (open/close/high/low/volume by UTC day). Omit symbol for all symbols.',
      inputSchema: z.object({ symbol: optionalSymbol, timeZone: z.string().optional(), type: z.enum(['FULL', 'MINI']).optional() }),
      handler: async ({ symbol, timeZone, type }) =>
        textResult(await m.tradingDayTicker(symbol ? normalizeSymbol(symbol) : undefined, { timeZone, type })),
    },

    // ---- Account (signed) ----
    {
      name: 'spot_account',
      description: 'Get the Spot account: balances (free/locked), commissions, permissions (signed).',
      inputSchema: z.object({}),
      handler: async () => textResult(await a.account()),
    },
    {
      name: 'spot_my_trades',
      description: 'Get the Spot account trade list (filled trades) for a symbol with optional time range (signed).',
      inputSchema: z.object({ symbol: spotSymbol, orderId: z.number().int().positive().optional(), startTime, endTime, fromId: z.number().int().positive().optional(), limit: limit.default(500) }),
      handler: async ({ symbol, orderId, startTime, endTime, fromId, limit }) =>
        textResult(await a.myTrades(normalizeSymbol(symbol), { orderId, startTime, endTime, fromId, limit: Number(limit) })),
    },
    {
      name: 'spot_my_prevented_matches',
      description: 'Get Spot orders that were expired by the self-trade-prevention (STP) mechanism (signed).',
      inputSchema: z.object({ symbol: spotSymbol, preventedMatchId: z.number().int().positive().optional(), orderId: z.number().int().positive().optional(), limit: limit.default(500) }),
      handler: async ({ symbol, preventedMatchId, orderId, limit }) =>
        textResult(await a.myPreventedMatches(normalizeSymbol(symbol), { preventedMatchId, orderId, limit: Number(limit) })),
    },
    {
      name: 'spot_account_commission',
      description: 'Get the Spot account commission rates for a symbol (signed).',
      inputSchema: z.object({ symbol: spotSymbol }),
      handler: async ({ symbol }) => textResult(await a.accountCommission(normalizeSymbol(symbol))),
    },
    {
      name: 'spot_rate_limit_order',
      description: 'Query the current Spot order rate limit usage (signed).',
      inputSchema: z.object({}),
      handler: async () => textResult(await a.rateLimitOrder()),
    },

    // ---- Trading (signed) ----
    {
      name: 'spot_new_order',
      description: 'Place a new Spot order. Types: LIMIT, MARKET, LIMIT_MAKER, STOP_LOSS, STOP_LOSS_LIMIT, TAKE_PROFIT, TAKE_PROFIT_LIMIT. For MARKET orders use quantity OR quoteOrderQty. Signed.',
      inputSchema: spotOrderParamsSchema,
      handler: async (args) => textResult(await t.createOrder({ ...args, symbol: normalizeSymbol(args.symbol) })),
    },
    {
      name: 'spot_test_order',
      description: 'Validate a Spot order without submitting it. Signed.',
      inputSchema: spotOrderParamsSchema,
      handler: async (args) => textResult(await t.testOrder({ ...args, symbol: normalizeSymbol(args.symbol) })),
    },
    {
      name: 'spot_get_order',
      description: 'Query a specific Spot order by orderId or client order id. Signed.',
      inputSchema: z.object({ symbol: spotSymbol, orderId: z.number().int().positive().optional(), origClientOrderId: z.string().optional() }),
      handler: async ({ symbol, orderId, origClientOrderId }) =>
        textResult(await t.getOrder(normalizeSymbol(symbol), { orderId, origClientOrderId })),
    },
    {
      name: 'spot_cancel_order',
      description: 'Cancel a specific open Spot order by orderId or client order id. Signed.',
      inputSchema: z.object({ symbol: spotSymbol, orderId: z.number().int().positive().optional(), origClientOrderId: z.string().optional(), newClientOrderId: z.string().optional() }),
      handler: async ({ symbol, orderId, origClientOrderId, newClientOrderId }) =>
        textResult(await t.cancelOrder(normalizeSymbol(symbol), { orderId, origClientOrderId, newClientOrderId })),
    },
    {
      name: 'spot_open_orders',
      description: 'Get all current open Spot orders, for one symbol or all symbols. Signed.',
      inputSchema: z.object({ symbol: optionalSymbol }),
      handler: async ({ symbol }) => textResult(await t.getOpenOrders(symbol ? normalizeSymbol(symbol) : undefined)),
    },
    {
      name: 'spot_all_orders',
      description: 'Get historical Spot orders for a symbol with optional time range. Signed.',
      inputSchema: z.object({ symbol: spotSymbol, orderId: z.number().int().positive().optional(), startTime, endTime, limit }),
      handler: async ({ symbol, orderId, startTime, endTime, limit }) =>
        textResult(await t.getAllOrders(normalizeSymbol(symbol), { orderId, startTime, endTime, limit })),
    },
    {
      name: 'spot_cancel_open_orders',
      description: 'Cancel all open Spot orders for a symbol. Signed.',
      inputSchema: z.object({ symbol: spotSymbol }),
      handler: async ({ symbol }) => textResult(await t.cancelOpenOrders(normalizeSymbol(symbol))),
    },
    {
      name: 'spot_cancel_replace_order',
      description: 'Cancel an existing Spot order and place a new one on the same symbol (cancel-replace). Signed.',
      inputSchema: z.object({
        symbol: spotSymbol,
        side,
        type: z.enum(['LIMIT', 'MARKET', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT']),
        cancelReplaceMode: z.enum(['STOP_ON_FAILURE', 'ALLOW_FAILURE']).default('STOP_ON_FAILURE'),
        cancelOrderId: z.number().int().positive().optional(),
        cancelOrigClientOrderId: z.string().optional(),
        cancelNewClientOrderId: z.string().optional(),
        quantity: z.union([z.string(), z.number()]).optional(),
        price: z.union([z.string(), z.number()]).optional(),
        timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional(),
        newClientOrderId: z.string().optional(),
      }),
      handler: async (args) => textResult(await t.cancelReplaceOrder({ ...args, symbol: normalizeSymbol(args.symbol) })),
    },
    {
      name: 'spot_new_oco_order',
      description: 'Place a new Spot OCO (one-cancels-other) order: a stop-loss limit + a limit-maker take-profit. Signed.',
      inputSchema: z.object({
        symbol: spotSymbol,
        side,
        quantity: z.union([z.string(), z.number()]).describe('Total base-asset quantity for both legs'),
        price: z.union([z.string(), z.number()]).describe('Limit (take-profit) price'),
        stopPrice: z.union([z.string(), z.number()]).describe('Stop-loss trigger price'),
        stopLimitPrice: z.union([z.string(), z.number()]).optional().describe('Stop-loss limit price (defaults to stopPrice)'),
        stopLimitTimeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional(),
        listClientOrderId: z.string().optional(),
        limitClientOrderId: z.string().optional(),
        stopClientOrderId: z.string().optional(),
      }),
      handler: async (args) => textResult(await t.createOCOOrder({ ...args, symbol: normalizeSymbol(args.symbol) })),
    },
    {
      name: 'spot_cancel_oco_order',
      description: 'Cancel an entire Spot OCO order list by orderListId or listClientOrderId. Signed.',
      inputSchema: z.object({ symbol: spotSymbol, orderListId: z.number().int().positive().optional(), listClientOrderId: z.string().optional(), newClientOrderId: z.string().optional() }),
      handler: async ({ symbol, orderListId, listClientOrderId, newClientOrderId }) =>
        textResult(await t.cancelOCOOrder(normalizeSymbol(symbol), { orderListId, listClientOrderId, newClientOrderId })),
    },
    {
      name: 'spot_get_oco_order',
      description: 'Query a Spot OCO order list by orderListId or listClientOrderId. Signed.',
      inputSchema: z.object({ symbol: spotSymbol, orderListId: z.number().int().positive().optional(), origClientOrderId: z.string().optional() }),
      handler: async ({ symbol, orderListId, origClientOrderId }) =>
        textResult(await t.getOCOOrder(normalizeSymbol(symbol), { orderListId, origClientOrderId })),
    },
    {
      name: 'spot_open_oco_orders',
      description: 'Get all current open Spot OCO order lists. Signed.',
      inputSchema: z.object({}),
      handler: async () => textResult(await t.getOpenOCOOrders()),
    },
    {
      name: 'spot_all_oco_orders',
      description: 'Get historical Spot OCO order lists for a symbol with optional time range. Signed.',
      inputSchema: z.object({ symbol: spotSymbol, fromId: z.number().int().positive().optional(), startTime, endTime, limit }),
      handler: async ({ symbol, fromId, startTime, endTime, limit }) =>
        textResult(await t.getAllOCOOrders(normalizeSymbol(symbol), { fromId, startTime, endTime, limit })),
    },
    {
      name: 'spot_cancel_open_oco_orders',
      description: 'Cancel all open Spot OCO order lists for a symbol. Signed.',
      inputSchema: z.object({ symbol: spotSymbol }),
      handler: async ({ symbol }) => textResult(await t.cancelOpenOCOOrders(normalizeSymbol(symbol))),
    },

    // ---- User data stream (signed) ----
    {
      name: 'spot_ws_start_user_stream',
      description: 'Start the Spot user data stream: connects the WebSocket API and sends a signed userDataStream.subscribe.signature. Emits executionReport, outboundAccountPosition, balanceUpdate, listStatus.',
      inputSchema: z.object({}),
      handler: async () => textResult({ subscriptionId: await client.startSpotUserStream() }),
    },
    {
      name: 'spot_ws_stop_user_stream',
      description: 'Stop the Spot user data stream: closes the WebSocket API connection, which ends the subscription.',
      inputSchema: z.object({}),
      handler: async () => {
        client.closeSpotUserStream();
        return textResult({ stopped: true });
      },
    },
  ];

  return tools;
}
