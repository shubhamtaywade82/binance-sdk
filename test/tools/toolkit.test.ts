import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { createFuturesToolkit, toolkitToFormats } from '../../src/tools/index.js';
import { createBinanceMcpServer } from '../../src/mcp/server.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('futures toolkit', () => {
  function client() {
    return new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0, retryBaseDelayMs: 1, retryMaxDelayMs: 1 });
  }

  it('exposes a stable catalog of tools across all groups', () => {
    const tk = createFuturesToolkit(client());
    expect(tk.tools.length).toBeGreaterThan(60);
    const names = new Set(tk.tools.map((t) => t.name));
    expect(names).toContain('futures_ping');
    expect(names).toContain('futures_order_book');
    expect(names).toContain('futures_klines');
    expect(names).toContain('futures_new_order');
    expect(names).toContain('futures_income_history');
    expect(names).toContain('futures_ws_subscribe');
    // New 2026 USDⓈ-M WS stream builders (LLM tool layer).
    expect(names).toContain('futures_ws_continuous_kline');
    expect(names).toContain('futures_ws_all_mark_prices_1s');
    expect(names).toContain('futures_ws_contract_info');
    expect(names).toContain('futures_ws_rpi_depth');
    expect(names).toContain('futures_ws_trading_session');
    expect(tk.market.length).toBeGreaterThan(20);
    expect(tk.account.length).toBeGreaterThan(10);
    expect(tk.trading.length).toBeGreaterThan(15);
  });

  it('exposes composite tools alongside the primitives', () => {
    const tk = createFuturesToolkit(client());
    const names = new Set(tk.derived.map((t) => t.name));
    expect(names).toContain('futures_symbol_rules');
    expect(names).toContain('futures_size_position');
    expect(names).toContain('futures_close_position');
    expect(names).toContain('futures_market_snapshot');
    expect(tk.derived.every((t) => tk.tools.includes(t))).toBe(true);
  });

  it('converts tools to OpenAI / Anthropic / MCP formats', () => {
    const tk = createFuturesToolkit(client());
    const f = toolkitToFormats(tk);
    expect(f.openai.length).toBe(tk.tools.length);
    expect(f.anthropic.length).toBe(tk.tools.length);
    expect(f.mcp.length).toBe(tk.tools.length);
    const oai = f.openai[0] as any;
    expect(oai.type).toBe('function');
    expect(oai.function.name).toBe(tk.tools[0].name);
    expect(typeof oai.function.parameters).toBe('object');
    const anth = f.anthropic[0] as any;
    expect(anth.name).toBe(tk.tools[0].name);
    expect(anth.input_schema).toBeTypeOf('object');
    const mcp = f.mcp[0] as any;
    expect(mcp.name).toBe(tk.tools[0].name);
    expect(mcp.inputSchema).toBeTypeOf('object');
  });

  it('normalizes symbols to uppercase before calling the REST layer', async () => {
    const c = client();
    const tk = createFuturesToolkit(c);
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/ticker/price', ({ request }) => {
        const url = new URL(request.url, 'https://fapi.binance.com');
        expect(url.searchParams.get('symbol')).toBe('BTCUSDT');
        return HttpResponse.json({ symbol: 'BTCUSDT', price: '50000.00' });
      }),
    );
    const tool = tk.tools.find((t) => t.name === 'futures_ticker_price')!;
    await tool.handler({ symbol: 'btcusdt' }, { env: 'testnet', isSigned: false });
  });

  it('coerces numeric string limits and periods for futures_open_interest_hist', async () => {
    const c = client();
    const tk = createFuturesToolkit(c);
    server.use(
      http.get('https://fapi.binance.com/futures/data/openInterestHist', ({ request }) => {
        const url = new URL(request.url, 'https://fapi.binance.com');
        expect(url.searchParams.get('symbol')).toBe('ETHUSDT');
        expect(url.searchParams.get('period')).toBe('1h');
        expect(url.searchParams.get('limit')).toBe('25');
        return HttpResponse.json([]);
      }),
    );
    const tool = tk.tools.find((t) => t.name === 'futures_open_interest_hist')!;
    await tool.handler({ symbol: 'ethusdt', period: '1h', limit: '25' }, { env: 'live', isSigned: false });
  });

  it('builds the MCP server without duplicate registration', () => {
    const srv = createBinanceMcpServer(client());
    expect(srv).toBeTruthy();
  });

  it('sends newClientOrderId as-is when placing an order', async () => {
    const c = client();
    const tk = createFuturesToolkit(c);
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', ({ request }) => {
        const url = new URL(request.url, 'https://fapi.binance.com');
        expect(url.searchParams.get('symbol')).toBe('BTCUSDT');
        expect(url.searchParams.get('newClientOrderId')).toBe('my-id');
        expect(url.searchParams.get('side')).toBe('BUY');
        expect(url.searchParams.get('type')).toBe('LIMIT');
        return HttpResponse.json({
          orderId: 1, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'cid', price: '0.00',
          avgPrice: '0.00', origQty: '0.001', executedQty: '0.000', cumQuote: '0.000', type: 'LIMIT',
          reduceOnly: false, side: 'BUY', positionSide: 'BOTH', timeInForce: 'GTC',
          time: 1700000000000, updateTime: 1700000000000,
        });
      }),
    );
    const tool = tk.tools.find((t) => t.name === 'futures_new_order')!;
    await tool.handler(
      { symbol: 'btcusdt', side: 'BUY', type: 'LIMIT', quantity: 0.001, price: '50000', newClientOrderId: 'my-id' },
      { env: 'live', isSigned: true },
    );
  });
});
