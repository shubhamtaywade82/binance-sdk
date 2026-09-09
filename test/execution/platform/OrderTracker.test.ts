import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/core/events.js';
import { OrderTracker } from '../../../src/execution/platform/OrderTracker.js';
import { orderUpdateFromOrderTradeUpdate } from '../../../src/execution/platform/normalize.js';
import {
  accountUpdateFrame,
  orderTradeUpdateFrame,
  spotExecutionReportFrame,
} from './helpers.js';

describe('OrderTracker', () => {
  it('folds a USDⓈ-M ORDER_TRADE_UPDATE into a decimal-string record', () => {
    const tracker = new OrderTracker();
    tracker.applyUserEvent(
      orderTradeUpdateFrame({
        clientOrderId: 'nbsdk-a',
        cumulativeQty: '0.001',
        avgPrice: '50000.1',
      }),
    );

    const record = tracker.get('nbsdk-a');
    expect(record).toBeDefined();
    expect(record!.symbol).toBe('BTCUSDT');
    expect(record!.side).toBe('BUY');
    expect(record!.type).toBe('LIMIT');
    expect(record!.status).toBe('NEW');
    expect(record!.originalQuantity).toBe('0.001');
    expect(record!.executedQuantity).toBe('0.001');
    // No cumulative quote on futures frames: estimated z × ap (0.001 × 50000.1).
    expect(record!.cumulativeQuoteQuantity).toBe('50.0001');
    expect(record!.averagePrice).toBe('50000.1');
    expect(record!.exchangeOrderId).toBe(12345);
    expect(record!.positionSide).toBe('BOTH');
    expect(record!.timeInForce).toBe('GTC');
  });

  it('keeps exact decimal strings — no binary-float leakage', () => {
    const update = orderUpdateFromOrderTradeUpdate(
      orderTradeUpdateFrame({
        cumulativeQty: '123.456',
        avgPrice: '50000.123456',
      }) as Record<string, unknown>,
    );
    expect(update!.executedQuantity).toBe('123.456');
    expect(update!.averagePrice).toBe('50000.123456');
  });

  it('appends fills per trade and deduplicates by trade id', () => {
    const tracker = new OrderTracker();
    const base = { clientOrderId: 'nbsdk-fills' };
    tracker.applyUserEvent(
      orderTradeUpdateFrame({
        ...base,
        executionType: 'TRADE',
        orderStatus: 'PARTIALLY_FILLED',
        lastQty: '0.0004',
        lastPrice: '50000.00',
        cumulativeQty: '0.0004',
        avgPrice: '50000.00',
        tradeId: 8001,
        commission: '0.00002',
      }),
    );
    // Duplicate delivery of the same trade id: no double fill.
    tracker.applyUserEvent(
      orderTradeUpdateFrame({
        ...base,
        executionType: 'TRADE',
        orderStatus: 'PARTIALLY_FILLED',
        lastQty: '0.0004',
        lastPrice: '50000.00',
        cumulativeQty: '0.0004',
        avgPrice: '50000.00',
        tradeId: 8001,
        commission: '0.00002',
      }),
    );
    tracker.applyUserEvent(
      orderTradeUpdateFrame({
        ...base,
        executionType: 'TRADE',
        orderStatus: 'FILLED',
        lastQty: '0.0006',
        lastPrice: '50010.00',
        cumulativeQty: '0.001',
        avgPrice: '50004.00',
        tradeId: 8002,
      }),
    );

    const record = tracker.get('nbsdk-fills')!;
    expect(record.fills).toHaveLength(2);
    // Decimal strings are value-exact and normalized (trailing zeros stripped).
    expect(record.fills[0]).toMatchObject({
      price: '50000',
      quantity: '0.0004',
      commission: '0.00002',
      commissionAsset: 'USDT',
      tradeId: 8001,
    });
    expect(record.fills[1]).toMatchObject({ price: '50010', quantity: '0.0006', tradeId: 8002 });
    expect(record.status).toBe('FILLED');
    expect(record.executedQuantity).toBe('0.001');
  });

  it('terminal records are immutable to late frames', () => {
    const tracker = new OrderTracker();
    tracker.applyUserEvent(
      orderTradeUpdateFrame({ clientOrderId: 'nbsdk-term', orderStatus: 'FILLED' }),
    );
    tracker.applyUserEvent(
      orderTradeUpdateFrame({
        clientOrderId: 'nbsdk-term',
        orderStatus: 'PARTIALLY_FILLED',
        cumulativeQty: '0.5',
      }),
    );
    const record = tracker.get('nbsdk-term')!;
    expect(record.status).toBe('FILLED');
    expect(record.executedQuantity).toBe('0');
  });

  it('folds spot executionReport frames with native cumulative quote', () => {
    const tracker = new OrderTracker();
    tracker.applyUserEvent(spotExecutionReportFrame());

    const record = tracker.get('spot-client-1')!;
    expect(record).toBeDefined();
    expect(record.symbol).toBe('ETHBTC');
    expect(record.status).toBe('PARTIALLY_FILLED');
    expect(record.executedQuantity).toBe('0.5');
    expect(record.cumulativeQuoteQuantity).toBe('0.0032');
    // Spot has no ap: computed as Z/z.
    expect(record.averagePrice).toBe('0.0064');
    expect(record.fills).toHaveLength(1);
    expect(record.fills[0]).toMatchObject({ quantity: '0.5', tradeId: 99887 });
  });

  it('ignores frames that are not execution reports', () => {
    const tracker = new OrderTracker();
    tracker.applyUserEvent(accountUpdateFrame());
    tracker.applyUserEvent({ e: 'MARGIN_CALL', cw: '0', p: [] });
    tracker.applyUserEvent(null);
    expect(tracker.size).toBe(0);
  });

  it('emits update events and publishes to the observability bus', () => {
    const events = new EventBus();
    const seen: string[] = [];
    const busSeen: string[] = [];
    const tracker = new OrderTracker({ events });
    tracker.on('update', (record) => seen.push(record.clientOrderId));
    const scoped = events.scoped('execution');
    scoped.on('order.updated', (event: { payload: Record<string, unknown> }) => {
      busSeen.push(String(event.payload.clientOrderId));
    });

    tracker.applyUserEvent(orderTradeUpdateFrame({ clientOrderId: 'nbsdk-ev' }));
    expect(seen).toEqual(['nbsdk-ev']);
    expect(busSeen).toEqual(['nbsdk-ev']);
  });

  it('waitForTerminal resolves when the stream reports a terminal status', async () => {
    const tracker = new OrderTracker();
    tracker.applyUserEvent(orderTradeUpdateFrame({ clientOrderId: 'nbsdk-w', orderStatus: 'NEW' }));
    const pending = tracker.waitForTerminal('nbsdk-w');
    tracker.applyUserEvent(
      orderTradeUpdateFrame({ clientOrderId: 'nbsdk-w', orderStatus: 'FILLED' }),
    );
    const record = await pending;
    expect(record.status).toBe('FILLED');
  });

  it('waitForTerminal resolves immediately for already-terminal orders', async () => {
    const tracker = new OrderTracker();
    tracker.applyUserEvent(
      orderTradeUpdateFrame({ clientOrderId: 'nbsdk-t2', orderStatus: 'CANCELED' }),
    );
    const record = await tracker.waitForTerminal('nbsdk-t2');
    expect(record.status).toBe('CANCELED');
  });

  it('waitForTerminal rejects unknown orders and on timeout', async () => {
    const tracker = new OrderTracker();
    await expect(tracker.waitForTerminal('nope')).rejects.toThrow(/unknown clientOrderId/);

    tracker.applyUserEvent(orderTradeUpdateFrame({ clientOrderId: 'nbsdk-x', orderStatus: 'NEW' }));
    await expect(tracker.waitForTerminal('nbsdk-x', 10)).rejects.toThrow(/not terminal within/);
  });

  it('folds REST order shapes and indexes by exchange id', () => {
    const tracker = new OrderTracker();
    tracker.applyOrderShape({
      clientOrderId: 'nbsdk-rest',
      orderId: 999,
      symbol: 'BTCUSDT',
      side: 'SELL',
      type: 'MARKET',
      status: 'NEW',
      executedQty: '0',
      cumQuote: '0',
      avgPrice: '0',
      updateTime: 1000,
      fills: [],
    });

    expect(tracker.get('nbsdk-rest')!.status).toBe('NEW');
    expect(tracker.getByExchangeId(999)!.clientOrderId).toBe('nbsdk-rest');
    expect(tracker.open()).toHaveLength(1);
    expect(tracker.all()).toHaveLength(1);
  });

  it('hands out defensive copies', () => {
    const tracker = new OrderTracker();
    tracker.applyUserEvent(
      orderTradeUpdateFrame({
        clientOrderId: 'nbsdk-c',
        executionType: 'TRADE',
        orderStatus: 'PARTIALLY_FILLED',
        lastQty: '0.001',
        lastPrice: '50000',
        cumulativeQty: '0.001',
        avgPrice: '50000',
        tradeId: 1,
      }),
    );
    const record = tracker.get('nbsdk-c')!;
    record.status = 'TAMPERED';
    record.fills.push({ price: '1', quantity: '1' });
    const fresh = tracker.get('nbsdk-c')!;
    expect(fresh.status).toBe('PARTIALLY_FILLED');
    expect(fresh.fills).toHaveLength(1);
  });

  it('evicts the oldest records beyond maxRecords', () => {
    const tracker = new OrderTracker({ maxRecords: 3 });
    for (let i = 0; i < 5; i += 1) {
      tracker.applyUserEvent(
        orderTradeUpdateFrame({ clientOrderId: `nbsdk-e${i}` }),
      );
    }
    expect(tracker.size).toBe(3);
    expect(tracker.get('nbsdk-e0')).toBeUndefined();
    expect(tracker.get('nbsdk-e4')).toBeDefined();
  });
});
