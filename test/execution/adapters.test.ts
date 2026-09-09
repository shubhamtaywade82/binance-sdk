import { describe, expect, it, vi } from 'vitest';
import { ExecutionManager } from '../../src/execution/ExecutionManager.js';
import {
  SpotExecutionAdapter,
  FuturesExecutionAdapter,
  isExecutionAdapter,
} from '../../src/execution/adapter.js';
import { PaperExecutionAdapter } from '../../src/execution/paper.js';
import { ExecutionGateway } from '../../src/execution/Gateway.js';
import { PaperTradingEngine } from '../../src/paper/PaperTradingEngine.js';
import type { FuturesMarket } from '../../src/resources/FuturesMarket.js';
import type { SpotTrading } from '../../src/resources/SpotTrading.js';
import { BinanceApiError, NetworkError } from '../../src/errors/index.js';

// ---------------------------------------------------------------------------
// Spot adapter: one execution manager, spot semantics
// ---------------------------------------------------------------------------

/** Spot-shaped order payload as SpotOrderSchema.parse would produce. */
function spotOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol: 'BTCUSDT',
    orderId: 555,
    clientOrderId: 'spot-1',
    status: 'NEW',
    side: 'BUY',
    type: 'LIMIT',
    price: '50000',
    origQty: '1',
    executedQty: '0',
    cummulativeQuoteQty: '0',
    transactTime: 1000,
    workingTime: 1000,
    ...overrides,
  };
}

function mockSpotTrading(): SpotTrading {
  return {
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
  } as unknown as SpotTrading;
}

const SPOT_ORDER = { symbol: 'BTCUSDT', side: 'BUY' as const, type: 'LIMIT' as const, quantity: 1, price: 50000 };

