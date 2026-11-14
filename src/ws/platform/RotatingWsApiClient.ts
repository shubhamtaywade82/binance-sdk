import { EventEmitter } from 'node:events';
import type { WsApiResponse } from '../../types/userdata.types.js';
import { WsApiClient, type WsApiClientOptions, type WsRequestOptions } from './WsApiClient.js';

/**
 * Zero-downtime rotation over {@link WsApiClient}.
 *
 * Verified: a WS API connection lives 24 hours. The server sends `serverShutdown`
 * (with the upcoming shutdown time `T`) and asks clients to open a new connection
 * as soon as possible. `eventStreamTerminated` is a lifecycle event that requires
 * resubscription; its payload shape is not documented, so only its name is used.
 *
 * Rotation: a new connection is created and takes all new requests at once. The old
 * connection stays open until its pending requests drain, or until `drainTimeoutMs`
 * passes. Its remaining requests then fail with the transport's classified errors.
 * Nothing is replayed onto the new connection, because a replay could double-place
 * an order.
 */

export const WS_API_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Rotate one hour before the verified 24-hour lifetime. */
export const DEFAULT_ROTATE_AFTER_MS = WS_API_LIFETIME_MS - 60 * 60 * 1000;

export type RotationReason = 'serverShutdown' | 'lifetime' | 'manual';

export interface RotatingTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface RotatingWsApiOptions {
  /** Options for every underlying connection. `baseUrl` may be overridden per connection. */
  client: WsApiClientOptions;
  /** `false` appends `returnRateLimits=false` to the URL (verified connection-level switch). */
  returnRateLimits?: boolean;
  /** Rotate this long after a connection opens. Default: 23 hours. */
  rotateAfterMs?: number;
  /** Maximum time the old connection may drain. Default: 60 seconds. */
  drainTimeoutMs?: number;
  /** Poll interval for the drain check. Default: 250 ms. */
  drainPollMs?: number;
  /**
   * Re-establish user-data subscriptions on a new connection, or after
   * `eventStreamTerminated`. Runs on the connection that is now active.
   */
  resubscribe?: (client: WsApiClient) => Promise<unknown>;
  /** Connection factory. Default: `new WsApiClient(options)`. */
  createClient?: (options: WsApiClientOptions) => WsApiClient;
  timers?: RotatingTimers;
}

/** Append `returnRateLimits=false` to a URL. Other URLs pass through unchanged. */
export function withReturnRateLimits(url: string, returnRateLimits: boolean | undefined): string {
  if (returnRateLimits !== false) return url;
  return `${url}${url.includes('?') ? '&' : '?'}returnRateLimits=false`;
}

const defaultTimers: RotatingTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export class RotatingWsApiClient extends EventEmitter {
  private active: WsApiClient;
  private readonly draining = new Map<WsApiClient, unknown>();
  private rotationTimer: unknown;
  private closed = false;
  private readonly timers: RotatingTimers;

  constructor(private readonly options: RotatingWsApiOptions) {
    super();
    this.timers = options.timers ?? defaultTimers;
    this.active = this.spawn();
    this.armRotation();
  }

  get current(): WsApiClient {
    return this.active;
  }

  get drainingCount(): number {
    return this.draining.size;
  }

  request(
    method: string,
    params: Record<string, unknown> = {},
    options: WsRequestOptions = {},
  ): Promise<WsApiResponse> {
    if (this.closed) return Promise.reject(new Error('RotatingWsApiClient is closed'));
    return this.active.request(method, params, options);
  }

  /**
   * Switch new requests to a fresh connection. The old connection drains and then
   * closes. Safe to call repeatedly: a call during an in-progress rotation simply
   * rotates again.
   */
  rotate(reason: RotationReason): WsApiClient {
    if (this.closed) throw new Error('RotatingWsApiClient is closed');
    const previous = this.active;
    this.active = this.spawn();
    this.emit('rotated', { reason });
    this.armRotation();
    this.drain(previous);
    this.resubscribeActive();
    return this.active;
  }

  close(): void {
    this.closed = true;
    if (this.rotationTimer !== undefined) this.timers.clearTimeout(this.rotationTimer);
    this.rotationTimer = undefined;
    this.active.close();
    for (const [client, handle] of this.draining) {
      this.timers.clearInterval(handle);
      client.close();
    }
    this.draining.clear();
  }

  private spawn(): WsApiClient {
    const url = withReturnRateLimits(this.options.client.baseUrl, this.options.returnRateLimits);
    const create = this.options.createClient ?? ((opts: WsApiClientOptions) => new WsApiClient(opts));
    const client = create({ ...this.options.client, baseUrl: url });
    client.on('serverShutdown', () => {
      if (client === this.active && !this.closed) this.rotate('serverShutdown');
    });
    client.on('eventStreamTerminated', () => {
      if (client === this.active && !this.closed) this.resubscribeActive();
    });
    return client;
  }

  private armRotation(): void {
    if (this.rotationTimer !== undefined) this.timers.clearTimeout(this.rotationTimer);
    const after = this.options.rotateAfterMs ?? DEFAULT_ROTATE_AFTER_MS;
    this.rotationTimer = this.timers.setTimeout(() => {
      if (!this.closed) this.rotate('lifetime');
    }, after);
  }

  private drain(old: WsApiClient): void {
    const started = Date.now();
    const limit = this.options.drainTimeoutMs ?? 60_000;
    const poll = this.options.drainPollMs ?? 250;
    const handle = this.timers.setInterval(() => {
      const timedOut = Date.now() - started >= limit;
      if (old.pendingCount() > 0 && !timedOut) return;
      this.timers.clearInterval(handle);
      this.draining.delete(old);
      old.close();
    }, poll);
    this.draining.set(old, handle);
  }

  private resubscribeActive(): void {
    const hook = this.options.resubscribe;
    if (!hook) return;
    hook(this.active).catch((error: unknown) => this.emit('resubscribeError', error));
  }
}
