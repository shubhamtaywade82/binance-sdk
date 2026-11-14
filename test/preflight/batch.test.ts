import { describe, expect, it, vi } from 'vitest';
import { BinanceApiError } from '../../src/errors/BinanceApiError.js';
import { PreflightValidationError } from '../../src/errors/PreflightValidationError.js';
import { chunkBatch, executeBatchOrders, isBatchErrorElement } from '../../src/preflight/batch.js';

const items = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('chunkBatch', () => {
  it('splits into chunks of at most 5, preserving order', () => {
    expect(chunkBatch(items(12)).map((c) => c.length)).toEqual([5, 5, 2]);
    expect(chunkBatch(items(12))[2]).toEqual([10, 11]);
    expect(chunkBatch([])).toEqual([]);
  });

  it('rejects a chunk size above the 5-order exchange limit', () => {
    expect(() => chunkBatch(items(3), 6)).toThrow(PreflightValidationError);
    expect(() => chunkBatch(items(3), 0)).toThrow(PreflightValidationError);
  });
});

describe('isBatchErrorElement', () => {
  it('recognizes {code,msg} errors and not order objects', () => {
    expect(isBatchErrorElement({ code: -2019, msg: 'Margin is insufficient.' })).toBe(true);
    expect(isBatchErrorElement({ orderId: 1, code: 200, msg: 'ok' })).toBe(false);
    expect(isBatchErrorElement({ orderId: 1, symbol: 'BTCUSDT' })).toBe(false);
    expect(isBatchErrorElement(null)).toBe(false);
  });
});

describe('executeBatchOrders', () => {
  it('sends at most 5 per call and maps per-element results to input indexes', async () => {
    const sendChunk = vi.fn(async (chunk: readonly number[]) =>
      chunk.map((n) => (n % 2 === 0 ? { orderId: n, symbol: 'BTCUSDT' } : { code: -2010, msg: 'rejected' })),
    );
    const outcomes = await executeBatchOrders(items(7), sendChunk);

    expect(sendChunk.mock.calls.map((call) => call[0].length)).toEqual([5, 2]);
    expect(outcomes).toHaveLength(7);
    expect(outcomes[0]).toEqual({ status: 'ACCEPTED', index: 0, data: { orderId: 0, symbol: 'BTCUSDT' } });
    expect(outcomes[1]).toEqual({ status: 'REJECTED', index: 1, code: -2010, msg: 'rejected' });
    expect(outcomes.map((o) => o.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('marks a 4xx whole-request failure as REJECTED (nothing was processed)', async () => {
    const refusal = new BinanceApiError('Too many requests', -1003, 429);
    const outcomes = await executeBatchOrders(items(2), async () => {
      throw refusal;
    });
    expect(outcomes).toEqual([
      { status: 'REJECTED', index: 0, code: -1003, msg: 'Too many requests' },
      { status: 'REJECTED', index: 1, code: -1003, msg: 'Too many requests' },
    ]);
  });

  it('marks a transport or 5xx failure as UNKNOWN, and still runs later chunks', async () => {
    const network = new Error('socket hang up');
    let call = 0;
    const outcomes = await executeBatchOrders(items(7), async (chunk) => {
      call += 1;
      if (call === 1) throw network;
      return chunk.map((n) => ({ orderId: n }));
    });

    expect(outcomes.slice(0, 5).every((o) => o.status === 'UNKNOWN')).toBe(true);
    expect((outcomes[0] as { error: unknown }).error).toBe(network);
    expect(outcomes.slice(5).every((o) => o.status === 'ACCEPTED')).toBe(true);
  });

  it('treats a reply with the wrong element count as UNKNOWN for the whole chunk', async () => {
    const outcomes = await executeBatchOrders(items(3), async () => [{ orderId: 1 }]);
    expect(outcomes.every((o) => o.status === 'UNKNOWN')).toBe(true);
    expect(outcomes).toHaveLength(3);
  });

  it('returns an empty result for an empty input without calling the exchange', async () => {
    const sendChunk = vi.fn(async () => []);
    expect(await executeBatchOrders([], sendChunk)).toEqual([]);
    expect(sendChunk).not.toHaveBeenCalled();
  });
});
