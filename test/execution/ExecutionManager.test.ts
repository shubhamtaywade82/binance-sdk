import { describe, expect, it, vi } from 'vitest';
import { ExecutionManager } from '../../src/execution/ExecutionManager.js';
import { ExecutionUnknownError } from '../../src/execution/types.js';
import { BinanceApiError, NetworkError } from '../../src/errors/index.js';
import type { FuturesTrading } from '../../src/resources/FuturesTrading.js';
import type { Order } from '../../src/types/trading.types.js';

function ackResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderId: 12345,
    symbol: 'BTCUSDT',
    status: 'NEW',
    clientOrderId: 'nbsdk-test',
    price: '50000',
    avgPrice: '0',
    origQty: '1',
    executedQty: '0',
    cumQuote: '0',
    type: 'LIMIT',
    reduceOnly: false,
    side: 'BUY',
    positionSide: 'BOTH',
    timeInForce: 'GTC',
    time: 1,
    updateTime: 1,
    ...overrides,
  };
}

function orderObject(overrides: Record<string, unknown> = {}): Order {
  return {
    orderId: 12345,
    symbol: 'BTCUSDT',
    status: 'NEW',
    clientOrderId: 'nbsdk-test',
    price: 50000,
    avgPrice: 0,
    origQty: 1,
    executedQty: 0,
    cumQuote: 0,
    type: 'LIMIT',
    reduceOnly: false,
    side: 'BUY',
    positionSide: 'BOTH',
    time: 1,
    updateTime: 1,
    ...overrides,
  } as Order;
}

function mockTrading(): FuturesTrading {
  return {
    createOrder: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
  } as unknown as FuturesTrading;
}

const BASE = { symbol: 'BTCUSDT', side: 'BUY' as const, type: 'LIMIT', quantity: 1, price: 50000 };

