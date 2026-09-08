import type { EventBus } from '../core/events.js';
import { parseWsPayload, type WsStreamPayload } from '../types/ws.types.js';
import { WsConnection, type WsConnectionOptions, type WsConnectionState } from './WsConnection.js';

export { type WsConnectionState };

export interface BaseWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  baseStreamUrl: string;
  /** Initial stream names, applied on first connect. */
  streams?: string[];
}

interface CombinedStreamMessage {
  stream?: string;
  data?: unknown;
  result?: unknown;
  id?: number;
}

interface ConfirmationWaiter {
  streams: Set<string>;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Combined-stream market data websocket: the SDK's public market surface.
 *
 * Built on {@link WsConnection}, which supplies the lifecycle state machine,
 * race-free reconnection and proactive 24h-safe rotation. This class adds the
 * Binance live-subscription protocol on top:
 *
 *  - `subscribe()` returns a Promise that resolves only after the server has
 *    *acknowledged* the subscription (previously fire-and-forget, so strict
 *    callers could silently miss data).
 *  - After every (re)connect and rotation the live subscription set is
 *    verified with `LIST_SUBSCRIPTIONS` and repaired — reconnect storms no
 *    longer leave silently-dropped streams.
 *  - Every message is additionally re-emitted as `raw` (losslessly parsed with
 *    large-integer preservation), so unknown or new Binance stream types can be
 *    consumed without waiting for a typed schema.
 */
export class BaseWS extends WsConnection {
  private readonly baseStreamUrl: string;
  /** Desired subscription state — what the caller asked for. */
  private readonly desired = new Set<string>();
  /** Confirmed on the *current* connection; reset on every reconnect/rotation. */
  private readonly confirmed = new Set<string>();
  private resyncPromise: Promise<void> | null = null;
  private readonly confirmationWaiters: ConfirmationWaiter[] = [];

  constructor(options: BaseWSOptions) {
    const { baseStreamUrl, streams, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'market',
      buildUrl: () => this.buildStreamUrl(),
    });
    this.baseStreamUrl = baseStreamUrl;
    for (const stream of streams ?? []) this.desired.add(stream);

    // Re-establish subscriptions after every successful (re)connect/rotation.
    const reestablish = (): void => {
      this.confirmed.clear();
      void this.resynchronize();
    };
    this.on('open', reestablish);
    this.on('rotated', reestablish);
  }

  /**
   * Subscribe to streams. The returned promise resolves once the server has
   * acknowledged the streams on the current connection. When the connection is
   * down, the streams are queued as desired state and the promise resolves once
   * a connection opens and confirms them (use {@link waitForOpen} to await the
   * connection itself). Legacy callers that ignore the return value keep
   * working unchanged.
   */
  async subscribe(streams: string[]): Promise<void> {
    if (!streams.length) return;
    const wanted = streams.filter((stream) => !this.desired.has(stream));
    for (const stream of streams) this.desired.add(stream);

    if (this.getState() === 'IDLE' || this.getState() === 'CLOSED') {
      this.connect();
    }

    if (this.isOpen()) {
      const pending = wanted.filter((stream) => !this.confirmed.has(stream));
      if (pending.length) await this.sendSubscribe(pending);
      this.settleConfirmationWaiters();
      return;
    }

    // Connecting/reconnecting: resolve when the post-open resync confirms.
    await new Promise<void>((resolve, reject) => {
      const timeoutMs = this.wsOptions.requestTimeoutMs ?? 30_000;
      const waiter: ConfirmationWaiter = {
        streams: new Set(streams),
        resolve: () => {
          clearTimeout(timer);
          this.removeWaiter(waiter);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          this.removeWaiter(waiter);
          reject(err);
        },
        timer: null as unknown as NodeJS.Timeout,
      };
      const timer = setTimeout(() => {
        waiter.reject(
          new Error(`[${this.label}] subscribe not confirmed within ${timeoutMs}ms`),
        );
      }, timeoutMs);
      waiter.timer = timer;
      this.confirmationWaiters.push(waiter);
    });
  }

  /**
   * Unsubscribe from streams. Resolves once the server acks the removal when
   * connected; when not connected the streams are simply dropped from the
   * desired state, so they will not be re-established on the next reconnect.
   */
  async unsubscribe(streams: string[]): Promise<void> {
    if (!streams.length) return;
    for (const stream of streams) {
      this.desired.delete(stream);
      this.confirmed.delete(stream);
    }
    if (!this.isOpen()) return;
    try {
      await this.request('UNSUBSCRIBE', streams);
      this.emitEvent('ws.unsubscribed', { streams });
    } catch (err) {
      // Desired state is already updated (the source of truth for the next
      // resync); surface the ack failure to this caller only.
      this.emitEvent('ws.unsubscribe.rejected', { streams, message: (err as Error).message });
      throw err;
    }
  }

