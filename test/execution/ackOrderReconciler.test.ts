import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { AckOrderReconciler, ORDER_TERMINAL_STATUSES } from '../../src/execution/AckOrderReconciler.js';

const frame = (c: string, X: string) => ({ e: 'ORDER_TRADE_UPDATE' as const, o: { c, X } });

describe('AckOrderReconciler', () => {
  it('defines the verified terminal statuses and nothing else', () => {
    expect([...ORDER_TERMINAL_STATUSES].sort()).toEqual(['CANCELED', 'EXPIRED', 'EXPIRED_IN_MATCH', 'FILLED', 'REJECTED']);
    expect(ORDER_TERMINAL_STATUSES.has('NEW')).toBe(false);
    expect(ORDER_TERMINAL_STATUSES.has('PARTIALLY_FILLED')).toBe(false);
  });

  it('resolves TERMINAL when the fill arrives after the ACK', async () => {
    const source = new EventEmitter();
    const reconciler = new AckOrderReconciler(source, { timeoutMs: 1000 });
    const result = reconciler.placeAndAwait('cid-1', async () => {
      setTimeout(() => {
        source.emit('ORDER_TRADE_UPDATE', frame('cid-1', 'NEW'));
        source.emit('ORDER_TRADE_UPDATE', frame('cid-1', 'FILLED'));
      }, 5);
    });
    await expect(result).resolves.toMatchObject({ status: 'TERMINAL', orderStatus: 'FILLED' });
    expect(source.listenerCount('ORDER_TRADE_UPDATE')).toBe(0);
  });

  it('captures a terminal frame that is emitted during the placement call (no race)', async () => {
    const source = new EventEmitter();
    const reconciler = new AckOrderReconciler(source, { timeoutMs: 1000 });
    const result = await reconciler.placeAndAwait('cid-2', async () => {
      source.emit('ORDER_TRADE_UPDATE', frame('cid-2', 'REJECTED'));
    });
    expect(result).toMatchObject({ status: 'TERMINAL', orderStatus: 'REJECTED' });
  });

  it('ignores frames for other client order ids', async () => {
    const source = new EventEmitter();
    const reconciler = new AckOrderReconciler(source, { timeoutMs: 30 });
    const result = await reconciler.placeAndAwait('mine', async () => {
      source.emit('ORDER_TRADE_UPDATE', frame('someone-else', 'FILLED'));
    });
    expect(result).toEqual({ status: 'TIMEOUT', lastStatus: undefined });
  });

  it('times out with the last non-terminal status, leaving reconciliation to the caller', async () => {
    const source = new EventEmitter();
    const reconciler = new AckOrderReconciler(source, { timeoutMs: 30 });
    const result = await reconciler.placeAndAwait('cid-3', async () => {
      source.emit('ORDER_TRADE_UPDATE', frame('cid-3', 'PARTIALLY_FILLED'));
    });
    expect(result).toEqual({ status: 'TIMEOUT', lastStatus: 'PARTIALLY_FILLED' });
    expect(source.listenerCount('ORDER_TRADE_UPDATE')).toBe(0);
  });

  it('propagates a placement failure and still removes its listener', async () => {
    const source = new EventEmitter();
    const reconciler = new AckOrderReconciler(source, { timeoutMs: 1000 });
    await expect(
      reconciler.placeAndAwait('cid-4', async () => {
        throw new Error('rejected at the gate');
      }),
    ).rejects.toThrow('rejected at the gate');
    expect(source.listenerCount('ORDER_TRADE_UPDATE')).toBe(0);
  });
});
