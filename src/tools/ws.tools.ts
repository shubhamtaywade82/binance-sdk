import { z } from 'zod';
import type { BinanceClient } from '../client/BinanceClient.js';
import { futuresStreamRoute } from '../ws/FuturesMarketWS.js';
import type { ToolDefinition } from './types.js';
import { textResult, normalizeSymbol } from './types.js';

interface WsBuffer {
  subscriptions: Set<string>;
  events: { stream: string; payload: unknown; ts: number }[];
}

const buffers = new Map<BinanceClient, WsBuffer>();
const MAX_BUFFER = 500;

function bufferFor(client: BinanceClient): WsBuffer {
  let buffer = buffers.get(client);
  if (!buffer) {
    buffer = { subscriptions: new Set(), events: [] };
    buffers.set(client, buffer);
    const onMessage = (stream: string, payload: unknown): void => {
      buffer!.events.push({ stream, payload, ts: Date.now() });
      if (buffer!.events.length > MAX_BUFFER) buffer!.events.splice(0, buffer!.events.length - MAX_BUFFER);
    };
    client.futures.ws.on('message', onMessage);
    client.futures.wsPublic.on('message', onMessage);
  }
  return buffer;
}

export function getBufferedWsEvents(client: BinanceClient, limit = 50): unknown[] {
  return bufferFor(client).events.slice(-limit);
}

export function clearBufferedWsEvents(client: BinanceClient): void {
  bufferFor(client).events = [];
}

/** USDⓈ-M streams are split across the `/public` (order book) and `/market` connections. */
function connectionFor(client: BinanceClient, stream: string) {
  return futuresStreamRoute(stream) === 'public' ? client.futures.wsPublic : client.futures.ws;
}

