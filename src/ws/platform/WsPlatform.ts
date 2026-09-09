import type WebSocket from 'ws';
import type { CoreContext } from '../../core/context.js';
import type { Credentials } from '../../core/credentials.js';
import type { EventBus } from '../../core/events.js';
import { FamilyConnectionPool } from './ConnectionPool.js';
import { WsHeartbeat } from './Heartbeat.js';
import { FuturesWsApiClient, SpotWsApiClient } from './ProductWsApi.js';
import { RenewalController } from './RenewalController.js';
import { exponentialBackoff } from './ReconnectPolicy.js';
import { FamilySubscriptionRegistry } from './SubscriptionRegistry.js';
import { Subscription } from './Subscription.js';
import {
  WS_FAMILY_LIMITS,
  WS_PLATFORM_DEFAULTS,
  type ReconnectPolicy,
  type SubscribeOptions,
  type WsConnectionStats,
  type WsFamily,
  type WsPlatformStats,
} from './types.js';

export interface WsPlatformOptions {
  /** Per-family connection caps (keys optional; unset uses family defaults). */
  maxConnections?: Partial<Record<WsFamily, number>>;
  /** Platform-wide reconnect backoff; default jittered exponential. */
  reconnectPolicy?: ReconnectPolicy;
  /** Silence threshold for liveness. Default 10 min. */
  staleMs?: number;
  /** Renewal window + jitter (defaults 23h ± 10 min). */
  rotationMs?: number;
  renewalJitterMs?: number;
  /** Max simultaneous renewals platform-wide. Default 1. */
  maxConcurrentRenewals?: number;
  /** Control-request/confirm timeout. Default 10s. */
  requestTimeoutMs?: number;
  /** Injectable WebSocket factory for tests. */
  socketFactory?: (url: string) => WebSocket;
  /** Injectable delay for WS API reconnect tests. */
  wsApiDelay?: (ms: number) => Promise<void>;
}

/** Per-family consumer surface: pooled subscriptions with objects. */
export interface WsFamilyStreams {
  /**
   * Subscribe to one stream. Returns a confirmed `Subscription` object —
   * see {@link Subscription} for the consumer API.
   */
  subscribe(stream: string, options?: SubscribeOptions): Promise<Subscription>;
  /**
   * Subscribe to a list of streams; accepts stream-name builders like
   * `client.ws.usdm.subscribe([futuresWs.aggTrade('BTCUSDT'), futuresWs.kline('BTCUSDT', '1m')])`.
   */
  subscribe(streams: string[], options?: SubscribeOptions): Promise<Subscription[]>;
  /** Active subscription object for a stream, if registered. */
  getSubscription(stream: string): Subscription | undefined;
  /** Streams with at least one live subscription. */
  activeStreams(): string[];
  /** Family pool snapshot. */
  stats(): { connections: WsConnectionStats[]; activeStreams: number };
}

/** The WS API surface: persistent multiplexed promise-oriented clients. */
export interface WsApiSurface {
  /** USDⓈ-M futures WS API (`ws-fapi/v1`). */
  usdm: FuturesWsApiClient;
  /** Spot WS API (`ws-api/v3`). */
  spot: SpotWsApiClient;
}

/**
 * v3 WebSocket platform — pools, subscriptions, liveness, renewal and the
 * persistent WS API in one closure-shared runtime.
 *
 * ```ts
 * const client = new BinanceClient({ apiKey, apiSecret });
 * const sub = await client.ws.usdm.subscribe('btcusdt@aggTrade');
 * sub.on('message', (payload) => …);
 *
 * const [fills] = await Promise.all([
 *   client.ws.api.usdm.accountStatus(),   // one persistent socket
 * ]);
 * client.ws.stats();   // per-connection pool snapshot
 * client.ws.close();   // everything
 * ```
 *
 * The platform is a *consumer* of the shared {@link CoreContext}: it reads
 * endpoints, credentials, events and transport tuning from it, and shares
 * the same observability stream as REST traffic (`ws.*` events).
 */
export class WsPlatform {
  readonly usdm: WsFamilyStreams;
  readonly spot: WsFamilyStreams;
  readonly coinm: WsFamilyStreams;
  readonly api: WsApiSurface;

  private readonly heartbeat: WsHeartbeat;
  private readonly renewal: RenewalController;
  private readonly pools = new Map<WsFamily, FamilyConnectionPool>();
  private readonly registries = new Map<WsFamily, FamilySubscriptionRegistry>();
  private readonly events: EventBus;

