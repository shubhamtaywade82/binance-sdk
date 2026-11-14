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

  /** Streams still waiting to be sent for one method. */
  pendingStreams(method: SubscribeMethod): ReadonlySet<string> {
    return method === 'SUBSCRIBE' ? this.pendingSubscribe : this.pendingUnsubscribe;
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

export interface ThrottledControlOptions extends SubscribeThrottleOptions {
  /** Clock injection. Default: Date.now. */
  now?: () => number;
  /** Sleep injection. Default: setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

interface ControlWaiter {
  method: SubscribeMethod;
  streams: Set<string>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * Sends SUBSCRIBE / UNSUBSCRIBE through a SubscribeThrottle. Each caller's promise settles
 * when its own streams go out (or fail), or when a later request cancels them before they
 * are sent. Several callers in one window share one frame.
 */
export class ThrottledControl {
  private readonly throttle: SubscribeThrottle;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private waiters: ControlWaiter[] = [];
  private pumping = false;

  constructor(
    private readonly send: (frame: SubscribeFrame) => Promise<unknown>,
    options: ThrottledControlOptions = {},
  ) {
    this.throttle = new SubscribeThrottle(options);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  request(method: SubscribeMethod, streams: readonly string[]): Promise<void> {
    if (streams.length === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ method, streams: new Set(streams), resolve, reject });
      this.throttle.request(method, streams);
      this.dropSettledStreams();
      void this.pump();
    });
  }

  /** A waiter keeps only the streams still pending for its method. Cancelled or sent streams drop out. */
  private dropSettledStreams(): void {
    for (const waiter of this.waiters) {
      const pending = this.throttle.pendingStreams(waiter.method);
      for (const stream of [...waiter.streams]) if (!pending.has(stream)) waiter.streams.delete(stream);
    }
    this.settle();
  }

  private settle(): void {
    const remaining: ControlWaiter[] = [];
    for (const waiter of this.waiters) {
      if (waiter.streams.size === 0) waiter.resolve();
      else remaining.push(waiter);
    }
    this.waiters = remaining;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.waiters.length > 0) {
        const at = this.now();
        const frames = this.throttle.drain(at);
        for (const frame of frames) {
          const sent = new Set(frame.params);
          try {
            await this.send(frame);
            this.complete(frame.method, sent, undefined);
          } catch (err) {
            this.complete(frame.method, sent, err);
          }
        }
        this.dropSettledStreams();
        if (this.waiters.length === 0) break;
        if (frames.length === 0) await this.sleep(Math.max(1, this.throttle.nextAvailableInMs(at)));
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Settle the waiters whose streams just went out (or failed). */
  private complete(method: SubscribeMethod, sent: Set<string>, err: unknown): void {
    for (const waiter of this.waiters) {
      if (waiter.method !== method) continue;
      const hit = [...waiter.streams].some((stream) => sent.has(stream));
      if (!hit) continue;
      if (err !== undefined) {
        waiter.reject(err);
        waiter.streams.clear();
      } else {
        for (const stream of [...waiter.streams]) if (sent.has(stream)) waiter.streams.delete(stream);
      }
    }
    this.settle();
  }
}