describe('SpotExecutionAdapter', () => {
  it('normalizes spot field names (cummulativeQuoteQty, transactTime) into the Execution envelope', async () => {
    const trading = mockSpotTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(
      spotOrder({ status: 'FILLED', executedQty: '1', cummulativeQuoteQty: '51000' }) as never,
    );
    const manager = new ExecutionManager(new SpotExecutionAdapter(trading));

    const execution = await manager.placeOrder({ ...SPOT_ORDER, intentId: 's-1' });

    expect(execution.reconciliationState).toBe('acked');
    expect(execution.status).toBe('FILLED');
    expect(execution.executedQuantity).toBe('1');
    expect(execution.cumulativeQuoteQuantity).toBe('51000');
    // Spot orders carry no avgPrice: computed exactly as quote / qty.
    expect(execution.averagePrice).toBe('51000');
    expect(execution.exchangeOrderId).toBe(555);
    expect(manager.product).toBe('spot');
  });

  it('reconciles spot orders by origClientOrderId after a transport failure', async () => {
    const trading = mockSpotTrading();
    vi.mocked(trading.createOrder).mockRejectedValueOnce(new NetworkError('reset'));
    vi.mocked(trading.getOrder).mockResolvedValue(
      spotOrder({ status: 'FILLED', executedQty: '1', cummulativeQuoteQty: '50000' }) as never,
    );
    const manager = new ExecutionManager(new SpotExecutionAdapter(trading), {
      reconcilePollDelayMs: 1,
    });

    const execution = await manager.placeOrder({ ...SPOT_ORDER, intentId: 's-2' });

    expect(execution.reconciliationState).toBe('reconciled');
    expect(vi.mocked(trading.getOrder).mock.calls[0][1]?.origClientOrderId).toMatch(/^nbsdk-/);
  });

  it('streams spot executionReport events into the ledger', async () => {
    const trading = mockSpotTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(spotOrder() as never);
    const manager = new ExecutionManager(new SpotExecutionAdapter(trading));
    const execution = await manager.placeOrder({ ...SPOT_ORDER, intentId: 's-3' });

    const listeners: Array<(event: unknown) => void> = [];
    const fakeUserStream = {
      on: vi.fn((_e: string, handler: (event: unknown) => void) => {
        listeners.push(handler);
      }),
      off: vi.fn(),
    };
    manager.setUserStream(fakeUserStream as never);

    // Spot executionReport: fills at top level, Z = cumulative quote.
    for (const listener of listeners) {
      listener({
        e: 'executionReport',
        E: 2000,
        s: 'BTCUSDT',
        c: execution.clientOrderId,
        i: 555,
        X: 'FILLED',
        x: 'TRADE',
        l: '1',
        L: '50500',
        z: '1',
        Z: '50500',
        n: '0.01',
        N: 'USDT',
        t: 9,
        T: 2000,
      });
    }

    const updated = manager.getExecution('s-3');
    expect(updated?.status).toBe('FILLED');
    expect(updated?.executedQuantity).toBe('1');
    expect(updated?.fills).toHaveLength(1);
    expect(updated?.fills[0]).toEqual({
      price: '50500',
      quantity: '1',
      commission: '0.01',
      commissionAsset: 'USDT',
      tradeId: 9,
    });
  });

  it('exchange rejections flow through identically', async () => {
    const trading = mockSpotTrading();
    vi.mocked(trading.createOrder).mockRejectedValue(
      new BinanceApiError('Account has insufficient balance', -2010, 400, {}),
    );
    const manager = new ExecutionManager(new SpotExecutionAdapter(trading));

    await expect(manager.placeOrder({ ...SPOT_ORDER, intentId: 's-4' })).rejects.toBeInstanceOf(
      BinanceApiError,
    );
    expect(manager.getExecution('s-4')?.reconciliationState).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// Paper adapter: the simulator as an execution backend
// ---------------------------------------------------------------------------

function paperMarket(price = 50000): FuturesMarket {
  return { tickerPrice: vi.fn().mockResolvedValue({ price }) } as unknown as FuturesMarket;
}

describe('PaperExecutionAdapter', () => {
  it('returns the same Execution envelope a live fill would produce', async () => {
    const adapter = new PaperExecutionAdapter(new PaperTradingEngine({ market: paperMarket() }));
    const manager = new ExecutionManager(adapter, { clientOrderIdPrefix: 'paper' });

    const execution = await manager.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      intentId: 'p-1',
    });

    expect(manager.product).toBe('paper');
    expect(execution.reconciliationState).toBe('acked');
    expect(execution.status).toBe('FILLED');
    expect(execution.executedQuantity).toBe('0.1');
    // Decimal-exact string, not a float artifact.
    expect(execution.exchangeOrderId).toBeGreaterThan(0);
    // The fill streams in through the report path too.
    expect(execution.fills).toHaveLength(1);
    expect(execution.fills[0]?.price).toBe('50000');
  });

  it('duplicate intents dedupe without touching the simulator twice', async () => {
    const market = paperMarket();
    const adapter = new PaperExecutionAdapter(new PaperTradingEngine({ market: market }));
    const manager = new ExecutionManager(adapter);

    const first = await manager.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      intentId: 'p-dup',
    });
    const second = await manager.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      intentId: 'p-dup',
    });

    expect(second.exchangeOrderId).toBe(first.exchangeOrderId);
    expect(market.tickerPrice).toHaveBeenCalledTimes(1);
  });

  it('reconcile() recovers the fill from the simulator registry', async () => {
    const adapter = new PaperExecutionAdapter(new PaperTradingEngine({ market: paperMarket() }));
    const manager = new ExecutionManager(adapter);

    await manager.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      intentId: 'p-recon',
    });
    const refreshed = await manager.reconcile('p-recon');
    expect(refreshed.reconciliationState).toBe('reconciled');
    expect(refreshed.status).toBe('FILLED');
  });

  it('unknown-order fetches fail with the exchange-identical -2013', async () => {
    const adapter = new PaperExecutionAdapter(new PaperTradingEngine({ market: paperMarket() }));
    await expect(adapter.fetchOrder('BTCUSDT', { origClientOrderId: 'nope' })).rejects.toMatchObject({
      code: -2013,
    });
  });

  it('cancel reconciles into a terminal CANCELED execution (the -2011 path)', async () => {
    const adapter = new PaperExecutionAdapter(new PaperTradingEngine({ market: paperMarket() }));
    const manager = new ExecutionManager(adapter);

    const execution = await manager.cancelOrder('BTCUSDT', {
      origClientOrderId: 'paper-gone',
      intentId: 'p-cancel',
    });
    expect(execution.status).toBe('CANCELED');
    expect(execution.reconciliationState).toBe('reconciled');
  });

  it('rejects unsupported order types with an exchange-style error', async () => {
    const adapter = new PaperExecutionAdapter(new PaperTradingEngine({ market: paperMarket() }));
    const manager = new ExecutionManager(adapter);

    await expect(
      manager.placeOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'STOP_MARKET',
        quantity: 1,
        intentId: 'p-stop',
      }),
    ).rejects.toBeInstanceOf(BinanceApiError);
  });

  it('rejections from the simulator surface as exchange rejections', async () => {
    const adapter = new PaperExecutionAdapter(
      new PaperTradingEngine({ market: paperMarket(), initialBalance: 1 }),
    );
    const manager = new ExecutionManager(adapter);

    await expect(
      manager.placeOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
        intentId: 'p-broke',
      }),
    ).rejects.toBeInstanceOf(BinanceApiError);
    expect(manager.getExecution('p-broke')?.reconciliationState).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// ExecutionGateway: one interface, two backends