describe('ExecutionManager', () => {
  it('derives a deterministic clientOrderId and returns an acked Execution', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(ackResponse() as never);
    const manager = new ExecutionManager(trading, { clientOrderIdPrefix: 'test' });

    const execution = await manager.placeOrder({ ...BASE, intentId: 'intent-1' });

    expect(trading.createOrder).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(trading.createOrder).mock.calls[0][0];
    expect(sent.newClientOrderId).toMatch(/^test-intent1$/); // deterministic
    expect(execution.intentId).toBe('intent-1');
    expect(execution.reconciliationState).toBe('acked');
    expect(execution.exchangeOrderId).toBe(12345);
    expect(execution.requestedQuantity).toBe('1');
    expect(execution.requestedPrice).toBe('50000');
    expect(execution.status).toBe('NEW');
  });

  it('duplicate intent returns the original execution without resubmitting', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(ackResponse() as never);
    const manager = new ExecutionManager(trading);

    const first = await manager.placeOrder({ ...BASE, intentId: 'dup' });
    const second = await manager.placeOrder({ ...BASE, intentId: 'dup' });

    expect(trading.createOrder).toHaveBeenCalledTimes(1);
    expect(second.intentId).toBe(first.intentId);
    expect(second.exchangeOrderId).toBe(first.exchangeOrderId);
  });

  it('reconciles by clientOrderId when the ack is lost to a transport error', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockRejectedValueOnce(
      new NetworkError('socket hang up'),
    );
    // The order actually reached the engine:
    vi.mocked(trading.getOrder).mockResolvedValue(
      orderObject({ status: 'FILLED', executedQty: 1, cumQuote: 50000, avgPrice: 50000 }),
    );
    const manager = new ExecutionManager(trading, { reconcilePollDelayMs: 1 });

    const execution = await manager.placeOrder({ ...BASE, intentId: 'lost-ack' });

    expect(execution.reconciliationState).toBe('reconciled');
    expect(execution.status).toBe('FILLED');
    expect(execution.executedQuantity).toBe('1');
    // Decimal-exact average price: 50000 / 1.
    expect(execution.averagePrice).toBe('50000');
    // getOrder was polled with the clientOrderId as the reconciliation key.
    expect(vi.mocked(trading.getOrder).mock.calls[0][1]?.origClientOrderId).toMatch(/^nbsdk-/);
  });

  it('safely resubmits once when reconciliation proves the order never landed (-2013)', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder)
      .mockRejectedValueOnce(new NetworkError('timeout')) // first attempt: unknown outcome
      .mockResolvedValueOnce(ackResponse({ status: 'NEW' }) as never); // resubmission lands
    vi.mocked(trading.getOrder).mockRejectedValue(
      // -2013: Order does not exist → first submission never reached the engine.
      new BinanceApiError('Order does not exist', -2013, 400, {}),
    );
    const manager = new ExecutionManager(trading, { reconcilePollDelayMs: 1 });

    const execution = await manager.placeOrder({ ...BASE, intentId: 'retry-safe' });

    expect(trading.createOrder).toHaveBeenCalledTimes(2);
    // Same idempotency key on both submissions.
    const first = vi.mocked(trading.createOrder).mock.calls[0][0];
    const second = vi.mocked(trading.createOrder).mock.calls[1][0];
    expect(first.newClientOrderId).toBe(second.newClientOrderId);
    expect(execution.reconciliationState).toBe('acked');
  });

  it('surfaces ExecutionUnknownError (never a guess) when reconciliation cannot decide', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockRejectedValue(new NetworkError('blackout'));
    // Every reconciliation poll itself fails with a transport error:
    vi.mocked(trading.getOrder).mockRejectedValue(new NetworkError('still down'));
    const manager = new ExecutionManager(trading, {
      reconcileMaxAttempts: 2,
      reconcilePollDelayMs: 1,
    });

    await expect(manager.placeOrder({ ...BASE, intentId: 'unknown' })).rejects.toBeInstanceOf(
      ExecutionUnknownError,
    );

    // The unknown intent is still recorded, for later manual reconciliation.
    const recorded = manager.getExecution('unknown');
    expect(recorded?.reconciliationState).toBe('unknown');
    expect(recorded?.status).toBe('UNKNOWN');
  });

  it('exchange rejections are recorded and NOT retried', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockRejectedValue(
      new BinanceApiError('Filter failure: PRICE_FILTER', -4003, 400, {}),
    );
    const manager = new ExecutionManager(trading);

    await expect(manager.placeOrder({ ...BASE, intentId: 'rejected' })).rejects.toBeInstanceOf(
      BinanceApiError,
    );
    expect(trading.createOrder).toHaveBeenCalledTimes(1);
    expect(manager.getExecution('rejected')?.reconciliationState).toBe('rejected');
  });

  it('cancelOrder reconciles -2011 (already gone) into a CANCELED execution', async () => {
    const trading = mockTrading();
    vi.mocked(trading.cancelOrder).mockRejectedValue(
      new BinanceApiError('Unknown order sent', -2011, 400, {}),
    );
    const manager = new ExecutionManager(trading);

    const execution = await manager.cancelOrder('BTCUSDT', {
      origClientOrderId: 'nbsdk-gone',
      intentId: 'cancel-1',
    });
    expect(execution.status).toBe('CANCELED');
    expect(execution.reconciliationState).toBe('reconciled');
  });

  it('cancelOrder recovers the true state after a transport failure', async () => {
    const trading = mockTrading();
    vi.mocked(trading.cancelOrder).mockRejectedValueOnce(new NetworkError('reset'));
    vi.mocked(trading.getOrder).mockResolvedValue(orderObject({ status: 'CANCELED' }));
    const manager = new ExecutionManager(trading);

    const execution = await manager.cancelOrder('BTCUSDT', {
      origClientOrderId: 'nbsdk-x',
      intentId: 'cancel-2',
    });
    expect(execution.status).toBe('CANCELED');
    expect(execution.reconciliationState).toBe('reconciled');
  });

  it('manual reconcile() refreshes an execution from REST', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(ackResponse() as never);
    vi.mocked(trading.getOrder).mockResolvedValue(
      orderObject({ status: 'FILLED', executedQty: 1, cumQuote: 51000, avgPrice: 51000 }),
    );
    const manager = new ExecutionManager(trading);

    await manager.placeOrder({ ...BASE, intentId: 'manual' });
    const refreshed = await manager.reconcile('manual');
    expect(refreshed.status).toBe('FILLED');
    expect(refreshed.reconciliationState).toBe('reconciled');
  });

  it('ORDER_TRADE_UPDATE events stream live fills into the ledger', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(ackResponse() as never);
    const manager = new ExecutionManager(trading);
    const execution = await manager.placeOrder({ ...BASE, intentId: 'streamed' });
    const clientOrderId = execution.clientOrderId;

    const listeners: Array<(event: unknown) => void> = [];
    const fakeUserStream = {
      on: vi.fn((_event: string, handler: (event: unknown) => void) => {
        listeners.push(handler);
      }),
      off: vi.fn(),
    };
    manager.setUserStream(fakeUserStream as never);

    const report = {
      e: 'ORDER_TRADE_UPDATE',
      o: {
        s: 'BTCUSDT',
        c: clientOrderId,
        i: 12345,
        X: 'FILLED',
        z: '1',
        ap: '50100',
        l: '0.5',
        L: '50100',
        n: '0.02',
        N: 'USDT',
        t: 77,
      },
    };
    for (const listener of listeners) listener(report);

    const updated = manager.getExecution('streamed');
    expect(updated?.status).toBe('FILLED');
    expect(updated?.executedQuantity).toBe('1');
    expect(updated?.fills).toHaveLength(1);
    expect(updated?.fills[0]).toEqual({
      price: '50100',
      quantity: '0.5',
      commission: '0.02',
      commissionAsset: 'USDT',
      tradeId: 77,
    });
  });

  it('feeds exposure to an attached RiskGateway', async () => {
    const trading = mockTrading();
    vi.mocked(trading.createOrder).mockResolvedValue(
      ackResponse({ status: 'NEW', executedQty: '0', cumQuote: '0' }) as never,
    );
    const { RiskGateway } = await import('../../src/risk/RiskGateway.js');
    const gateway = new RiskGateway({ maxOpenNotional: 1000 });
    const manager = new ExecutionManager(trading, { riskGateway: gateway });

    // Requested price × quantity = 50000 > budget → denied by the gateway
    // before any order leaves (through the policy the client wires in).
    await manager.placeOrder({ ...BASE, price: 100, quantity: 5, intentId: 'risk-on' });
    // Notional: 100 × 5 = 500 registered while the order rests.
    expect(gateway.riskStatus().openNotional).toBe('500');

    // Terminal state releases the budget.
    vi.mocked(trading.getOrder).mockResolvedValue(orderObject({ status: 'FILLED', cumQuote: 500 }));
    await manager.reconcile('risk-on');
    expect(gateway.riskStatus().openNotional).toBe('0');
  });
});
