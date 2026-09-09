import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  RenewalController,
  type RenewableConnection,
} from '../../../src/ws/platform/RenewalController.js';
import { EventBus } from '../../../src/core/events.js';

/** Test double satisfying the renewal-facing connection surface. */
class StubRenewable extends EventEmitter implements RenewableConnection {
  state = 'IDLE';
  rotateResult = true;
  rotations = 0;
  rotationFailures = 0;

  getState(): string {
    return this.state;
  }

  rotateNow(): boolean {
    if (!this.rotateResult) return false;
    this.rotations += 1;
    return true;
  }

  emitOpen(): void {
    this.state = 'OPEN';
    this.emit('state', 'OPEN', 'CONNECTING');
  }

  completeRotation(): void {
    this.emit('rotated');
  }

  failReplacement(): void {
    this.rotationFailures += 1;
    this.emit('rotationFailed', { code: 1006, reason: 'replacement refused' });
  }
}

function fakeTimers(): {
  timers: { fn: () => void; ms: number }[];
  setTimeout: (fn: () => void, ms: number) => { unref?: () => void };
  fireAll(): void;
  fireAt(index: number): void;
} {
  const timers: { fn: () => void; ms: number }[] = [];
  return {
    timers,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return {};
    },
    fireAll() {
      for (const timer of [...timers]) timer.fn();
      timers.length = 0;
    },
    fireAt(index: number) {
      const timer = timers.splice(index, 1)[0];
      timer?.fn();
    },
  };
}

describe('RenewalController (staggered 24h-safe renewal)', () => {
  it('anchors the renewal window on OPEN and fires rotateNow at rotationMs', () => {
    const { timers, fireAt } = fakeTimers();
    const controller = new RenewalController({
      rotationMs: 1000,
      jitterMs: 0,
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    const conn = new StubRenewable();
    controller.track('a', conn);
    expect(controller.nextRenewalAt('a')).toBeNull(); // not OPEN yet — no window burned

    conn.emitOpen();
    const before = Date.now();
    const scheduledAt = controller.nextRenewalAt('a');
    expect(scheduledAt).toBeGreaterThanOrEqual(before + 1000);
    expect(scheduledAt).toBeLessThanOrEqual(Date.now() + 1000);

    fireAt(0); // rotation window elapses
    expect(conn.rotations).toBe(1);
    expect(controller.isRenewing('a')).toBe(true);

    conn.completeRotation(); // zero-gap swap done
    expect(controller.isRenewing('a')).toBe(false);
    const rescheduledAt = controller.nextRenewalAt('a');
    expect(rescheduledAt).toBeGreaterThanOrEqual(Date.now() + 1000 - 2);
    expect(rescheduledAt).toBeLessThanOrEqual(Date.now() + 1000 + 2);
  });

  it('applies uniform jitter so pooled connections decorrelate', () => {
    const { timers } = fakeTimers();
    const controller = new RenewalController({
      rotationMs: 1000,
      jitterMs: 500,
      random: () => 0.8, // 400ms jitter
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    const a = new StubRenewable();
    const b = new StubRenewable();
    controller.track('a', a);
    controller.track('b', b);
    a.emitOpen();
    b.emitOpen();
    expect(controller.nextRenewalAt('a')).toBeGreaterThan(Date.now() + 1300);
    expect(controller.nextRenewalAt('a')).toBeLessThan(Date.now() + 1500);
    expect(timers[0].ms).toBe(1400);
    expect(timers[1].ms).toBe(1400);
  });

  it('postpones renewals beyond the concurrency cap and retries later', () => {
    const { timers, fireAt } = fakeTimers();
    const controller = new RenewalController({
      rotationMs: 100,
      jitterMs: 0,
      maxConcurrent: 1,
      retryMs: 50,
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    const a = new StubRenewable();
    const b = new StubRenewable();
    controller.track('a', a);
    controller.track('b', b);
    a.emitOpen();
    b.emitOpen();

    fireAt(0); // a renews (in flight, cap reached)
    expect(a.rotations).toBe(1);

    fireAt(0); // b's window fires → postponed (a in flight), retry scheduled
    expect(b.rotations).toBe(0);
    const retry = timers[timers.length - 1];
    expect(retry.ms).toBe(50);

    a.completeRotation(); // a's swap completes, slot frees
    retry.fn(); // b retries
    expect(b.rotations).toBe(1);
  });

  it('retries after rotationFailed and keeps the connection supervised', () => {
    const { timers, fireAt } = fakeTimers();
    const controller = new RenewalController({
      rotationMs: 100,
      jitterMs: 0,
      retryMs: 20,
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    const conn = new StubRenewable();
    controller.track('a', conn);
    conn.emitOpen();
    fireAt(0);
    expect(conn.rotations).toBe(1);

    conn.failReplacement(); // replacement socket died; old one still carries traffic
    expect(controller.isRenewing('a')).toBe(false);
    const retryAt = controller.nextRenewalAt('a');
    expect(retryAt).toBeGreaterThan(Date.now() + 15);
    expect(retryAt).toBeLessThan(Date.now() + 25);

    const retry = timers[timers.length - 1];
    retry.fn();
    expect(conn.rotations).toBe(2);
  });

  it('does not renew connections that are not OPEN at the deadline', () => {
    const { timers, fireAt } = fakeTimers();
    const controller = new RenewalController({
      rotationMs: 100,
      jitterMs: 0,
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    const conn = new StubRenewable();
    controller.track('a', conn);
    conn.emitOpen();
    conn.state = 'RECONNECTING'; // dropped before the deadline
    fireAt(0);
    expect(conn.rotations).toBe(0);
    expect(controller.nextRenewalAt('a')).toBeNull();
    // repair → OPEN → a fresh window is scheduled
    conn.emitOpen();
    const freshAt = controller.nextRenewalAt('a');
    expect(freshAt).toBeGreaterThan(Date.now() + 90);
    expect(freshAt).toBeLessThan(Date.now() + 110);
  });

  it('untrack stops supervision; close stops everything', () => {
    const { timers } = fakeTimers();
    const controller = new RenewalController({
      rotationMs: 100,
      jitterMs: 0,
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    const conn = new StubRenewable();
    controller.track('a', conn);
    conn.emitOpen();
    controller.untrack('a');
    expect(controller.size()).toBe(0);
    expect(controller.nextRenewalAt('a')).toBeNull();

    controller.track('b', conn);
    conn.emitOpen();
    controller.close();
    expect(controller.size()).toBe(0);
    expect(conn.listenerCount('state')).toBe(0);
    expect(conn.listenerCount('rotated')).toBe(0);
  });

  it('rotateNow() refusal (already rotating) reschedules instead of wedging', () => {
    const { timers, fireAt } = fakeTimers();
    const controller = new RenewalController({
      rotationMs: 100,
      jitterMs: 0,
      setTimeout: (fn, ms) => {
        timers.push({ fn, ms });
        return {};
      },
    });
    const conn = new StubRenewable();
    conn.rotateResult = false; // e.g. an internal rotation is already in flight
    controller.track('a', conn);
    conn.emitOpen();
    fireAt(0);
    expect(conn.rotations).toBe(0);
    // refused → the window is rescheduled, not abandoned
    const rescheduledAt = controller.nextRenewalAt('a');
    expect(rescheduledAt).toBeGreaterThan(Date.now() + 90);
    expect(rescheduledAt).toBeLessThan(Date.now() + 110);
  });
});
