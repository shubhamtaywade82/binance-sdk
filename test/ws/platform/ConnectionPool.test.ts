import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FamilyConnectionPool } from '../../../src/ws/platform/ConnectionPool.js';
import { startMockWsServer, type MockWsServer } from './helpers.js';

describe('FamilyConnectionPool (capacity-aware pooling)', () => {
  let server: MockWsServer;

  beforeEach(async () => {
    server = await startMockWsServer();
  });

  afterEach(async () => {
    await server.close();
    vi.restoreAllMocks();
  });

  it('packs streams onto the least-loaded connection with capacity', () => {
    const pool = new FamilyConnectionPool({ family: 'usdm', baseStreamUrl: server.url });
    const first = pool.selectOrCreate(['a@trade']);
    expect(pool.size()).toBe(1);
    expect(first.name).toBe('usdmMarket[0]');

    // Second batch fits on the same connection (1 + 2 <= 200).
    const same = pool.selectOrCreate(['b@trade', 'c@trade']);
    expect(same).toBe(first);
    expect(pool.size()).toBe(1);
  });

  it('opens another connection when the current one is at the stream ceiling', () => {
    const pool = new FamilyConnectionPool({ family: 'usdm', baseStreamUrl: server.url });
    const first = pool.selectOrCreate(['a@trade']);
    // Pretend the first connection is full (usdm ceiling: 200 streams).
    vi.spyOn(first, 'getSubscribedStreams').mockReturnValue(
      Array.from({ length: 200 }, (_, i) => `s${i}@trade`),
    );
    const second = pool.selectOrCreate(['new@trade']);
    expect(second).not.toBe(first);
    expect(second.name).toBe('usdmMarket[1]');
    expect(pool.size()).toBe(2);
  });

  it('packs onto the least-loaded connection, not just the first', () => {
    const pool = new FamilyConnectionPool({ family: 'usdm', baseStreamUrl: server.url });
    const a = pool.selectOrCreate(['x@trade']);
    const b = pool.selectOrCreate(['y@trade']);
    vi.spyOn(a, 'getSubscribedStreams').mockReturnValue(
      Array.from({ length: 150 }, (_, i) => `a${i}@trade`),
    );
    vi.spyOn(b, 'getSubscribedStreams').mockReturnValue(
      Array.from({ length: 50 }, (_, i) => `b${i}@trade`),
    );
    // 51 more streams: a is at 150 (201 > 200 → no capacity), b is at 50 → b.
    expect(pool.selectOrCreate(Array.from({ length: 50 }, (_, i) => `c${i}@trade`))).toBe(b);
  });

  it('throws a descriptive error when the pool is exhausted', () => {
    const pool = new FamilyConnectionPool({ family: 'usdm', baseStreamUrl: server.url, maxConnections: 1 });
    const first = pool.selectOrCreate(['a@trade']);
    vi.spyOn(first, 'getSubscribedStreams').mockReturnValue(
      Array.from({ length: 200 }, (_, i) => `s${i}@trade`),
    );
    expect(() => pool.selectOrCreate(['new@trade'])).toThrow(/connection pool exhausted/i);
    expect(() => pool.selectOrCreate(['new@trade'])).toThrow(/maxConnections/);
  });

  it('notifies the platform exactly once per created connection', () => {
    const created: string[] = [];
    const pool = new FamilyConnectionPool({
      family: 'usdm',
      baseStreamUrl: server.url,
      onConnection: (name) => created.push(name),
    });
    pool.selectOrCreate(['a@trade']);
    pool.selectOrCreate(['b@trade']);
    expect(created).toEqual(['usdmMarket[0]']);

    vi.spyOn(pool.connections()[0], 'getSubscribedStreams').mockReturnValue(
      Array.from({ length: 200 }, (_, i) => `s${i}@trade`),
    );
    pool.selectOrCreate(['new@trade']);
    expect(created).toEqual(['usdmMarket[0]', 'usdmMarket[1]']);
  });

  it('stats() snapshots every connection structurally (no I/O)', () => {
    const pool = new FamilyConnectionPool({ family: 'spot', baseStreamUrl: server.url });
    pool.selectOrCreate(['a@trade']);
    const [stats] = pool.stats();
    expect(stats.name).toBe('spotMarket[0]');
    expect(stats.family).toBe('spot');
    expect(stats.state).toBe('IDLE'); // creation performs no I/O
    expect(stats.desiredStreams).toBe(0); // desired set fills on subscribe()
    expect(stats.nextRenewalAt).toBeNull(); // RenewalController owns this field
  });

  it('connections connect lazily on first subscribe (creation is offline)', async () => {
    const pool = new FamilyConnectionPool({ family: 'usdm', baseStreamUrl: server.url });
    const conn = pool.selectOrCreate(['btcusdt@aggTrade']);
    expect(server.sockets).toHaveLength(0); // no socket yet
    await conn.subscribe(['btcusdt@aggTrade']);
    expect(server.sockets).toHaveLength(1);
    expect(server.subscriptionsOf(server.sockets[0])).toContain('btcusdt@aggTrade');
  });

  it('closeAll() closes every pooled connection and clears the pool', async () => {
    const pool = new FamilyConnectionPool({ family: 'usdm', baseStreamUrl: server.url });
    const conn = pool.selectOrCreate(['a@trade']);
    await conn.subscribe(['a@trade']);
    pool.closeAll();
    expect(conn.getState()).toBe('CLOSED');
    expect(pool.size()).toBe(0);
    expect(pool.connections()).toHaveLength(0);
  });
});
