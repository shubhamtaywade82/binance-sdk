import { describe, expect, it, vi } from 'vitest';
import { IsolatedMarginSupervisor, MarginCallSentinel } from '../../src/risk/marginSafety.js';
import type { UserDataMarginCall } from '../../src/types/userdata.types.js';

const call: UserDataMarginCall = {
  e: 'MARGIN_CALL',
  E: 1,
  cw: '100',
  p: [{ s: 'BTCUSDT', ps: 'LONG', pa: '1', mt: 'isolated', iw: '5', mp: '60000', up: '-1', mm: '2' }],
};

describe('IsolatedMarginSupervisor', () => {
  it('posts add (type 1) and reduce (type 2) to the verified endpoint', async () => {
    const post = vi.fn(async () => ({ amount: '5', code: 200 }));
    const supervisor = new IsolatedMarginSupervisor(post);
    await supervisor.add({ symbol: 'BTCUSDT', amount: '5.5', positionSide: 'LONG' });
    await supervisor.reduce({ symbol: 'BTCUSDT', amount: 2 });
    expect(post.mock.calls[0]).toEqual([
      '/fapi/v1/positionMargin',
      { symbol: 'BTCUSDT', amount: '5.5', type: 1, positionSide: 'LONG' },
    ]);
    expect(post.mock.calls[1]).toEqual(['/fapi/v1/positionMargin', { symbol: 'BTCUSDT', amount: '2', type: 2 }]);
  });

  it('rejects a non-positive or malformed amount before posting', () => {
    const post = vi.fn(async () => ({}));
    const supervisor = new IsolatedMarginSupervisor(post);
    expect(() => supervisor.add({ symbol: 'BTCUSDT', amount: '0' })).toThrow(RangeError);
    expect(() => supervisor.add({ symbol: 'BTCUSDT', amount: '-1' })).toThrow(RangeError);
    expect(() => supervisor.add({ symbol: 'BTCUSDT', amount: 'abc' })).toThrow(RangeError);
    expect(() => supervisor.add({ symbol: ' ', amount: '1' })).toThrow(RangeError);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('MarginCallSentinel', () => {
  it('runs the hook on the first margin call and suppresses repeats inside the cooldown', async () => {
    let clock = 0;
    const onMarginCall = vi.fn(async () => undefined);
    const sentinel = new MarginCallSentinel({ onMarginCall, cooldownMs: 1000, now: () => clock });
    expect(await sentinel.handle(call)).toBe('TRIGGERED');
    clock = 500;
    expect(await sentinel.handle(call)).toBe('COOLDOWN');
    clock = 1000;
    expect(await sentinel.handle(call)).toBe('TRIGGERED');
    expect(onMarginCall).toHaveBeenCalledTimes(2);
  });

  it('propagates a failing hook to the caller rather than swallowing it', async () => {
    const sentinel = new MarginCallSentinel({
      onMarginCall: async () => {
        throw new Error('cancel failed');
      },
      now: () => 0,
    });
    await expect(sentinel.handle(call)).rejects.toThrow('cancel failed');
  });
});
