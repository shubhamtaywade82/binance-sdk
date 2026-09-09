import type { EventBus } from '../../core/events.js';
import type { WsStreamPayload } from '../../types/ws.types.js';
import type { PooledConnection } from './ConnectionPool.js';
import { FamilyConnectionPool } from './ConnectionPool.js';
import { Subscription } from './Subscription.js';
import { WS_PLATFORM_DEFAULTS, type SubscribeOptions } from './types.js';

interface StreamMapping {
  conn: PooledConnection;
  subs: Set<Subscription>;
}

/**
 * Stream-level routing over one family's connection pool.
 *
 * Responsibilities:
 *
 *  - **Refcounting** — N `Subscription` objects for one stream name share a
 *    single server-level subscription; the last `close()` issues the protocol
 *    UNSUBSCRIBE.
 *  - **Fan-out** — one `message` listener per pooled connection dispatches
 *    frames to every live subscription for that stream (parsed payload plus
 *    lossless raw view).
 *  - **Reconnect transparency** — when a pooled connection drops, its
 *    subscriptions flip to `pending`; after the connection's own repair
 *    (reconnect or rotation, followed by its resynchronize pass) the registry
 *    re-marks every server-confirmed stream `live`.
 *
 * The registry never subscribes the same stream on two connections of the
 * same family — a stream maps to exactly one connection while it has
 * subscribers.
 */
export class FamilySubscriptionRegistry {
  private readonly pool: FamilyConnectionPool;
  private readonly events?: EventBus;
  private readonly confirmTimeoutMs: number;
  private readonly mappings = new Map<string, StreamMapping>();
  /** Connections whose dispatch listeners are attached (bounded by pool cap). */
  private readonly attached = new Set<PooledConnection>();

  constructor(options: {
    pool: FamilyConnectionPool;
    events?: EventBus;
    requestTimeoutMs?: number;
  }) {
    this.pool = options.pool;
    this.events = options.events;
    this.confirmTimeoutMs = options.requestTimeoutMs ?? WS_PLATFORM_DEFAULTS.requestTimeoutMs;
  }

  /**
   * Acquire a subscription for one stream, confirming it server-side. When
   * the stream already has subscribers this is a pure fan-out join (no I/O).
   *
   * Rejects when confirmation does not arrive within `confirmTimeoutMs`;
   * the subscription stays registered in that case — it flips to `live` via
   * the reconnect/repair path and remains reachable through
   * {@link FamilySubscriptionRegistry.getSubscription}.
   */
  acquire(stream: string, options: SubscribeOptions = {}): Promise<Subscription> {
    const promise = this.doAcquire(stream, options);
    // Fire-and-forget guard: callers that ignore the returned promise must
    // never produce an unhandled rejection (Node terminates on those). The
    // failure is already republished as `ws.subscribe.rejected`.
    void promise.catch(() => {
      /* handled via observability event */
    });
    return promise;
  }

  private async doAcquire(stream: string, options: SubscribeOptions): Promise<Subscription> {
    const existing = this.mappings.get(stream);
    if (existing) {
      const sub = new Subscription(stream, existing.conn.name, () => this.release(sub));
      existing.subs.add(sub);
      if (existing.conn.getConfirmedStreams().includes(stream)) sub.markLive();
      return sub;
    }

    const conn = this.pool.selectOrCreate([stream]);
    this.attach(conn);

    const mapping: StreamMapping = { conn, subs: new Set() };
    this.mappings.set(stream, mapping);
    const sub = new Subscription(stream, conn.name, () => this.release(sub));
    mapping.subs.add(sub);

    // The subscription is registered BEFORE the ack: frames that race the
    // confirmation are still dispatched, never dropped.
    const timeoutMs = options.confirmTimeoutMs ?? this.confirmTimeoutMs;
    try {
      await withTimeout(
        conn.subscribe([stream]),
        timeoutMs,
        `stream ${stream} not confirmed within ${timeoutMs}ms`,
      );
      sub.markLive();
    } catch (err) {
      // Keep the registration (desired state already recorded on the
      // connection; its repair path will confirm). Surface the failure.
      this.events?.emit('ws.subscribe.rejected', {
        stream,
        connection: conn.name,
        message: (err as Error).message,
      });
      throw err;
    }
    return sub;
  }