  constructor(options: {
    core: Pick<CoreContext, 'endpoints' | 'credentials' | 'events' | 'transport'>;
    platform?: WsPlatformOptions;
  }) {
    const { core } = options;
    const platform = options.platform ?? {};
    this.events = core.events;
    const reconnectPolicy = platform.reconnectPolicy ?? exponentialBackoff();
    const requestTimeoutMs = platform.requestTimeoutMs ?? WS_PLATFORM_DEFAULTS.requestTimeoutMs;

    this.heartbeat = new WsHeartbeat({
      staleMs: platform.staleMs,
      events: this.events,
    });
    this.renewal = new RenewalController({
      rotationMs: platform.rotationMs,
      jitterMs: platform.renewalJitterMs,
      maxConcurrent: platform.maxConcurrentRenewals,
      events: this.events,
    });

    const wire = (family: WsFamily, baseStreamUrl: string): WsFamilyStreams => {
      const pool = new FamilyConnectionPool({
        family,
        baseStreamUrl,
        maxConnections: platform.maxConnections?.[family],
        reconnectPolicy,
        events: this.events,
        socketFactory: platform.socketFactory,
        requestTimeoutMs,
        onConnection: (name, conn) => {
          this.heartbeat.watch(name, conn);
          this.renewal.track(name, conn);
        },
      });
      const registry = new FamilySubscriptionRegistry({
        pool,
        events: this.events,
        requestTimeoutMs,
      });
      this.pools.set(family, pool);
      this.registries.set(family, registry);

      const subscribeImpl = (
        streamOrStreams: string | string[],
        subscribeOptions?: SubscribeOptions,
      ): Promise<Subscription> | Promise<Subscription[]> => {
        if (typeof streamOrStreams === 'string') {
          return registry.acquire(streamOrStreams, subscribeOptions);
        }
        return Promise.all(
          streamOrStreams.map((stream) => registry.acquire(stream, subscribeOptions)),
        );
      };

      const streams: WsFamilyStreams = {
        // Correlated single/array returns need one narrowing cast (a known
        // TypeScript limitation for overloaded implementations).
        subscribe: subscribeImpl as WsFamilyStreams['subscribe'],
        getSubscription: (stream) => registry.getSubscription(stream),
        activeStreams: () => registry.activeStreams(),
        stats: () => ({
          connections: this.decorateStats(pool.stats()),
          activeStreams: registry.activeStreams().length,
        }),
      };
      return streams;
    };

    this.usdm = wire('usdm', core.endpoints.wsMarket);
    this.spot = wire('spot', core.endpoints.wsSpotMarket);
    this.coinm = wire('coinm', core.endpoints.wsDapiMarket);

    const creds: Pick<
      Credentials,
      'apiKey' | 'apiSecret' | 'privateKey' | 'signatureAlgorithm'
    > = core.credentials;
    const apiCommon = {
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
      privateKey: creds.privateKey,
      signatureAlgorithm: creds.signatureAlgorithm,
      recvWindow: core.transport.recvWindow,
      requestTimeoutMs: core.transport.timeoutMs,
      reconnectPolicy,
      events: this.events,
      socketFactory: platform.socketFactory,
      delay: platform.wsApiDelay,
    };
    this.api = {
      usdm: new FuturesWsApiClient({ ...apiCommon, baseUrl: core.endpoints.wsApi, name: 'wsApiUsdm' }),
      spot: new SpotWsApiClient({ ...apiCommon, baseUrl: core.endpoints.wsSpotApi, name: 'wsApiSpot' }),
    };
  }

  /** Aggregate snapshot across families and WS API clients (cheap, no I/O). */
  stats(): WsPlatformStats {
    const families: WsPlatformStats['families'] = {};
    for (const [family, registry] of this.registries) {
      const pool = this.pools.get(family);
      if (!pool) continue;
      families[family] = {
        connections: this.decorateStats(pool.stats()),
        activeStreams: registry.activeStreams().length,
      };
    }
    return {
      families,
      wsApi: [this.api.usdm, this.api.spot].map((client) => ({
        name: client.name,
        state: client.getState(),
        pendingRequests: client.pendingCount(),
      })),
    };
  }

  /** True when any pooled connection or WS API client is active. */
  hasActivity(): boolean {
    for (const pool of this.pools.values()) if (pool.size() > 0) return true;
    for (const client of [this.api.usdm, this.api.spot]) {
      if (client.getState() !== 'IDLE' && client.getState() !== 'CLOSED') return true;
    }
    return false;
  }

  /** Close everything: subscriptions, pooled connections, WS API clients. */
  close(): void {
    for (const registry of this.registries.values()) registry.closeAll();
    for (const pool of this.pools.values()) pool.closeAll();
    this.api.usdm.close();
    this.api.spot.close();
    this.renewal.close();
    this.heartbeat.stop();
    this.events.emit('ws.platform.closed', {});
  }

  /** Fill renewal deadlines into pool stats (RenewalController owns them). */
  private decorateStats(stats: WsConnectionStats[]): WsConnectionStats[] {
    return stats.map((entry) => ({
      ...entry,
      nextRenewalAt: this.renewal.nextRenewalAt(entry.name),
    }));
  }
}

/**
 * Build the platform from a core context. Kept as a factory (not a getter on
 * the context's public type) so the context stays free of platform imports
 * while still exposing the lazily-built instance via `core.ws`.
 */
export function createWsPlatform(
  core: Pick<CoreContext, 'endpoints' | 'credentials' | 'events' | 'transport'>,
  platform?: WsPlatformOptions,
): WsPlatform {
  return new WsPlatform({ core, platform });
}

/** Documented per-family stream ceilings (for callers sizing pools). */
export function familyLimits(family: WsFamily): { maxStreamsPerConnection: number; defaultMaxConnections: number } {
  return WS_FAMILY_LIMITS[family];
}