export function wsTools(client: BinanceClient): ToolDefinition[] {
  const buffer = bufferFor(client);

  return [
    {
      name: 'futures_ws_subscribe',
      description:
        'Subscribe to real-time market data streams. Topic format: <symbol>@<stream>, e.g. btcusdt@aggTrade, btcusdt@kline_1m, btcusdt@depth20, btcusdt@markPrice@1s, btcusdt@bookTicker, btcusdt@ticker, btcusdt@miniTicker, btcusdt@forceOrder, or all-market topics !ticker@arr, !bookTicker, !markPrice@arr, !markPrice@arr@1s, !forceOrder@arr, !miniTicker@arr, !contractInfo, or the new 2026 streams btcusdt_perpetual@continuousKline_5m, btcusdt@rpiDepth@500ms, tradingSession. Multiple topics can be passed at once.',
      inputSchema: z.object({
        topics: z.array(z.string().min(1)).min(1).describe('Stream topics, e.g. ["btcusdt@aggTrade", "btcusdt@kline_1m"]'),
      }),
      handler: async ({ topics }) => {
        const normalized = topics.map((t: string) => t.trim().toLowerCase());
        for (const topic of normalized) void connectionFor(client, topic).subscribe([topic]);
        normalized.forEach((t: string) => buffer.subscriptions.add(t));
        return textResult({ subscribed: normalized, active: [...buffer.subscriptions] });
      },
    },
    // ---- Typed stream-name builders (2026 USDⓈ-M audit remediation) ----
    // These exist because raw topic strings are easy to typo — the audit
    // found `continuousKline` had been constructed with the wrong format for
    // months. Each tool takes typed args and returns the canonical topic
    // string, then subscribes via the same path as `futures_ws_subscribe`.
    {
      name: 'futures_ws_continuous_kline',
      description:
        'Subscribe to a continuous-contract kline stream for a USDⓈ-M pair. Builds the canonical Binance stream name <symbol>_<contractType>@continuousKline_<interval> (the contract type sits between symbol and stream kind).',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
        contractType: z.enum(['perpetual', 'current_quarter', 'next_quarter']),
        interval: z
          .enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'])
          .describe('Kline interval'),
      }),
      handler: async ({ symbol, contractType, interval }) => {
        const topic = client.futures.ws.continuousKline(
          normalizeSymbol(symbol),
          contractType,
          interval as Parameters<typeof client.futures.ws.continuousKline>[2],
        );
        client.futures.ws.subscribe([topic]);
        buffer.subscriptions.add(topic);
        return textResult({ subscribed: topic, active: [...buffer.subscriptions] });
      },
    },
    {
      name: 'futures_ws_all_mark_prices_1s',
      description:
        'Subscribe to the all-symbols mark-price stream at the 1s update cadence (!markPrice@arr@1s, Binance 2026 addition). Delivers an array of mark-price entries every second.',
      inputSchema: z.object({}),
      handler: async () => {
        const topic = client.futures.ws.allMarkPrices1s();
        client.futures.ws.subscribe([topic]);
        buffer.subscriptions.add(topic);
        return textResult({ subscribed: topic, active: [...buffer.subscriptions] });
      },
    },
    {
      name: 'futures_ws_contract_info',
      description:
        'Subscribe to the all-market contract-info stream (!contractInfo). Emits on symbol listing/delisting and on contract parameter changes (leverage bracket, lot size, price precision).',
      inputSchema: z.object({}),
      handler: async () => {
        const topic = client.futures.ws.contractInfo();
        client.futures.ws.subscribe([topic]);
        buffer.subscriptions.add(topic);
        return textResult({ subscribed: topic, active: [...buffer.subscriptions] });
      },
    },
    {
      name: 'futures_ws_rpi_depth',
      description:
        'Subscribe to the Retail Price Improvement (RPI) order-book depth diff stream (<symbol>@rpiDepth@500ms). 500ms cadence; payloads have the same shape as a depthUpdate event.',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
      }),
      handler: async ({ symbol }) => {
        const topic = client.futures.ws.rpiDepth(normalizeSymbol(symbol));
        client.futures.ws.subscribe([topic]);
        buffer.subscriptions.add(topic);
        return textResult({ subscribed: topic, active: [...buffer.subscriptions] });
      },
    },
    {
      name: 'futures_ws_trading_session',
      description:
        'Subscribe to the platform trading-session stream (tradingSession, introduced alongside /fapi/v1/tradingSchedule in December 2025). Emits session phase transitions (open, close, pre-market, post-market).',
      inputSchema: z.object({}),
      handler: async () => {
        const topic = client.futures.ws.tradingSession();
        client.futures.ws.subscribe([topic]);
        buffer.subscriptions.add(topic);
        return textResult({ subscribed: topic, active: [...buffer.subscriptions] });
      },
    },
    {
      name: 'futures_ws_unsubscribe',
      description: 'Unsubscribe from previously subscribed market data streams.',
      inputSchema: z.object({ topics: z.array(z.string().min(1)).min(1) }),
      handler: async ({ topics }) => {
        const normalized = topics.map((t: string) => t.trim().toLowerCase());
        for (const topic of normalized) void connectionFor(client, topic).unsubscribe([topic]);
        normalized.forEach((t: string) => buffer.subscriptions.delete(t));
        return textResult({ unsubscribed: normalized, active: [...buffer.subscriptions] });
      },
    },
    {
      name: 'futures_ws_subscriptions',
      description: 'List the currently subscribed WebSocket market streams for this client.',
      inputSchema: z.object({}),
      handler: async () => textResult({ active: [...buffer.subscriptions] }),
    },
    {
      name: 'futures_ws_events',
      description:
        'Read the buffered real-time payloads received since the last read for the subscribed streams (aggregate trades, klines, depth deltas, mark price, book tickers, tickers, force orders). Payloads are parsed; depth deltas must be applied to a snapshot from futures_order_book.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
      handler: async ({ limit }) => textResult(getBufferedWsEvents(client, limit)),
    },
    {
      name: 'futures_ws_clear_events',
      description: 'Clear the buffered WebSocket events so the next read only returns new payloads.',
      inputSchema: z.object({}),
      handler: async () => {
        clearBufferedWsEvents(client);
        return textResult({ cleared: true });
      },
    },
    {
      name: 'futures_ws_start_user_stream',
      description:
        'Start the user data stream: creates a listenKey, connects the private WebSocket, and begins a 30-minute keep-alive. Emits private events (ACCOUNT_UPDATE, ORDER_TRADE_UPDATE, MARGIN_CALL, ACCOUNT_CONFIG_UPDATE, listenKeyExpired) that the application can consume from the client.',
      inputSchema: z.object({}),
      handler: async () => textResult({ listenKey: await client.startUserStream() }),
    },
    {
      name: 'futures_ws_stop_user_stream',
      description: 'Stop the user data stream: closes the private WebSocket and invalidates the listenKey.',
      inputSchema: z.object({}),
      handler: async () => {
        client.closeUserStream();
        return textResult({ stopped: true });
      },
    },
    {
      name: 'futures_ws_api_order_status',
      description: 'Query an order via the signed WebSocket API (order.status) — lower-latency alternative to futures_get_order.',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
        orderId: z.number().int().positive().optional(),
        origClientOrderId: z.string().optional(),
      }),
      handler: async ({ symbol, orderId, origClientOrderId }) =>
        textResult(await client.futures.wsApi.orderStatus({ symbol: normalizeSymbol(symbol), orderId, origClientOrderId })),
    },
    {
      name: 'futures_ws_api_account_status',
      description: 'Get account info via the signed WebSocket API (account.status).',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.futures.wsApi.accountStatus()),
    },
    {
      name: 'futures_ws_api_account_position',
      description: 'Get current positions via the signed WebSocket API (account.position).',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT').optional() }),
      handler: async ({ symbol }) =>
        textResult(await client.futures.wsApi.accountPosition(symbol ? { symbol: normalizeSymbol(symbol) } : {})),
    },
    {
      name: 'futures_ws_api_user_data_stream_start',
      description: 'Create a listenKey via the signed WebSocket API (userDataStream.start) — no REST call required.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.futures.wsApi.userDataStreamStart()),
    },
    {
      name: 'futures_ws_api_user_data_stream_stop',
      description: 'Invalidate a listenKey via the signed WebSocket API (userDataStream.stop).',
      inputSchema: z.object({ listenKey: z.string().min(1) }),
      handler: async ({ listenKey }) => textResult(await client.futures.wsApi.userDataStreamStop(listenKey)),
    },
    {
      name: 'futures_ws_api_ticker_price',
      description: 'Get latest price via the unsigned WebSocket API (ticker.price); omit symbol for all symbols.',
      inputSchema: z.object({ symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT').optional() }),
      handler: async ({ symbol }) =>
        textResult(await client.futures.wsApi.tickerPrice(symbol ? { symbol: normalizeSymbol(symbol) } : {})),
    },
    {
      name: 'futures_ws_api_order_book',
      description: 'Get order-book depth via the unsigned WebSocket API (depth).',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
        limit: z.enum(['5', '10', '20', '50', '100', '500', '1000']).optional(),
      }),
      handler: async ({ symbol, limit }) =>
        textResult(await client.futures.wsApi.depth({ symbol: normalizeSymbol(symbol), limit })),
    },
  ];
}
