/**
 * Outbound SUBSCRIBE / UNSUBSCRIBE control. Requests made within one window are coalesced
 * into at most one SUBSCRIBE frame and one UNSUBSCRIBE frame, and the frame rate is held
 * to `maxMessagesPerSecond`. A stream subscribed and then unsubscribed before it is sent is
 * cancelled, so it never reaches the wire.
 *
 * The 4 msg/s default is kept below the 5 msg/s limit in the maintainer digest. The limit
 * itself is not in the vendored spec. The class is pure: the caller supplies the clock and
 * the timing loop.
 */

export type SubscribeMethod = 'SUBSCRIBE' | 'UNSUBSCRIBE';

export interface SubscribeFrame {
  method: SubscribeMethod;
  params: string[];
}

export interface SubscribeThrottleOptions {
  /** Frame budget per rolling second. Default 4. */
  maxMessagesPerSecond?: number;
}

const WINDOW_MS = 1_000;

export class SubscribeThrottle {
  private readonly maxMessagesPerSecond: number;
  private readonly pendingSubscribe = new Set<string>();
  private readonly pendingUnsubscribe = new Set<string>();
  private readonly sentAt: number[] = [];

  constructor(options: SubscribeThrottleOptions = {}) {
    this.maxMessagesPerSecond = options.maxMessagesPerSecond ?? 4;
    if (!Number.isInteger(this.maxMessagesPerSecond) || this.maxMessagesPerSecond < 1) {
      throw new RangeError('maxMessagesPerSecond must be a positive integer');
    }
  }

  request(method: SubscribeMethod, streams: readonly string[]): void {
    const same = method === 'SUBSCRIBE' ? this.pendingSubscribe : this.pendingUnsubscribe;
    const opposite = method === 'SUBSCRIBE' ? this.pendingUnsubscribe : this.pendingSubscribe;
    for (const stream of streams) {
      if (opposite.has(stream)) {
        // Subscribe and unsubscribe cancel out before anything is sent.
        opposite.delete(stream);
      } else {
        same.add(stream);
      }
    }
  }

  pending(): { subscribe: number; unsubscribe: number } {
    return { subscribe: this.pendingSubscribe.size, unsubscribe: this.pendingUnsubscribe.size };
  }

  /** Frames to send at `nowMs`, within the budget. Each method coalesces into one frame. */
  drain(nowMs: number): SubscribeFrame[] {
    this.prune(nowMs);
    const frames: SubscribeFrame[] = [];
    for (const [method, pending] of [
      ['SUBSCRIBE', this.pendingSubscribe],
      ['UNSUBSCRIBE', this.pendingUnsubscribe],
    ] as const) {
      if (pending.size === 0 || this.sentAt.length >= this.maxMessagesPerSecond) continue;
      frames.push({ method, params: [...pending] });
      pending.clear();
      this.sentAt.push(nowMs);
    }
    return frames;
  }

  /** Milliseconds until another frame fits the budget. 0 means a frame can go now. */
  nextAvailableInMs(nowMs: number): number {
    this.prune(nowMs);
    if (this.sentAt.length < this.maxMessagesPerSecond) return 0;
    return Math.max(0, (this.sentAt[0] ?? nowMs) + WINDOW_MS - nowMs);
  }

  private prune(nowMs: number): void {
    while (this.sentAt.length > 0 && (this.sentAt[0] ?? 0) <= nowMs - WINDOW_MS) this.sentAt.shift();
  }
}
