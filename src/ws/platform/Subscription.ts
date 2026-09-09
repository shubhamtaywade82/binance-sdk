import { EventEmitter } from 'node:events';
import type { WsStreamPayload } from '../../types/ws.types.js';
import type { SubscriptionState } from './types.js';

/**
 * A single market-data stream as a first-class consumer object.
 *
 * v2's WS surface was connection-centric: callers held a `FuturesMarketWS`
 * and juggled stream names against its EventEmitter. v3 inverts the
 * relationship — the caller holds a {@link Subscription} and the platform
 * decides which pooled connection carries it:
 *
 * ```ts
 * const sub = await client.ws.usdm.subscribe('btcusdt@aggTrade');
 * sub.on('message', (payload) => console.log(payload.p));
 * sub.on('state', (s) => console.log(s));   // pending → live → …
 * await sub.waitForReady();
 * sub.close();                              // refcounted; server sees UNSUBSCRIBE
 * ```
 *
 * Semantics:
 *  - `state` is `'pending'` while unconfirmed (including during reconnects),
 *    `'live'` when the server is currently delivering the stream, `'closed'`
 *    after `close()` (terminal).
 *  - Multiple subscriptions to the same stream each get their own object and
 *    full fan-out; the server-level subscription is refcounted — the last
 *    `close()` triggers the protocol UNSUBSCRIBE.
 *  - Reconnects are transparent: state cycles pending → live while the
 *    platform repairs the connection and re-confirms the stream.
 */
export class Subscription extends EventEmitter {
  /** Stream name, e.g. `btcusdt@aggTrade`. */
  readonly stream: string;
  /** Pool-assigned connection label carrying this stream. */
  readonly connection: string;

  private stateValue: SubscriptionState = 'pending';
  private closed = false;
  private readonly onClose?: () => void;

  constructor(stream: string, connection: string, onClose?: () => void) {
    super();
    this.stream = stream;
    this.connection = connection;
    this.onClose = onClose;
    this.setMaxListeners(0);
  }

  /** Current consumer-visible state. */
  get state(): SubscriptionState {
    return this.stateValue;
  }

  /** True while the server is delivering this stream on the live connection. */
  get isLive(): boolean {
    return this.stateValue === 'live';
  }

  /**
   * Resolve when the stream goes live (first confirmation or post-reconnect
   * repair). Rejects on timeout or terminal close. Safe to call repeatedly.
   */
  waitForReady(timeoutMs = 30_000): Promise<void> {
    if (this.stateValue === 'live') return Promise.resolve();
    if (this.closed) return Promise.reject(new Error(`subscription ${this.stream} is closed`));
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`subscription ${this.stream} not live within ${timeoutMs}ms (state=${this.stateValue})`));
      }, timeoutMs);
      const onState = (to: SubscriptionState): void => {
        if (to === 'live') {
          cleanup();
          resolve();
        } else if (to === 'closed') {
          cleanup();
          reject(new Error(`subscription ${this.stream} closed before live`));
        }
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        this.off('state', onState);
      };
      this.on('state', onState);
    });
  }

  /** Internal: platform confirmed the stream on the current connection. */
  /** @internal */
  markLive(): void {
    if (this.closed) return;
    if (this.stateValue !== 'live') {
      this.stateValue = 'live';
      this.emit('state', 'live');
    }
  }

  /** Internal: connection dropped; awaiting repair. */
  /** @internal */
  markPending(reason: string): void {
    if (this.closed) return;
    if (this.stateValue !== 'pending') {
      this.stateValue = 'pending';
      this.emit('state', 'pending');
      this.emit('interrupted', reason);
    }
  }

  /** Internal: deliver one parsed payload (already losslessly parsed). */
  /** @internal */
  dispatch(payload: WsStreamPayload): void {
    if (this.closed) return;
    this.emit('message', payload);
  }

  /** Internal: deliver the lossless raw view of one frame. */
  /** @internal */
  dispatchRaw(raw: unknown): void {
    if (this.closed) return;
    this.emit('raw', raw);
  }

  /**
   * Close this subscription. Idempotent; refcounted — the server-level
   * UNSUBSCRIBE fires only when the last subscriber for the stream closes.
   * Closing detaches the subscription from its registry (release hook).
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stateValue = 'closed';
    this.emit('state', 'closed');
    this.emit('close');
    this.onClose?.();
    this.removeAllListeners();
  }
}