  /**
   * Release a subscription (refcount down). The last release for a stream
   * removes the mapping and issues the protocol UNSSUBSCRIBE (best-effort —
   * desired state is already dropped, so reconnects will not resurrect it).
   * Invoked automatically by {@link Subscription.close}.
   */
  release(subscription: Subscription): void {
    const mapping = this.mappings.get(subscription.stream);
    if (!mapping) return;
    mapping.subs.delete(subscription);
    if (mapping.subs.size > 0) return;

    this.mappings.delete(subscription.stream);
    const { conn } = mapping;
    const stream = subscription.stream;
    this.events?.emit('ws.subscription.released', { stream, connection: conn.name });
    // Desired state is the source of truth; UNSUBSCRIBE is best-effort.
    void conn.unsubscribe([stream]).catch((err: Error) => {
      this.events?.emit('ws.unsubscribe.rejected', {
        stream,
        connection: conn.name,
        message: err.message,
      });
    });
  }

  /** Active subscription object for a stream, if one is registered. */
  getSubscription(stream: string): Subscription | undefined {
    const mapping = this.mappings.get(stream);
    if (!mapping) return undefined;
    return [...mapping.subs][0];
  }

  /** Streams with at least one live subscription. */
  activeStreams(): string[] {
    return [...this.mappings.keys()];
  }

  /** Registry snapshot: streams per connection. */
  stats(): { streams: number; connections: number } {
    const connections = new Set<string>();
    for (const mapping of this.mappings.values()) connections.add(mapping.conn.name);
    return { streams: this.mappings.size, connections: connections.size };
  }

  /** Close every subscription (platform teardown). */
  closeAll(): void {
    for (const [stream, mapping] of [...this.mappings]) {
      for (const sub of [...mapping.subs]) {
        sub.close();
      }
      this.mappings.delete(stream);
    }
  }

  // -------------------------------------------------------------------------
  // Connection wiring
  // -------------------------------------------------------------------------

  private attach(conn: PooledConnection): void {
    if (this.attached.has(conn)) return;
    this.attached.add(conn);

    conn.on('message', (stream: string, payload: WsStreamPayload) => {
      const mapping = this.mappings.get(stream);
      if (!mapping || mapping.conn !== conn) return;
      for (const sub of mapping.subs) sub.dispatch(payload);
    });
    conn.on('raw', (stream: string, raw: unknown) => {
      const mapping = this.mappings.get(stream);
      if (!mapping || mapping.conn !== conn) return;
      for (const sub of mapping.subs) sub.dispatchRaw(raw);
    });
    conn.on('state', (to: string) => {
      if (to === 'RECONNECTING' || to === 'CONNECTING') {
        this.markConnectionPending(conn, to);
      }
    });
    const repair = (): void => {
      // BaseWS re-establishes desired subscriptions after open/rotation; its
      // resynchronize() returns the in-flight repair promise.
      void conn
        .resynchronize()
        .then(() => this.refreshConfirmed(conn))
        .catch(() => {
          /* repair is best-effort; state stays pending and retries on next open */
        });
    };
    conn.on('open', repair);
    conn.on('rotated', repair);
  }

  private markConnectionPending(conn: PooledConnection, reason: string): void {
    for (const mapping of this.mappings.values()) {
      if (mapping.conn !== conn) continue;
      for (const sub of mapping.subs) sub.markPending(reason);
    }
  }

  private refreshConfirmed(conn: PooledConnection): void {
    const confirmed = new Set(conn.getConfirmedStreams());
    for (const [stream, mapping] of this.mappings) {
      if (mapping.conn !== conn) continue;
      if (confirmed.has(stream)) {
        for (const sub of mapping.subs) sub.markLive();
      }
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
