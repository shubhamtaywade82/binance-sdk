import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { createFuturesToolkit } from '../../src/tools/index.js';
import type { ToolDefinition } from '../../src/tools/types.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const EXECUTION_TOOL_NAMES = [
  'execution_place_order',
  'execution_cancel_order',
  'execution_get_order',
  'execution_list_orders',
  'execution_reconcile_order',
  'execution_status',
];

function signedClient() {
  return new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0, retryBaseDelayMs: 1, retryMaxDelayMs: 1 });
}

function tool(tk: { tools: ToolDefinition[] }, name: string): ToolDefinition {
  const t = tk.tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return t;
}

function parse(result: unknown) {
  return JSON.parse(String(result)) as Record<string, unknown>;
}

/** Public (unsigned) ticker used by the paper simulator for marks. */
function mockTicker(price = '50000.00') {
  return http.get('https://fapi.binance.com/fapi/v1/ticker/price', () =>
    HttpResponse.json({ symbol: 'BTCUSDT', price, time: Date.now() }),
  );
}

/** Signed live order placement (ACK response shape). */
function mockLiveOrder() {
  return http.post('https://fapi.binance.com/fapi/v1/order', async ({ request }) => {
    const body = new URLSearchParams(await request.text());
    return HttpResponse.json({
      orderId: 424242,
      symbol: body.get('symbol') ?? 'BTCUSDT',
      status: 'NEW',
      clientOrderId: body.get('newClientOrderId') ?? '',
      price: body.get('price') ?? '0',
      avgPrice: '0.0',
      origQty: body.get('quantity') ?? '0',
      executedQty: '0',
      cumQuote: '0',
      type: body.get('type') ?? 'MARKET',
      reduceOnly: false,
      side: body.get('side') ?? 'BUY',
      positionSide: 'BOTH',
      timeInForce: body.get('timeInForce') ?? 'GTC',
      time: Date.now(),
      updateTime: Date.now(),
    });
  });
}

