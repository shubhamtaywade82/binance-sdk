import { HttpClient } from '../client/HttpClient.js';
import { TradingPolicy } from '../client/TradingPolicy.js';
import type { RateLimitUsage } from '../client/RateLimitTracker.js';
import { resolveEnvironment, type Endpoints, type Environment } from '../client/endpoints.js';
import type { BinanceClientOptions } from '../client/BinanceClient.js';
import { EventBus } from './events.js';
import { RiskGateway } from '../risk/RiskGateway.js';
import { Credentials } from './credentials.js';

/**
 * The REST hosts a {@link CoreContext} can serve. Each host gets exactly one
 * cached `HttpClient` (its own weight budget and clock offset), created on
 * first use — a spot-only client never builds the futures transports.
 */
export type RestHost = 'fapiRoot' | 'fapi' | 'spot' | 'apiRoot' | 'dapiRoot' | 'dapi';

/** Transport tuning shared by every host client. */
export interface CoreTransportOptions {
  recvWindow: number;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  rateLimitWeightPerMinute?: number;
  rateLimitSafetyMargin?: number;
  /** Custom keep-alive/https agent, e.g. corporate proxies or connection pooling. */
  httpsAgent?: ConstructorParameters<typeof HttpClient>[0]['httpsAgent'];
  /** Axios proxy configuration. */
  proxy?: ConstructorParameters<typeof HttpClient>[0]['proxy'];
}

const HOST_URL: Record<RestHost, (e: Endpoints) => string> = {
  fapiRoot: (e) => e.restRoot,
  fapi: (e) => e.restFapi,
  spot: (e) => e.restSpot,
  apiRoot: (e) => e.restApiRoot,
  dapiRoot: (e) => e.restDapiRoot,
  dapi: (e) => e.restDapi,
};

/**
 * v3 core context: the shared runtime every product client is constructed
 * from — one transport pool, one credential set, one observability bus, one
 * policy chain.
 *
 * The v2 `BinanceClient` built these inline in its constructor and handed
 * raw pieces to each product namespace. v3 makes the bundle explicit so
 * products (USDM first, then Spot/COIN-M/…) are plug-ins over the same
 * runtime rather than parallel copies of infrastructure:
 *
 * ```ts
 * const core = new CoreContext({ apiKey, apiSecret });
 * const usdm = new USDMClient(core);            // full USDⓈ-M surface
 * await core.syncTime();                        // every host's clock offset
 * ```
 *
 * Nothing here performs network I/O at construction: HttpClients, WS
 * managers and product namespaces are all lazy, so a market-data-only
 * caller pays for exactly the sockets it opens.
 */
export class CoreContext {
  /** 'live' | 'testnet' | 'demo'. */
  readonly env: Environment;
  /** Resolved REST/WS URLs for the environment. */
  readonly endpoints: Endpoints;
  /** Authentication material (never I/O). */
  readonly credentials: Credentials;
  /** Structured observability bus (`http.*`, `ws.*`, `execution.*`, `risk.*`). */
  readonly events: EventBus;
  /** The active guardrail policy, when `safety` was configured. */
  readonly policy?: TradingPolicy;
  /** Retry/timeout/rate-limit tuning shared by every host transport. */
  readonly transport: CoreTransportOptions;

  private readonly httpClients = new Map<RestHost, HttpClient>();

  constructor(options: BinanceClientOptions = {}) {
    const { env, endpoints } = resolveEnvironment(options);
    this.env = env;
    this.endpoints = endpoints;
    this.events = (options.events as EventBus) ?? new EventBus();
    this.credentials = Credentials.fromOptions(options);
    const riskGateway = options.safety ? new RiskGateway(options.safety, this.events) : undefined;
    this.policy = riskGateway ?? (options.safety ? new TradingPolicy(options.safety) : undefined);
    this.transport = {
      recvWindow: options.recvWindow ?? 5000,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: options.maxRetries ?? 3,
      retryBaseDelayMs: options.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs,
      rateLimitWeightPerMinute: options.rateLimitWeightPerMinute,
      rateLimitSafetyMargin: options.rateLimitSafetyMargin,
      httpsAgent: options.httpsAgent,
      proxy: options.proxy,
    };
  }

  /**
   * The cached `HttpClient` for a REST host. First access constructs it with
   * the context's credentials, policy, events and transport options; later
   * calls return the same instance (same weight budget, same clock offset).
   */
  http(host: RestHost): HttpClient {
    let client = this.httpClients.get(host);
    if (!client) {
      client = new HttpClient({
        baseURL: HOST_URL[host](this.endpoints),
        apiKey: this.credentials.apiKey,
        apiSecret: this.credentials.apiSecret,
        privateKey: this.credentials.privateKey,
        signatureAlgorithm: this.credentials.signatureAlgorithm,
        policy: this.policy,
        events: this.events,
        recvWindow: this.transport.recvWindow,
        timeoutMs: this.transport.timeoutMs,
        maxRetries: this.transport.maxRetries,
        retryBaseDelayMs: this.transport.retryBaseDelayMs,
        retryMaxDelayMs: this.transport.retryMaxDelayMs,
        rateLimitWeightPerMinute: this.transport.rateLimitWeightPerMinute,
        rateLimitSafetyMargin: this.transport.rateLimitSafetyMargin,
        httpsAgent: this.transport.httpsAgent,
        proxy: this.transport.proxy,
      });
      this.httpClients.set(host, client);
    }
    return client;
  }

  /** True when the given host's transport has been constructed. */
  hasHttp(host: RestHost): boolean {
    return this.httpClients.has(host);
  }

  /**
   * Weight/order-count usage snapshots for every *constructed* host — cheap
   * (no I/O), and unconstructed hosts are simply absent rather than forced
   * into existence by an observability read.
   */
  httpUsage(): Partial<Record<RestHost, RateLimitUsage>> {
    const usage: Partial<Record<RestHost, RateLimitUsage>> = {};
    for (const [host, client] of this.httpClients) usage[host] = client.getRateLimitUsage();
    return usage;
  }

  /**
   * Sync local time against every REST host's server clock (fapi, spot, dapi
   * and sapi roots) and store the offsets for subsequent signed requests.
   * Mitigates `-1021` errors from local clock drift.
   */
  async syncTime(): Promise<void> {
    await Promise.all([
      this.http('fapiRoot').syncTime('/fapi/v1/time'),
      this.http('spot').syncTime('/time'),
      this.http('dapiRoot').syncTime('/dapi/v1/time'),
      this.http('apiRoot').syncTime('/api/v3/time'),
    ]);
  }

  /** Close is a no-op for REST transports; WS lifecycle lives in products. */
  describe(): string {
    return `CoreContext(${this.env}, ${this.credentials.describe()}, hosts: [${[...this.httpClients.keys()].join(', ')}])`;
  }
}
