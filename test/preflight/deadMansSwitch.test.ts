import { describe, expect, it, vi } from 'vitest';
import {
  DeadMansSwitch,
  DeadMansSwitchError,
  type DeadMansSwitchSignalSource,
  type DeadMansSwitchTimers,
} from '../../src/preflight/index.js';

function fakeTimers(): DeadMansSwitchTimers & { tick: () => void; cleared: unknown[]; intervalMs: number[] } {
  let callback: (() => void) | undefined;
  const cleared: unknown[] = [];
  const intervalMs: number[] = [];
  return {
    setInterval: (cb: () => void, ms: number) => {
      callback = cb;
      intervalMs.push(ms);
      return 'handle-1';
    },
    clearInterval: (handle: unknown) => {
      cleared.push(handle);
    },
    tick: () => callback?.(),
    cleared,
    intervalMs,
  };
}

function fakeSignals(): DeadMansSwitchSignalSource & { fire: (signal: NodeJS.Signals) => void; listeners: Map<string, () => void> } {
  const listeners = new Map<string, () => void>();
  return {
    on: (event: NodeJS.Signals, listener: () => void) => {
      listeners.set(event, listener);
    },
    off: (event: NodeJS.Signals) => {
      listeners.delete(event);
    },
    fire: (signal) => listeners.get(signal)?.(),
    listeners,
  };
}

describe('DeadMansSwitch', () => {
  it('rejects invalid configuration', () => {
    const send = async () => undefined;
    expect(() => new DeadMansSwitch({ symbols: [], countdownMs: 3000, send })).toThrow(RangeError);
    expect(() => new DeadMansSwitch({ symbols: ['BTCUSDT'], countdownMs: 0, send })).toThrow(RangeError);
    expect(() => new DeadMansSwitch({ symbols: ['BTCUSDT'], countdownMs: 3000, heartbeatMs: 3000, send })).toThrow(RangeError);
  });

  it('arms by heartbeating every symbol, then runs the periodic timer at heartbeatMs', async () => {
    const send = vi.fn(async () => ({}));
    const timers = fakeTimers();
    const dms = new DeadMansSwitch({ symbols: ['BTCUSDT', 'ETHUSDT'], countdownMs: 30_000, send, timers });

    await dms.arm();

    expect(send).toHaveBeenCalledWith('BTCUSDT', 30_000);
    expect(send).toHaveBeenCalledWith('ETHUSDT', 30_000);
    expect(timers.intervalMs).toEqual([10_000]);
    expect(dms.currentState).toBe('ARMED');
  });

  it('stays DISARMED and throws when the first heartbeat fails, so trading never starts blind', async () => {
    const send = vi.fn(async (symbol: string) => {
      if (symbol === 'ETHUSDT') throw new Error('network down');
      return {};
    });
    const timers = fakeTimers();
    const dms = new DeadMansSwitch({ symbols: ['BTCUSDT', 'ETHUSDT'], countdownMs: 30_000, send, timers });

    const error = await dms.arm().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DeadMansSwitchError);
    expect((error as DeadMansSwitchError).failures.map((f) => f.symbol)).toEqual(['ETHUSDT']);
    expect(dms.currentState).toBe('DISARMED');
    expect(timers.intervalMs).toEqual([]);
  });

  it('keeps heartbeating through transient failures and reports them without throwing', async () => {
    let fail = false;
    const send = vi.fn(async () => {
      if (fail) throw new Error('blip');
      return {};
    });
    const onError = vi.fn();
    const timers = fakeTimers();
    const dms = new DeadMansSwitch({ symbols: ['BTCUSDT'], countdownMs: 30_000, send, timers, onError });
    await dms.arm();

    fail = true;
    timers.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'BTCUSDT');
    expect(dms.currentState).toBe('ARMED');
  });

  it('a throwing onError does not break the heartbeat loop', async () => {
    let fail = true;
    const send = vi.fn(async () => {
      if (fail) throw new Error('down');
      return {};
    });
    const timers = fakeTimers();
    const dms = new DeadMansSwitch({
      symbols: ['BTCUSDT'],
      countdownMs: 30_000,
      send,
      timers,
      onError: () => {
        throw new Error('reporter bug');
      },
    });
    fail = false;
    await dms.arm();
    fail = true;
    expect(() => timers.tick()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dms.currentState).toBe('ARMED');
  });

  it('a send that throws synchronously is reported as a failed heartbeat, never as a rejection', async () => {
    const onError = vi.fn();
    const send = vi.fn((): Promise<unknown> => {
      throw new Error('sync boom');
    });
    const dms = new DeadMansSwitch({ symbols: ['BTCUSDT'], countdownMs: 30_000, send, timers: fakeTimers(), onError });

    const results = await dms.heartbeat();

    expect(results).toEqual([expect.objectContaining({ symbol: 'BTCUSDT', ok: false })]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync boom' }), 'BTCUSDT');
  });

  it('stop() halts heartbeats without sending countdown 0, so the exchange still cancels orders', async () => {
    const send = vi.fn(async () => ({}));
    const timers = fakeTimers();
    const dms = new DeadMansSwitch({ symbols: ['BTCUSDT'], countdownMs: 30_000, send, timers });
    await dms.arm();
    send.mockClear();

    dms.stop();

    expect(timers.cleared).toEqual(['handle-1']);
    expect(send).not.toHaveBeenCalled();
    expect(dms.currentState).toBe('DISARMED');
  });

  it('disarm() stops heartbeats and sends countdown 0 explicitly', async () => {
    const send = vi.fn(async () => ({}));
    const timers = fakeTimers();
    const dms = new DeadMansSwitch({ symbols: ['BTCUSDT', 'ETHUSDT'], countdownMs: 30_000, send, timers });
    await dms.arm();
    send.mockClear();

    const results = await dms.disarm();

    expect(send).toHaveBeenCalledWith('BTCUSDT', 0);
    expect(send).toHaveBeenCalledWith('ETHUSDT', 0);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('on SIGTERM stops heartbeats, removes its listeners, and re-raises the signal', async () => {
    const signals = fakeSignals();
    const reraise = vi.fn();
    const timers = fakeTimers();
    const dms = new DeadMansSwitch({
      symbols: ['BTCUSDT'],
      countdownMs: 30_000,
      send: async () => ({}),
      timers,
      handleSignals: true,
      signalSource: signals,
      reraise,
    });
    await dms.arm();
    expect(signals.listeners.has('SIGTERM')).toBe(true);

    signals.fire('SIGTERM');

    expect(timers.cleared).toEqual(['handle-1']);
    expect(signals.listeners.size).toBe(0);
    expect(reraise).toHaveBeenCalledWith('SIGTERM');
    expect(dms.currentState).toBe('DISARMED');
  });

  it('does not attach signal handlers unless handleSignals is enabled', async () => {
    const signals = fakeSignals();
    const dms = new DeadMansSwitch({
      symbols: ['BTCUSDT'],
      countdownMs: 30_000,
      send: async () => ({}),
      timers: fakeTimers(),
      signalSource: signals,
    });
    await dms.arm();
    expect(signals.listeners.size).toBe(0);
  });
});
