import { describe, expect, it, vi } from 'vitest';
import { ThrottledControl, type SubscribeFrame } from '../../../src/ws/platform/SubscribeThrottle.js';

function clock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

describe('ThrottledControl', () => {
  it('sends a caller\'s streams and resolves when they go out', async () => {
    const c = clock();
    const sent: SubscribeFrame[] = [];
    const control = new ThrottledControl(async (frame) => {
      sent.push(frame);
    }, c);
    await control.request('SUBSCRIBE', ['btcusdt@trade']);
    expect(sent).toEqual([{ method: 'SUBSCRIBE', params: ['btcusdt@trade'] }]);
  });

  it('holds the frame rate: the fifth frame in one second waits for the next window', async () => {
    const c = clock();
    const frames: Array<{ at: number; frame: SubscribeFrame }> = [];
    const control = new ThrottledControl(async (frame) => {
      frames.push({ at: c.now(), frame });
    }, c);
    for (let i = 0; i < 5; i++) {
      await Promise.all([control.request('SUBSCRIBE', [`s${i}@trade`])]);
    }
    expect(frames).toHaveLength(5);
    expect(frames[4]?.at).toBeGreaterThanOrEqual(1000);
    expect(frames.slice(0, 4).every((f) => f.at === 0)).toBe(true);
  });

  it('cancels a subscribe that is unsubscribed while it is still queued, without a frame', async () => {
    const c = clock();
    const sent: SubscribeFrame[] = [];
    const control = new ThrottledControl(async (frame) => {
      sent.push(frame);
    }, c);
    // Exhaust the one-second budget so the next subscribe has to wait.
    for (let i = 0; i < 4; i++) await control.request('SUBSCRIBE', [`x${i}@trade`]);
    const subscribe = control.request('SUBSCRIBE', ['a@trade']);
    const unsubscribe = control.request('UNSUBSCRIBE', ['a@trade']);
    await Promise.all([subscribe, unsubscribe]);
    expect(sent.some((f) => f.params.includes('a@trade'))).toBe(false);
    expect(sent).toHaveLength(4);
  });

  it('rejects the callers whose frame failed to send', async () => {
    const c = clock();
    const control = new ThrottledControl(async () => {
      throw new Error('socket closed');
    }, c);
    await expect(control.request('SUBSCRIBE', ['a@trade'])).rejects.toThrow('socket closed');
  });

  it('a no-op request resolves immediately', async () => {
    const control = new ThrottledControl(vi.fn(async () => undefined), clock());
    await expect(control.request('SUBSCRIBE', [])).resolves.toBeUndefined();
  });
});
