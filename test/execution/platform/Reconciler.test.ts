import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CoreContext } from '../../../src/core/context.js';
import { ExecutionPlatform } from '../../../src/execution/platform/ExecutionPlatform.js';
import { createPaperExecutionPlatform } from '../../../src/execution/platform/PaperBackend.js';
import { EventBus } from '../../../src/core/events.js';

const server = setupServer();
beforeAll(() =>
  server.listen({
    onUnhandledRequest: (request, print) => {
      if (request.url.startsWith('http://127.0.0.1')) return;
      print.error();
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const OPEN_ORDERS = 'https://fapi.binance.com/fapi/v1/openOrders';
const POSITION_RISK = 'https://fapi.binance.com/fapi/v2/positionRisk';
const SPOT_OPEN_ORDERS = 'https://api.binance.com/api/v3/openOrders';
const TICKER = 'https://fapi.binance.com/fapi/v1/ticker/price';

function usdmOpenOrderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderId: 900001,
    symbol: 'BTCUSDT',
    status: 'NEW',
    clientOrderId: 'ext-rest-1',
    price: '42000',
    avgPrice: '0',
    origQty: '0.5',
    executedQty: '0',
    cumQuote: '0',
    time: 1700000000000,
    updateTime: 1700000000000,
    type: 'LIMIT',
    side: 'BUY',
    ...overrides,
  };
}

function positionRiskRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol: 'BTCUSDT',
    positionSide: 'BOTH',
    positionAmt: '0.25',
    entryPrice: '41500.5',
    unRealizedProfit: '125.5',
    liquidationPrice: '0',
    markPrice: '41601',
    marginType: 'cross',
    isolatedMargin: '0',
    updateTime: 1700000000000,
    ...overrides,
  };
}

describe('ExecutionPlatform.reconcile (live USDⓈ-M)', () => {
  it('folds REST open orders and position risk into the trackers', async () => {
    server.use(
      http.get(OPEN_ORDERS, () =>
        HttpResponse.json([
          usdmOpenOrderRow(),
          usdmOpenOrderRow({ orderId: 900002, symbol: 'ETHUSDT', clientOrderId: 'ext-rest-2' }),
        ]),
      ),
      http.get(POSITION_RISK, () =>
        HttpResponse.json([
          positionRiskRow(),
          positionRiskRow({ symbol: 'ETHUSDT', positionAmt: '-3.5', entryPrice: '3000' }),
        ]),
      ),
    );

    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const platform = new ExecutionPlatform({ product: 'usdm', core });

    // The gap-fill works before a session starts (startup reconciliation).
    const summary = await platform.reconcile();
    expect(summary.orders).toBe(2);
    expect(summary.positions).toBe(2);

    const btc = platform.orders.get('ext-rest-1');
    expect(btc).toBeDefined();
    expect(btc?.symbol).toBe('BTCUSDT');
    expect(btc?.status).toBe('NEW');
    expect(btc?.executedQuantity).toBe('0');
    expect(btc?.exchangeOrderId).toBe(900001);
    expect(btc?.averagePrice).toBeNull(); // avgPrice '0' is not a real fill

    const ethShort = platform.positions.get('ETHUSDT');
    expect(ethShort).toBeDefined();
    expect(ethShort?.positionAmount).toBe('-3.5');
    expect(ethShort?.entryPrice).toBe('3000');
    expect(platform.positions.nonZero()).toHaveLength(2);

    // A second pass re-folds (terminal-free records update in place).
    const again = await platform.reconcile();
    expect(again.orders).toBe(2);
  });

  it('filters to requested symbols and reports folded counts via events', async () => {
    const events = new EventBus();
    const seen: { payload: { orders?: number; positions?: number } }[] = [];
    events.scoped('execution').on('reconciled', (event) => seen.push(event));

    server.use(
      http.get(OPEN_ORDERS, () => HttpResponse.json([usdmOpenOrderRow()])),
      http.get(POSITION_RISK, () =>
        HttpResponse.json([
          positionRiskRow(),
          positionRiskRow({ symbol: 'ETHUSDT', positionAmt: '0' }),
        ]),
      ),
    );

    const core = new CoreContext({ apiKey: 'k', apiSecret: 's', events });
    const platform = new ExecutionPlatform({ product: 'usdm', core });
    const summary = await platform.reconcile({ symbols: ['BTCUSDT'] });

    expect(summary.orders).toBe(1);
    expect(summary.positions).toBe(1); // only BTCUSDT passed the filter
    expect(platform.orders.get('ext-rest-2')).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0].payload.orders).toBe(1);
  });

  it('one symbol folds through the symbol param on the openOrders call', async () => {
    const params: Record<string, string>[] = [];
    server.use(
      http.get(OPEN_ORDERS, ({ request }) => {
        const url = new URL(request.url);
        params.push(Object.fromEntries(url.searchParams.entries()));
        return HttpResponse.json([usdmOpenOrderRow()]);
      }),
      http.get(POSITION_RISK, () => HttpResponse.json([positionRiskRow()])),
    );
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const platform = new ExecutionPlatform({ product: 'usdm', core });
    await platform.reconcile({ symbols: ['BTCUSDT'] });
    expect(params[0].symbol).toBe('BTCUSDT');
  });
});

describe('ExecutionPlatform.reconcile (live Spot)', () => {
  it('requires symbols (the symbol-less route no longer exists)', async () => {
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const platform = new ExecutionPlatform({ product: 'spot', core });
    await expect(platform.reconcile()).rejects.toThrow(/symbols/);
  });

  it('folds per-symbol spot open orders', async () => {
    server.use(
      http.get(SPOT_OPEN_ORDERS, () =>
        HttpResponse.json([
          {
            symbol: 'ETHBTC',
            orderId: 77,
            clientOrderId: 'spot-rest-1',
            price: '0.05',
            origQty: '2',
            executedQty: '0',
            cummulativeQuoteQty: '0',
            status: 'NEW',
            type: 'LIMIT',
            side: 'BUY',
            updateTime: 1700000000000,
          },
        ]),
      ),
    );
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const platform = new ExecutionPlatform({ product: 'spot', core });
    const summary = await platform.reconcile({ symbols: ['ETHBTC'] });
    expect(summary.orders).toBe(1);
    expect(summary.positions).toBe(0); // spot has no positions
    const order = platform.orders.get('spot-rest-1');
    expect(order?.symbol).toBe('ETHBTC');
    expect(order?.executedQuantity).toBe('0');
  });
});

describe('ExecutionPlatform.reconcile (paper mode)', () => {
  it('folds the simulator book: orders + positions, zero network', async () => {
    server.use(
      http.get(TICKER, () => HttpResponse.json({ symbol: 'BTCUSDT', price: '42000', time: 1 })),
    );
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const paper = createPaperExecutionPlatform(core, { initialBalance: 50_000 });
    await paper.platform.startUserSession();

    const fill = await paper.execution.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: '0.01',
    });
    expect(fill.status).toBe('FILLED');

    // No REST handlers for openOrders/positionRisk are registered — paper
    // reconciliation must not touch the network.
    const summary = await paper.platform.reconcile();
    expect(summary.orders).toBe(1);
    expect(summary.positions).toBe(1);
    expect(paper.platform.orders.get(fill.clientOrderId)?.status).toBe('FILLED');
    expect(paper.platform.positions.get('BTCUSDT')?.positionAmount).toBe('0.01');
  });
});
