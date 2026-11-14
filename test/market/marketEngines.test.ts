import { describe, expect, it, vi } from 'vitest';
import { AggTradeBarBuilder } from '../../src/market/AggTradeBarBuilder.js';
import { iterateHistoricalKlines } from '../../src/market/historicalKlines.js';
import { ExecutionLatencyMonitor } from '../../src/market/ExecutionLatencyMonitor.js';

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('AggTradeBarBuilder', () => {
  it('builds exact OHLCV within a bucket and closes it when the next bucket starts', () => {
    const b = new AggTradeBarBuilder(1000);
    expect(b.push({ price: '100.10', quantity: '0.1', timestampMs: 100 })).toEqual([]);
    expect(b.push({ price: '100.30', quantity: '0.2', timestampMs: 400 })).toEqual([]);
    expect(b.push({ price: '99.90', quantity: '0.3', timestampMs: 900 })).toEqual([]);
    const closed = b.push({ price: '100.00', quantity: '1', timestampMs: 1000 });
    expect(closed).toHaveLength(1);
    expect(closed[0]).toEqual({
      bucketStartMs: 0,
      open: '100.1',
      high: '100.3',
      low: '99.9',
      close: '99.9',
      volume: '0.6',
      quoteVolume: '60.04', // 100.10*0.1 + 100.30*0.2 + 99.90*0.3 = 10.01 + 20.06 + 29.97
      trades: 3,
    });
  });

  it('uses exact decimals for volume (0.1 + 0.2 is 0.3, not 0.30000000000000004)', () => {
    const b = new AggTradeBarBuilder(60_000);
    b.push({ price: '1', quantity: '0.1', timestampMs: 0 });
    b.push({ price: '1', quantity: '0.2', timestampMs: 1 });
    expect(b.flush()[0]?.volume).toBe('0.3');
  });

  it('invariant: high >= max(open, close) and low <= min(open, close)', () => {
    const b = new AggTradeBarBuilder(10_000);
    const prices = ['5', '7.5', '3', '6', '4.25'];
    prices.forEach((p, i) => b.push({ price: p, quantity: '1', timestampMs: i }));
    const [bar] = b.flush();
    expect(Number(bar?.high)).toBeGreaterThanOrEqual(Math.max(Number(bar?.open), Number(bar?.close)));
    expect(Number(bar?.low)).toBeLessThanOrEqual(Math.min(Number(bar?.open), Number(bar?.close)));
    expect(bar?.high).toBe('7.5');
    expect(bar?.low).toBe('3');
  });

  it('rejects out-of-order trades instead of misbucketing them', () => {
    const b = new AggTradeBarBuilder(1000);
    b.push({ price: '1', quantity: '1', timestampMs: 500 });
    expect(() => b.push({ price: '1', quantity: '1', timestampMs: 499 })).toThrow(RangeError);
  });

  it('rejects zero price, zero quantity, and invalid bucket size', () => {
    const b = new AggTradeBarBuilder(1000);
    expect(() => b.push({ price: '0', quantity: '1', timestampMs: 0 })).toThrow(RangeError);
    expect(() => b.push({ price: '1', quantity: '0', timestampMs: 0 })).toThrow(RangeError);
    expect(() => new AggTradeBarBuilder(0)).toThrow(RangeError);
  });
});

describe('iterateHistoricalKlines', () => {
  const row = (openTime: number): readonly unknown[] => [openTime, '1', '1', '1', '1', '1'];

  it('paginates from lastOpenTime + 1 until a short page ends the walk', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce([row(0), row(60_000)])
      .mockResolvedValueOnce([row(120_000)]);
    const rows = await collect(
      iterateHistoricalKlines({ startTime: 0, pageSize: 2, fetchPage }),
    );
    expect(rows.map((r) => r[0])).toEqual([0, 60_000, 120_000]);
    expect(fetchPage.mock.calls[1]?.[0]).toEqual({ startTime: 60_001, endTime: undefined, limit: 2 });
  });

  it('stops at endTime and does not yield rows past it', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce([row(0), row(60_000), row(120_000)]);
    const rows = await collect(
      iterateHistoricalKlines({ startTime: 0, endTime: 60_000, pageSize: 3, fetchPage }),
    );
    expect(rows.map((r) => r[0])).toEqual([0, 60_000]);
  });

  it('throws on non-increasing open times (corrupt or misordered response)', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce([row(60_000), row(0)]);
    await expect(collect(iterateHistoricalKlines({ startTime: 0, pageSize: 5, fetchPage }))).rejects.toThrow(
      /not strictly increasing/,
    );
  });

  it('throws when a row has no integer open time', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce([['not-a-time', '1']]);
    await expect(collect(iterateHistoricalKlines({ startTime: 0, pageSize: 5, fetchPage }))).rejects.toThrow(
      /integer open time/,
    );
  });

  it('honours maxPages and an abort signal', async () => {
    // Each page returns the bar at the requested cursor, so open times keep increasing.
    const fetchPage = vi.fn(async ({ startTime }: { startTime: number }) => [row(startTime)]);
    const rows = await collect(
      iterateHistoricalKlines({ startTime: 0, pageSize: 1, fetchPage, maxPages: 2 }),
    );
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r[0])).toEqual([0, 1]);

    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(iterateHistoricalKlines({ startTime: 0, pageSize: 1, fetchPage, signal: controller.signal })),
    ).rejects.toThrow(/aborted/);
  });
});

describe('ExecutionLatencyMonitor', () => {
  it('records receive lag and E − T, with nearest-rank p95', () => {
    const m = new ExecutionLatencyMonitor();
    for (let i = 1; i <= 20; i++) {
      m.record({ eventTimeMs: 1000, transactionTimeMs: 1000 - i, receivedAtMs: 1000 + i });
    }
    const lag = m.stats('receiveLag');
    expect(lag?.count).toBe(20);
    expect(lag?.min).toBe(1);
    expect(lag?.max).toBe(20);
    expect(lag?.p95).toBe(19);
    expect(m.stats('eventMinusTransaction')?.min).toBe(1);
  });

  it('counts negative receive lag as clock skew, not latency', () => {
    const m = new ExecutionLatencyMonitor();
    m.record({ eventTimeMs: 2000, receivedAtMs: 1990 });
    expect(m.clockSkewSamples).toBe(1);
  });

  it('returns undefined stats when no sample carries the metric', () => {
    const m = new ExecutionLatencyMonitor();
    m.record({ eventTimeMs: 1, receivedAtMs: 2 });
    expect(m.stats('eventMinusTransaction')).toBeUndefined();
  });

  it('bounds the window size', () => {
    const m = new ExecutionLatencyMonitor(3);
    for (let i = 0; i < 10; i++) m.record({ eventTimeMs: 0, receivedAtMs: i });
    expect(m.stats('receiveLag')?.count).toBe(3);
  });
});
