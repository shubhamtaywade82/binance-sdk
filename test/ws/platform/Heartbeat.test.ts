import { describe, expect, it, vi } from 'vitest';
import { WsHeartbeat, type HeartbeatWatch } from '../../../src/ws/platform/Heartbeat.js';
import { EventBus } from '../../../src/core/events.js';

function stubConn(overrides: Partial<HeartbeatWatch> = {}) {
  return {
    name: 'stub',
    getState: () => 'OPEN',
    msSinceLastActivity: () => 0,
    reconnect: vi.fn<() => void>(),
    ...overrides,
  };
}

describe('WsHeartbeat (pool-level liveness)', () => {
  it('declares a connection stale after the silence threshold and forces a reconnect', () => {
    const conn = stubConn({ msSinceLastActivity: () => 15 * 60_000 }); // 15 min silent
    const events = new EventBus();
    const staleEvents: unknown[] = [];
    events.on('ws.heartbeat.stale', (event) => staleEvents.push(event.payload));

    const heartbeat = new WsHeartbeat({ staleMs: 10 * 60_000, events });
    heartbeat.watch('a', conn);

    const result = heartbeat.check();
    expect(result.stale).toEqual(['stub']);
    expect(conn.reconnect).toHaveBeenCalledTimes(1);
    expect(staleEvents).toHaveLength(1);
    expect((staleEvents[0] as { quietMs: number }).quietMs).toBe(15 * 60_000);
  });

  it('leaves active connections alone', () => {
    const conn = stubConn({ msSinceLastActivity: () => 30_000 });
    const heartbeat = new WsHeartbeat({ staleMs: 10 * 60_000 });
    heartbeat.watch('a', conn);
    expect(heartbeat.check().stale).toEqual([]);
    expect(conn.reconnect).not.toHaveBeenCalled();
  });

  it('ignores connections that are not OPEN (reconnecting already)', () => {
    const conn = stubConn({ getState: () => 'RECONNECTING', msSinceLastActivity: () => Number.POSITIVE_INFINITY });
    const heartbeat = new WsHeartbeat({ staleMs: 1_000 });
    heartbeat.watch('a', conn);
    expect(heartbeat.check().stale).toEqual([]);
    expect(conn.reconnect).not.toHaveBeenCalled();
  });

  it('never-opened connections (Infinity) are stale while OPEN', () => {
    const conn = stubConn({ msSinceLastActivity: () => Number.POSITIVE_INFINITY });
    const heartbeat = new WsHeartbeat({ staleMs: 1_000 });
    heartbeat.watch('a', conn);
    expect(heartbeat.check().stale).toEqual(['stub']);
    expect(conn.reconnect).toHaveBeenCalled();
  });

  it('unwatch removes supervision and stops the timer when idle', () => {
    const conn = stubConn({ msSinceLastActivity: () => Number.POSITIVE_INFINITY });
    const heartbeat = new WsHeartbeat({ staleMs: 1_000 });
    heartbeat.watch('a', conn);
    expect(heartbeat.size()).toBe(1);
    expect(heartbeat.isWatching('a')).toBe(true);
    heartbeat.unwatch('a');
    expect(heartbeat.size()).toBe(0);
    expect(heartbeat.isWatching('a')).toBe(false);
    expect(heartbeat.check().stale).toEqual([]);
  });

  it('uses one sampling interval derived from staleMs (half, clamped to 30s)', () => {
    const timers: { fn: () => void; ms: number }[] = [];
    const heartbeat = new WsHeartbeat({
      staleMs: 10 * 60_000,
      setInterval: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    heartbeat.watch('a', stubConn());
    heartbeat.watch('b', stubConn());
    heartbeat.watch('c', stubConn());
    // one timer for three connections, not three timers
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(30_000);
  });
});