// ---------------------------------------------------------------------------

function gatewayFixture(options: { defaultBackend?: 'live' | 'paper' } = {}) {
  const liveTrading = {
    createOrder: vi.fn().mockResolvedValue({
      orderId: 1,
      symbol: 'BTCUSDT',
      status: 'NEW',
      clientOrderId: 'live-1',
      avgPrice: '0',
      executedQty: '0',
      cumQuote: '0',
      type: 'MARKET',
      side: 'BUY',
      updateTime: 1,
    }),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
  };
  const live = new ExecutionManager(liveTrading as never);
  const gateway = new ExecutionGateway({
    live,
    paperEngine: new PaperTradingEngine({ market: paperMarket() }),
    ...options,
  });
  return { gateway, liveTrading };
}

describe('ExecutionGateway', () => {
  it('routes by default backend when none is specified', async () => {
    const { gateway } = gatewayFixture({ defaultBackend: 'paper' });
    const execution = await gateway.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      intentId: 'g-1',
    });
    expect(execution.status).toBe('FILLED'); // paper fills instantly
    expect(gateway.listExecutions('paper')).toHaveLength(1);
    expect(gateway.listExecutions('live')).toHaveLength(0);
  });

  it('routes explicit backend regardless of default', async () => {
    const { gateway, liveTrading } = gatewayFixture({ defaultBackend: 'paper' });
    const execution = await gateway.placeOrder(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.1, intentId: 'g-2' },
      { backend: 'live' },
    );
    expect(execution.status).toBe('NEW'); // live ack
    expect(liveTrading.createOrder).toHaveBeenCalledTimes(1);
  });

  it('ledgers stay independent per backend', async () => {
    const { gateway } = gatewayFixture({ defaultBackend: 'paper' });
    await gateway.placeOrder(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.1, intentId: 'g-a' },
      { backend: 'paper' },
    );
    await gateway.placeOrder(
      { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.1, intentId: 'g-b' },
      { backend: 'paper' },
    );

    expect(gateway.listExecutions('paper')).toHaveLength(2);
    expect(gateway.getExecution('g-a', 'paper')).toBeDefined();
    expect(gateway.getExecution('g-a', 'live')).toBeUndefined();
  });

  it('exposes the paper simulator for account inspection', async () => {
    const { gateway } = gatewayFixture({ defaultBackend: 'paper' });
    await gateway.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.1,
      intentId: 'g-3',
    });
    const account = gateway.paperEngine.getAccountInfo();
    expect(account.orders).toHaveLength(1);
    expect(account.positions['BTCUSDT']).toBeDefined();
  });

  it('use() returns the scoped manager of a backend', () => {
    const { gateway } = gatewayFixture();
    expect(gateway.use('live').product).toBe('usdm');
    expect(gateway.use('paper').product).toBe('paper');
    expect(gateway.backend).toBe('live');
  });
});

// ---------------------------------------------------------------------------
// Adapter detection (backward compatibility)
// ---------------------------------------------------------------------------

describe('isExecutionAdapter', () => {
  it('recognizes adapters and passes through raw trading resources', () => {
    const paper = new PaperExecutionAdapter(new PaperTradingEngine());
    const spot = new SpotExecutionAdapter(mockSpotTrading());
    const futures = new FuturesExecutionAdapter({
      createOrder: vi.fn(),
      getOrder: vi.fn(),
      cancelOrder: vi.fn(),
    } as never);

    expect(isExecutionAdapter(paper)).toBe(true);
    expect(isExecutionAdapter(spot)).toBe(true);
    expect(isExecutionAdapter(futures)).toBe(true);

    // A raw FuturesTrading-like object (the legacy constructor form) is not.
    expect(isExecutionAdapter(mockSpotTrading())).toBe(false);
    expect(isExecutionAdapter(null)).toBe(false);
    expect(isExecutionAdapter(undefined)).toBe(false);
  });
});