describe('execution tools (gateway-routed order surface)', () => {
  it('adds an execution group with the full tool catalog', () => {
    const tk = createFuturesToolkit(signedClient());
    const names = tk.execution.map((t) => t.name);
    expect(names).toEqual(EXECUTION_TOOL_NAMES);
    expect(tk.gateway).toBeDefined();
    expect(tk.gateway.backend).toBe('live'); // default
    expect(tk.execution.every((t) => tk.tools.includes(t))).toBe(true);
    // every tool still converts to a JSON-schema-bearing definition
    for (const t of tk.execution) {
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.inputSchema).toBeDefined();
    }
  });

  it('threads toolkit options: paper default backend + custom balance', () => {
    const tk = createFuturesToolkit(signedClient(), {
      executionBackend: 'paper',
      paper: { initialBalance: 50_000 },
    });
    expect(tk.gateway.backend).toBe('paper');
    expect(tk.gateway.paperEngine.getAccountInfo().balance).toBe(50_000);
  });

  it('routes a MARKET order to paper and returns the Execution envelope', async () => {
    server.use(mockTicker('50000.00'));
    const tk = createFuturesToolkit(signedClient(), { executionBackend: 'paper' });

    const out = parse(
      await tool(tk, 'execution_place_order').handler(
        { symbol: 'btcusdt', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'intent-1' },
        { env: 'live', isSigned: true },
      ),
    );

    expect(out.intentId).toBe('intent-1');
    expect(out.symbol).toBe('BTCUSDT'); // normalized
    expect(out.side).toBe('BUY');
    expect(out.status).toBe('FILLED');
    expect(out.reconciliationState).toBe('acked');
    expect(out.clientOrderId).toContain('paper'); // paper prefix
    expect(Number(out.executedQuantity)).toBeCloseTo(0.01);
    expect(out.averagePrice).toBeTypeOf('string');
    expect(tk.gateway.paperEngine.getAccountInfo().orders).toHaveLength(1);
    // ledger (paper backend) knows the intent
    expect(tk.gateway.getExecution('intent-1', 'paper')?.intentId).toBe('intent-1');
  });

  it('is idempotent: retrying the same intentId returns the original execution', async () => {
    server.use(mockTicker('50000.00'));
    const tk = createFuturesToolkit(signedClient(), { executionBackend: 'paper' });
    const place = tool(tk, 'execution_place_order');

    const first = parse(
      await place.handler({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'dup' }, { env: 'live', isSigned: true }),
    );
    const second = parse(
      await place.handler({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'dup' }, { env: 'live', isSigned: true }),
    );

    expect(second.clientOrderId).toBe(first.clientOrderId);
    expect(second.intentId).toBe('dup');
    // exactly one simulated order despite two submissions
    expect(tk.gateway.paperEngine.getAccountInfo().orders).toHaveLength(1);
  });

  it('routes to live when the call overrides backend, keeping ledgers independent', async () => {
    server.use(mockLiveOrder());
    const tk = createFuturesToolkit(signedClient(), { executionBackend: 'paper' });

    const out = parse(
      await tool(tk, 'execution_place_order').handler(
        { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.02, intentId: 'live-1', backend: 'live' },
        { env: 'live', isSigned: true },
      ),
    );

    expect(out.exchangeOrderId).toBe(424242);
    expect(out.reconciliationState).toBe('acked');
    expect(out.status).toBe('NEW');
    // live ledger has it, paper ledger does not
    expect(tk.gateway.getExecution('live-1', 'live')?.exchangeOrderId).toBe(424242);
    expect(tk.gateway.getExecution('live-1', 'paper')).toBeUndefined();
  });

  it('execution_get_order finds intents across both ledgers without a backend hint', async () => {
    server.use(mockLiveOrder(), mockTicker());
    const tk = createFuturesToolkit(signedClient(), { executionBackend: 'paper' });
    await tool(tk, 'execution_place_order').handler(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'paper-x' },
      { env: 'live', isSigned: true },
    );
    await tool(tk, 'execution_place_order').handler(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'live-x', backend: 'live' },
      { env: 'live', isSigned: true },
    );

    const paperHit = parse(await tool(tk, 'execution_get_order').handler({ intentId: 'paper-x' }, { env: 'live', isSigned: true }));
    const liveHit = parse(await tool(tk, 'execution_get_order').handler({ intentId: 'live-x' }, { env: 'live', isSigned: true }));

    expect(paperHit.clientOrderId).toContain('paper');
    expect(liveHit.exchangeOrderId).toBe(424242);
  });

  it('execution_list_orders scopes the ledger to the requested backend', async () => {
    server.use(mockLiveOrder(), mockTicker());
    const tk = createFuturesToolkit(signedClient(), { executionBackend: 'paper' });
    await tool(tk, 'execution_place_order').handler(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'p1' },
      { env: 'live', isSigned: true },
    );
    await tool(tk, 'execution_place_order').handler(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'l1', backend: 'live' },
      { env: 'live', isSigned: true },
    );

    const paperList = parse(await tool(tk, 'execution_list_orders').handler({ backend: 'paper' }, { env: 'live', isSigned: true })) as unknown as unknown[];
    const liveList = parse(await tool(tk, 'execution_list_orders').handler({ backend: 'live' }, { env: 'live', isSigned: true })) as unknown as unknown[];
    // default (unspecified) backend is paper
    const defaultList = parse(await tool(tk, 'execution_list_orders').handler({}, { env: 'live', isSigned: true })) as unknown as unknown[];

    expect(paperList).toHaveLength(1);
    expect(liveList).toHaveLength(1);
    expect(defaultList).toHaveLength(1);
  });

  it('execution_cancel_order on paper resolves an unknown order to a terminal CANCELED execution', async () => {
    const tk = createFuturesToolkit(signedClient(), { executionBackend: 'paper' });
    const out = parse(
      await tool(tk, 'execution_cancel_order').handler(
        { symbol: 'BTCUSDT', origClientOrderId: 'paper-nope-123', intentId: 'cancel-1' },
        { env: 'live', isSigned: true },
      ),
    );
    expect(out.status).toBe('CANCELED');
    expect(out.type).toBe('CANCEL');
    // recovered via the -2011 "already gone" reconciliation path
    expect(out.reconciliationState).toBe('reconciled');
  });

  it('execution_status reports default backend, risk state, and the paper account', async () => {
    server.use(mockTicker('60000.00'));
    const tk = createFuturesToolkit(signedClient(), { executionBackend: 'paper' });
    await tool(tk, 'execution_place_order').handler(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, intentId: 'st-1' },
      { env: 'live', isSigned: true },
    );

    const out = parse(await tool(tk, 'execution_status').handler({}, { env: 'live', isSigned: true }));

    expect(out.defaultBackend).toBe('paper');
    expect(out.risk).toBeNull(); // no safety policy configured on this client
    const paper = out.paper as Record<string, unknown>;
    expect(paper.balance).toBe(10_000); // realized PnL only moves the balance
    expect(paper.orderCount).toBe(1);
    expect((paper.positions as unknown[]).length).toBe(1);
  });

  it('execution_place_order surfaces exchange rejections instead of guessing', async () => {
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', () =>
        HttpResponse.json({ code: -2019, msg: 'Margin is insufficient.' }, { status: 400 }),
      ),
    );
    const tk = createFuturesToolkit(signedClient());

    await expect(
      tool(tk, 'execution_place_order').handler(
        { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1, intentId: 'rejected-1', backend: 'live' },
        { env: 'live', isSigned: true },
      ),
    ).rejects.toThrow(/Margin is insufficient/);
  });

  it('MCP toolkit conversion still covers the execution group', () => {
    const tk = createFuturesToolkit(signedClient());
    const mcp = tk.tools.map((t) => t.name);
    for (const name of EXECUTION_TOOL_NAMES) expect(mcp).toContain(name);
  });
});
