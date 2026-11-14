import { describe, expect, it, vi } from 'vitest';
import { subscribeUserDataStream, unsubscribeUserDataStream } from '../../../src/ws/platform/userDataSubscription.js';
import { SubscribeThrottle } from '../../../src/ws/platform/SubscribeThrottle.js';

describe('userDataStream subscription over the authenticated WS API session', () => {
  it('subscribes unsigned and returns the subscriptionId', async () => {
    const request = vi.fn(async () => ({ id: '1', status: 200, result: { subscriptionId: 7 } }));
    await expect(subscribeUserDataStream({ request })).resolves.toBe(7);
    expect(request).toHaveBeenCalledWith('userDataStream.subscribe', {}, { signed: false });
  });

  it('passes an optional filter through', async () => {
    const request = vi.fn(async () => ({ id: '1', status: 200, result: { subscriptionId: 1 } }));
    await subscribeUserDataStream({ request }, { filter: { events: ['executionReport'] } });
    expect(request).toHaveBeenCalledWith('userDataStream.subscribe', { filter: { events: ['executionReport'] } }, { signed: false });
  });

  it('fails when the reply carries no subscriptionId', async () => {
    const request = vi.fn(async () => ({ id: '1', status: 200, result: {} }));
    await expect(subscribeUserDataStream({ request })).rejects.toThrow(/no subscriptionId/);
  });

  it('unsubscribes one id, or all when none is given', async () => {
    const request = vi.fn(async () => ({ id: '1', status: 200, result: {} }));
    await unsubscribeUserDataStream({ request }, 7);
    await unsubscribeUserDataStream({ request });
    expect(request.mock.calls[0]).toEqual(['userDataStream.unsubscribe', { subscriptionId: 7 }, { signed: false }]);
    expect(request.mock.calls[1]).toEqual(['userDataStream.unsubscribe', {}, { signed: false }]);
  });
});

describe('SubscribeThrottle', () => {
  it('coalesces requests within a window into one SUBSCRIBE frame', () => {
    const t = new SubscribeThrottle();
    t.request('SUBSCRIBE', ['a@trade', 'b@trade']);
    t.request('SUBSCRIBE', ['c@trade']);
    expect(t.drain(0)).toEqual([{ method: 'SUBSCRIBE', params: ['a@trade', 'b@trade', 'c@trade'] }]);
    expect(t.pending()).toEqual({ subscribe: 0, unsubscribe: 0 });
  });

  it('cancels a subscribe that is unsubscribed before it is sent', () => {
    const t = new SubscribeThrottle();
    t.request('SUBSCRIBE', ['a@trade']);
    t.request('UNSUBSCRIBE', ['a@trade']);
    expect(t.drain(0)).toEqual([]);
  });

  it('holds the frame rate to the budget and reports when the next frame fits', () => {
    const t = new SubscribeThrottle({ maxMessagesPerSecond: 2 });
    t.request('SUBSCRIBE', ['a@trade']);
    t.request('UNSUBSCRIBE', ['b@trade']);
    expect(t.drain(0)).toHaveLength(2);
    t.request('SUBSCRIBE', ['c@trade']);
    expect(t.drain(0)).toEqual([]);
    expect(t.nextAvailableInMs(0)).toBe(1000);
    expect(t.drain(1000)).toEqual([{ method: 'SUBSCRIBE', params: ['c@trade'] }]);
  });

  it('defaults to 4 frames per second and rejects a non-positive budget', () => {
    const t = new SubscribeThrottle();
    for (let i = 0; i < 4; i++) {
      t.request('SUBSCRIBE', [`s${i}@trade`]);
      expect(t.drain(0)).toHaveLength(1);
    }
    t.request('SUBSCRIBE', ['extra@trade']);
    expect(t.drain(0)).toEqual([]);
    expect(() => new SubscribeThrottle({ maxMessagesPerSecond: 0 })).toThrow(RangeError);
  });
});
