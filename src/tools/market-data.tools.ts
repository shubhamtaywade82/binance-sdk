import { z } from 'zod';
import type { BinanceClient } from '../client/BinanceClient.js';
import { KlineIntervalSchema } from '../types/market.types.js';
import type { ToolDefinition } from './types.js';
import { textResult, normalizeSymbol } from './types.js';

const u = (s: z.ZodTypeAny) => s.optional();
const optSymbol = u(z.string().min(1)).describe('USD-M pair, e.g. BTCUSDT');
const limitDefault = z.number().int().positive().max(1500).default(100);
const startTime = z.number().int().positive().optional();
const endTime = z.number().int().positive().optional();
const period = z.enum(['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d']).default('1h');
const contractType = z.enum(['perpetual', 'current_quarter', 'next_quarter']).default('perpetual');

export function marketDataTools(client: BinanceClient): ToolDefinition[] {
  const m = client.futures.market;
  const d = client.futures.data;

  const tools: ToolDefinition[] = [
    {
      name: 'futures_ping',
      description: 'Test connectivity to the Binance USD-M futures REST API. Returns empty object {} on success.',
      inputSchema: z.object({}),
      handler: async () => textResult(await m.ping()),
    },
    {
      name: 'futures_server_time',
      description: 'Get the current Binance USD-M futures server time in milliseconds since epoch.',
      inputSchema: z.object({}),
      handler: async () => textResult(await m.serverTime()),
    },
    {
      name: 'futures_exchange_info',
      description: 'Get exchange trading rules and symbol metadata: contract type, status, base/quote assets, price/quantity filters, tick size, step size, notional and leverage brackets, delivery dates.',
      inputSchema: z.object({}),
      handler: async () => textResult(await m.exchangeInfo()),
    },
    {
      name: 'futures_ticker_price',
      description: 'Get latest price for one symbol (v1).',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await m.tickerPrice(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_ticker_price_v2',
      description: 'Get latest price for one symbol, or for all symbols when symbol is omitted (v2 endpoint). Use all-symbols mode for market overviews.',
      inputSchema: z.object({ symbol: optSymbol }),
      handler: async ({ symbol }) => textResult(await m.tickerPriceV2(symbol ? normalizeSymbol(symbol) : undefined)),
    },
    {
      name: 'futures_ticker_24hr',
      description: 'Get 24-hour rolling price change statistics for a symbol: price change %, high, low, volume, quote volume, open interest.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await m.ticker24hr(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_book_ticker',
      description: 'Get best bid/ask (top of book) for a single symbol (v1).',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await m.bookTicker(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_book_ticker_v2',
      description: 'Get best bid/ask (top of book) for one symbol, or all symbols when omitted (v2 endpoint).',
      inputSchema: z.object({ symbol: optSymbol }),
      handler: async ({ symbol }) => textResult(await m.bookTickerV2(symbol ? normalizeSymbol(symbol) : undefined)),
    },
    {
      name: 'futures_order_book',
      description: 'Get order book depth for a symbol. Limits: 5, 10, 20, 50, 100, 500, 1000.',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
        limit: z.enum(['5', '10', '20', '50', '100', '500', '1000']).default('100'),
      }),
      handler: async ({ symbol, limit }) => textResult(await m.depth(normalizeSymbol(symbol), Number(limit))),
    },
    {
      name: 'futures_recent_trades',
      description: 'Get the most recent executed trades for a symbol (public endpoint).',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
        limit: limitDefault.default(500),
      }),
      handler: async ({ symbol, limit }) => textResult(await m.trades(normalizeSymbol(symbol), Number(limit))),
    },
    {
      name: 'futures_historical_trades',
      description: 'Get older trades for a symbol by fromId (older than recent).',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
        limit: limitDefault.default(500),
        fromId: z.number().int().positive().optional(),
      }),
      handler: async ({ symbol, limit, fromId }) =>
        textResult(await m.historicalTrades(normalizeSymbol(symbol), { limit: Number(limit), fromId })),
    },
    {
      name: 'futures_agg_trades',
      description: 'Get compressed/aggregate trades for a symbol within an optional time window. Each entry aggregates trades with the same price and side.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), limit: limitDefault.default(500), startTime, endTime }),
      handler: async ({ symbol, limit, startTime, endTime }) =>
        textResult(await m.aggTrades(normalizeSymbol(symbol), { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_klines',
      description: 'Get candlestick (OHLCV) data for a symbol. Intervals: 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M. Max 1500 per request.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), interval: KlineIntervalSchema, limit: limitDefault.default(500), startTime, endTime }),
      handler: async ({ symbol, interval, limit, startTime, endTime }) =>
        textResult(await m.klines(normalizeSymbol(symbol), interval, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_continuous_klines',
      description: 'Get klines for a continuous contract (perpetual, current_quarter, next_quarter) identified by base pair (e.g. BTCUSDT).',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('Base pair, e.g. BTCUSDT'),
        contractType,
        interval: KlineIntervalSchema,
        limit: limitDefault.default(500),
        startTime,
        endTime,
      }),
      handler: async ({ symbol, contractType, interval, limit, startTime, endTime }) =>
        textResult(await m.continuousKlines(normalizeSymbol(symbol), contractType, interval, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_index_price_klines',
      description: 'Get index price candlesticks for a pair (e.g. BTCUSDT index).',
      inputSchema: z.object({ symbol: z.string().min(1).describe('Base pair, e.g. BTCUSDT'), interval: KlineIntervalSchema, limit: limitDefault.default(500), startTime, endTime }),
      handler: async ({ symbol, interval, limit, startTime, endTime }) =>
        textResult(await m.indexPriceKlines(normalizeSymbol(symbol), interval, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_mark_price_klines',
      description: 'Get mark price candlesticks for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), interval: KlineIntervalSchema, limit: limitDefault.default(500), startTime, endTime }),
      handler: async ({ symbol, interval, limit, startTime, endTime }) =>
        textResult(await m.markPriceKlines(normalizeSymbol(symbol), interval, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_trading_day_ticker',
      description: 'Get the trading-day ticker (v1: rolling window stats by symbol, including open, close, high, low, volume, closeTime).',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await m.tradingDayTicker(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_mark_price',
      description: 'Get mark price, index price, estimated settle price, last funding rate, next funding time and interest rate for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await d.premiumIndex(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_funding_rate_history',
      description: 'Get historical funding rates for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), limit: limitDefault.default(100), startTime, endTime }),
      handler: async ({ symbol, limit, startTime, endTime }) =>
        textResult(await d.fundingRateHistory(normalizeSymbol(symbol), { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_funding_info',
      description: 'Get funding rate configuration for all symbols with adjusted funding cap/floor or interval (e.g. under extreme volatility).',
      inputSchema: z.object({}),
      handler: async () => textResult(await d.fundingInfo()),
    },
    {
      name: 'futures_open_interest',
      description: 'Get the current total open interest for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await d.openInterest(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_open_interest_hist',
      description: 'Get historical open interest statistics per period.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), period, limit: limitDefault.default(30) }),
      handler: async ({ symbol, period, limit }) => textResult(await d.openInterestHist(normalizeSymbol(symbol), period, Number(limit))),
    },
    {
      name: 'futures_top_long_short_account_ratio',
      description: 'Get top trader long/short account ratio (number of accounts) for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), period, limit: limitDefault.default(30) }),
      handler: async ({ symbol, period, limit }) => textResult(await d.topLongShortAccountRatio(normalizeSymbol(symbol), period, Number(limit))),
    },
    {
      name: 'futures_top_long_short_position_ratio',
      description: 'Get top trader long/short position ratio (accounts with net positions) for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), period, limit: limitDefault.default(30) }),
      handler: async ({ symbol, period, limit }) => textResult(await d.topLongShortPositionRatio(normalizeSymbol(symbol), period, Number(limit))),
    },
    {
      name: 'futures_global_long_short_ratio',
      description: 'Get global long/short account ratio for a symbol (all accounts).',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), period, limit: limitDefault.default(30) }),
      handler: async ({ symbol, period, limit }) => textResult(await d.globalLongShortAccountRatio(normalizeSymbol(symbol), period, Number(limit))),
    },
    {
      name: 'futures_taker_long_short_ratio',
      description: 'Get taker buy/sell volume ratio for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), period, limit: limitDefault.default(30) }),
      handler: async ({ symbol, period, limit }) => textResult(await d.takerLongShortRatio(normalizeSymbol(symbol), period, Number(limit))),
    },
    {
      name: 'futures_basis',
      description: 'Get basis data (spot-futures spread, mark price - index price) for a pair and contract type.',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('Base pair, e.g. BTCUSDT'),
        period,
        limit: limitDefault.default(30),
        startTime,
        endTime,
      }),
      handler: async ({ symbol, period, limit, startTime, endTime }) =>
        textResult(await d.basis(normalizeSymbol(symbol), period, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_asset_index',
      description: 'Get multi-assets mode asset index (collateral price) for one asset or all assets.',
      inputSchema: z.object({ symbol: optSymbol.describe('Asset index symbol, e.g. ADAUSD') }),
      handler: async ({ symbol }) => textResult(await d.assetIndex(symbol ? normalizeSymbol(symbol) : undefined)),
    },
    {
      name: 'futures_composite_index_info',
      description: 'Get composite index symbol information (e.g. DEFIUSDT) with constituent weights.',
      inputSchema: z.object({ symbol: optSymbol }),
      handler: async ({ symbol }) => textResult(await d.compositeIndexInfo(symbol ? normalizeSymbol(symbol) : undefined)),
    },
    {
      name: 'futures_insurance_balance',
      description: 'Get insurance fund balance snapshots for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BNBUSDT'), limit: limitDefault.default(100), startTime, endTime }),
      handler: async ({ symbol, limit, startTime, endTime }) =>
        textResult(await d.insuranceFundBalance({ symbol: normalizeSymbol(symbol), limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_index_price_constituents',
      description: 'Get the index price constituents (exchange weights) for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await d.indexPriceConstituents(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_premium_index_klines',
      description: 'Get premium index candlesticks for a symbol (mark price premium over index price).',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), interval: KlineIntervalSchema, limit: limitDefault.default(500), startTime, endTime }),
      handler: async ({ symbol, interval, limit, startTime, endTime }) =>
        textResult(await m.premiumIndexKlines(normalizeSymbol(symbol), interval, { limit: Number(limit), startTime, endTime })),
    },
    {
      name: 'futures_rpi_depth',
      description: 'Get the RPI (Retail Price Improvement) order book depth for a symbol.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'), limit: z.number().int().positive().default(1000) }),
      handler: async ({ symbol, limit }) => textResult(await m.rpiDepth(normalizeSymbol(symbol), Number(limit))),
    },
    {
      name: 'futures_delivery_price',
      description: 'Get historical quarterly contract settlement/delivery prices for a pair.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('Base pair, e.g. BTCUSDT') }),
      handler: async ({ symbol }) => textResult(await d.deliveryPrice(normalizeSymbol(symbol))),
    },
    {
      name: 'futures_symbol_adl_risk',
      description: 'Get the auto-deleveraging (ADL) risk level for one symbol or all symbols (public market data, no signature required).',
      inputSchema: z.object({ symbol: optSymbol }),
      handler: async ({ symbol }) => textResult(await d.symbolAdlRisk(symbol ? normalizeSymbol(symbol) : undefined)),
    },
    {
      name: 'futures_adl_quantile',
      description: 'Get the position ADL (auto-deleveraging) quantile estimation for one symbol or all symbols (signed).',
      inputSchema: z.object({ symbol: optSymbol }),
      handler: async ({ symbol }) => textResult(await d.adlQuantile(symbol ? normalizeSymbol(symbol) : undefined)),
    },
    {
      name: 'futures_force_orders',
      description: "Get the user's force-liquidation orders (LIQUIDATION) and ADL orders for a symbol or all symbols (signed).",
      inputSchema: z.object({
        symbol: optSymbol,
        autoCloseType: z.enum(['LIQUIDATION', 'ADL']).optional(),
        startTime,
        endTime,
        limit: limitDefault.default(50),
      }),
      handler: async ({ symbol, autoCloseType, startTime, endTime, limit }) =>
        textResult(
          await d.forceOrders({
            symbol: symbol ? normalizeSymbol(symbol) : undefined,
            autoCloseType,
            startTime,
            endTime,
            limit: Number(limit),
          }),
        ),
    },
  ];

  return tools;
}