  /** Desired stream names (copy). */
  getSubscribedStreams(): string[] {
    return [...this.desired];
  }

  /** Streams the server confirmed on the current connection. */
  getConfirmedStreams(): string[] {
    return [...this.confirmed];
  }

  /** Ask the server which streams are actually active on this connection. */
  async listServerSubscriptions(): Promise<string[]> {
    const result = await this.request('LIST_SUBSCRIPTIONS');
    return Array.isArray(result) ? (result as string[]) : [];
  }

  /**
   * Bring the live connection's subscriptions in line with the desired set.
   * Runs automatically after every open/rotation; exposed for manual repair.
   */
  resynchronize(): Promise<void> {
    if (!this.isOpen()) return Promise.resolve();
    if (this.resyncPromise) return this.resyncPromise;

    this.resyncPromise = this.doResynchronize().finally(() => {
      this.resyncPromise = null;
    });
    return this.resyncPromise;
  }

  private async doResynchronize(): Promise<void> {
    let server: string[] = [];
    try {
      server = await this.listServerSubscriptions();
    } catch {
      // LIST_SUBSCRIPTIONS unavailable: fall back to blind SUBSCRIBE below.
    }
    const serverSet = new Set(server);
    const missing = [...this.desired].filter((stream) => !serverSet.has(stream));
    const extra = [...serverSet].filter((stream) => !this.desired.has(stream));

    if (missing.length) {
      try {
        await this.request('SUBSCRIBE', missing);
        this.emitEvent('ws.subscribed', { streams: missing, via: 'resync' });
      } catch {
        /* waiters time out; resync is best-effort */
      }
    }
    if (extra.length) {
      try {
        await this.request('UNSUBSCRIBE', extra);
        this.emitEvent('ws.unsubscribed', { streams: extra, via: 'resync' });
      } catch {
        /* best-effort */
      }
    }

    this.confirmed.clear();
    for (const stream of this.desired) {
      // Streams the server already had, plus anything we just (re)subscribed.
      if (serverSet.has(stream) || missing.includes(stream)) this.confirmed.add(stream);
    }
    this.settleConfirmationWaiters();
    this.emitEvent('ws.resynced', {
      desired: this.desired.size,
      server: server.length,
      repaired: missing.length,
      removed: extra.length,
    });
  }

  private async sendSubscribe(streams: string[]): Promise<void> {
    await this.request('SUBSCRIBE', streams);
    for (const stream of streams) this.confirmed.add(stream);
    this.emitEvent('ws.subscribed', { streams });
    this.settleConfirmationWaiters();
  }

  private settleConfirmationWaiters(): void {
    for (const waiter of [...this.confirmationWaiters]) {
      const satisfied = [...waiter.streams].every(
        (stream) => this.confirmed.has(stream) || !this.desired.has(stream),
      );
      if (satisfied) waiter.resolve();
    }
  }

  private removeWaiter(waiter: ConfirmationWaiter): void {
    const index = this.confirmationWaiters.indexOf(waiter);
    if (index >= 0) this.confirmationWaiters.splice(index, 1);
  }

  private buildStreamUrl(): string | null {
    if (!this.desired.size) {
      // Bare connection (no streams yet) — the server accepts this and control
      // requests still work; streams arrive via SUBSCRIBE.
      return this.baseStreamUrl;
    }
    return `${this.baseStreamUrl}?streams=${[...this.desired].join('/')}`;
  }

  protected override handleRawMessage(text: string): void {
    const parsed = this.parseFrame(text) as CombinedStreamMessage | undefined;
    if (parsed === undefined) return;

    if (this.dispatchAck(parsed)) return;

    if (typeof parsed.stream === 'string' && parsed.data !== undefined) {
      const stream = parsed.stream;
      const raw = parsed.data;
      // Lossless view of every message — including stream types the typed
      // parser does not yet know about.
      this.emit('raw', stream, raw);
      try {
        const payload: WsStreamPayload = parseWsPayload(stream, raw);
        this.emit('message', stream, payload);
        this.emit(stream, payload);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  /** Fail queued subscribers when the connection definitively goes down. */
  protected override onClosedByUser(): void {
    for (const waiter of [...this.confirmationWaiters]) {
      waiter.reject(new Error(`[${this.label}] connection closed before subscribe confirmed`));
    }
    this.confirmationWaiters.length = 0;
  }
}
