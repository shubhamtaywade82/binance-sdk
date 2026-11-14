import { describe, expect, it, vi } from 'vitest';
import { BinanceApiError } from '../../src/errors/BinanceApiError.js';
import { PreflightValidationError } from '../../src/errors/PreflightValidationError.js';
import {
  RECV_WINDOW_DEFAULT_MS,
  RECV_WINDOW_MAX_MS,
  ServerTimeSynchronizer,
  resolveRecvWindow,
  withTimestampRetry,
} from '../../src/client/ServerTimeSynchronizer.js';

function clock(start: number): { now: () => number; set: (ms: number) => void } {
  let current = start;
  return { now: () => current, set: (ms) => (current = ms) };
}

const timestampError = () =>
  new BinanceApiError('Timestamp for this request is outside of the recvWindow.', -1021, 400);

describe('ServerTimeSynchronizer', () => {
  it('computes the offset from the request/response midpoint', () => {
    const c = clock(1100);
    const s = new ServerTimeSynchronizer({ now: c.now });
    // sent 1000, received 1100 → midpoint 1050. Server says 1200 → offset 150.
    expect(s.addSample({ requestSentAtMs: 1000, serverTimeMs: 1200, responseReceivedAtMs: 1100 })).toEqual({
      rttMs: 100,
      offsetMs: 150,
    });
    expect(s.offsetMs).toBe(150);
    expect(s.serverTimeNow()).toBe(1100 + 150);
  });

  it('keeps the lowest-RTT sample, so a slow sample cannot overwrite a fast one', () => {
    const c = clock(10_000);
    const s = new ServerTimeSynchronizer({ now: c.now });
    s.addSample({ requestSentAtMs: 10_000, serverTimeMs: 10_050, responseReceivedAtMs: 10_100 }); // rtt 100, offset 0
    s.addSample({ requestSentAtMs: 10_000, serverTimeMs: 10_500, responseReceivedAtMs: 10_020 }); // rtt 20, offset 490
    expect(s.offsetMs).toBe(490);
    s.addSample({ requestSentAtMs: 10_000, serverTimeMs: 99_999, responseReceivedAtMs: 10_300 }); // rtt 300 → ignored
    expect(s.offsetMs).toBe(490);
  });

  it('rejects samples with a negative or over-limit round trip without changing the offset', () => {
    const c = clock(0);
    const s = new ServerTimeSynchronizer({ now: c.now, maxRttMs: 500 });
    expect(s.addSample({ requestSentAtMs: 100, serverTimeMs: 0, responseReceivedAtMs: 50 })).toBeNull();
    expect(s.addSample({ requestSentAtMs: 0, serverTimeMs: 0, responseReceivedAtMs: 900 })).toBeNull();
    expect(s.isSynced).toBe(false);
  });

  it('refuses to produce a timestamp before any sample is accepted', () => {
    const s = new ServerTimeSynchronizer({ now: () => 0 });
    expect(() => s.offsetMs).toThrow(PreflightValidationError);
    expect(() => s.serverTimeNow()).toThrow(PreflightValidationError);
  });

  it('treats a sync as stale after maxSampleAgeMs', () => {
    const c = clock(0);
    const s = new ServerTimeSynchronizer({ now: c.now, maxSampleAgeMs: 1000 });
    s.addSample({ requestSentAtMs: 0, serverTimeMs: 5, responseReceivedAtMs: 0 });
    expect(s.isSynced).toBe(true);
    c.set(1001);
    expect(s.isSynced).toBe(false);
  });
});

describe('resolveRecvWindow', () => {
  it('defaults to 5000 ms and accepts the 60000 ms cap', () => {
    expect(resolveRecvWindow(undefined)).toBe(RECV_WINDOW_DEFAULT_MS);
    expect(resolveRecvWindow(RECV_WINDOW_MAX_MS)).toBe(RECV_WINDOW_MAX_MS);
    expect(resolveRecvWindow(5000.5)).toBe(5000.5);
  });

  it('rejects zero, negative, non-finite, and above-cap values', () => {
    expect(() => resolveRecvWindow(0)).toThrow(PreflightValidationError);
    expect(() => resolveRecvWindow(-1)).toThrow(PreflightValidationError);
    expect(() => resolveRecvWindow(Number.NaN)).toThrow(PreflightValidationError);
    expect(() => resolveRecvWindow(RECV_WINDOW_MAX_MS + 1)).toThrow(PreflightValidationError);
  });
});

describe('withTimestampRetry', () => {
  const synced = { serverTimeNow: () => 1_700_000_000_123.9 };

  it('passes the floored server-aligned timestamp', async () => {
    const run = vi.fn(async (ts: number) => ts);
    const resync = vi.fn(async () => undefined);
    await expect(withTimestampRetry(run, resync, synced)).resolves.toBe(1_700_000_000_123);
    expect(resync).not.toHaveBeenCalled();
  });

  it('resyncs and retries exactly once on -1021, with a fresh timestamp', async () => {
    let calls = 0;
    const run = vi.fn(async (ts: number) => {
      calls += 1;
      if (calls === 1) throw timestampError();
      return ts;
    });
    const resync = vi.fn(async () => undefined);
    await withTimestampRetry(run, resync, { serverTimeNow: () => 42.5 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it('does not retry a second -1021 (no replay loop)', async () => {
    const run = vi.fn(async () => {
      throw timestampError();
    });
    const resync = vi.fn(async () => undefined);
    await expect(withTimestampRetry(run, resync, synced)).rejects.toBeInstanceOf(BinanceApiError);
    expect(run).toHaveBeenCalledTimes(2);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it('does not retry other errors', async () => {
    const run = vi.fn(async () => {
      throw new BinanceApiError('bad', -1102, 400);
    });
    const resync = vi.fn(async () => undefined);
    await expect(withTimestampRetry(run, resync, synced)).rejects.toThrow('bad');
    expect(run).toHaveBeenCalledTimes(1);
    expect(resync).not.toHaveBeenCalled();
  });
});
