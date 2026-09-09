import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../src/core/events.js';
import { PositionTracker } from '../../../src/execution/platform/PositionTracker.js';
import { accountUpdateFrame, orderTradeUpdateFrame } from './helpers.js';

describe('PositionTracker', () => {
  it('folds ACCOUNT_UPDATE into a decimal-string position record', () => {
    const tracker = new PositionTracker();
    tracker.applyUserEvent(
      accountUpdateFrame({
        symbol: 'BTCUSDT',
        amount: '0.001',
        entryPrice: '50000.0',
        unrealizedPnl: '-0.00091',
      }),
    );

    const position = tracker.get('BTCUSDT')!;
    expect(position).toBeDefined();
    expect(position.positionSide).toBe('BOTH');
    expect(position.positionAmount).toBe('0.001');
    expect(position.entryPrice).toBe('50000');
    expect(position.unrealizedPnl).toBe('-0.00091');
    expect(position.marginType).toBe('cross');
    expect(position.isolatedWallet).toBe('0');
  });

  it('tracks hedge-mode LONG and SHORT sides under separate keys', () => {
    const tracker = new PositionTracker();
    tracker.applyUserEvent(
      accountUpdateFrame({ amount: '1', positionSide: 'LONG', entryPrice: '100' }),
    );
    tracker.applyUserEvent(
      accountUpdateFrame({ amount: '-2', positionSide: 'SHORT', entryPrice: '110' }),
    );

    expect(tracker.get('BTCUSDT', 'LONG')!.positionAmount).toBe('1');
    expect(tracker.get('BTCUSDT', 'SHORT')!.positionAmount).toBe('-2');
    // Default side lookup (BOTH) does not collide with hedge entries.
    expect(tracker.get('BTCUSDT', 'BOTH')).toBeUndefined();
    expect(tracker.size).toBe(2);
  });

  it('replaces state on subsequent updates for the same key', () => {
    const tracker = new PositionTracker();
    tracker.applyUserEvent(accountUpdateFrame({ amount: '0.001', entryPrice: '50000' }));
    tracker.applyUserEvent(accountUpdateFrame({ amount: '0.002', entryPrice: '51000', unrealizedPnl: '1.5' }));

    const position = tracker.get('BTCUSDT')!;
    expect(position.positionAmount).toBe('0.002');
    expect(position.entryPrice).toBe('51000');
    expect(position.unrealizedPnl).toBe('1.5');
  });

  it('nonZero filters flat positions out of the exposure view', () => {
    const tracker = new PositionTracker();
    tracker.applyUserEvent(accountUpdateFrame({ symbol: 'BTCUSDT', amount: '0.001' }));
    tracker.applyUserEvent(accountUpdateFrame({ symbol: 'ETHUSDT', amount: '0' }));

    expect(tracker.all()).toHaveLength(2);
    const exposure = tracker.nonZero();
    expect(exposure).toHaveLength(1);
    expect(exposure[0]!.symbol).toBe('BTCUSDT');
  });

  it('ignores non-ACCOUNT_UPDATE frames', () => {
    const tracker = new PositionTracker();
    tracker.applyUserEvent(orderTradeUpdateFrame({}));
    tracker.applyUserEvent({ e: 'MARGIN_CALL' });
    tracker.applyUserEvent(null);
    expect(tracker.size).toBe(0);
  });

  it('emits update events and publishes to the observability bus', () => {
    const events = new EventBus();
    const tracker = new PositionTracker({ events });
    const seen: string[] = [];
    const busSeen: string[] = [];
    tracker.on('update', (p) => seen.push(p.symbol));
    events
      .scoped('execution')
      .on('position.updated', (event: { payload: Record<string, unknown> }) => {
        busSeen.push(String(event.payload.symbol));
      });

    tracker.applyUserEvent(accountUpdateFrame({ symbol: 'BTCUSDT' }));
    expect(seen).toEqual(['BTCUSDT']);
    expect(busSeen).toEqual(['BTCUSDT']);
  });

  it('hands out defensive copies', () => {
    const tracker = new PositionTracker();
    tracker.applyUserEvent(accountUpdateFrame({ amount: '0.001' }));
    const position = tracker.get('BTCUSDT')!;
    position.positionAmount = '999';
    expect(tracker.get('BTCUSDT')!.positionAmount).toBe('0.001');
  });
});
