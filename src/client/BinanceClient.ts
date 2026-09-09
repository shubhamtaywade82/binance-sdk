import type { AxiosRequestConfig } from 'axios';
import { HttpClient, type SignatureAlgorithm } from './HttpClient.js';
import type { RateLimitUsage } from './RateLimitTracker.js';
import { TradingPolicy, type TradingPolicyOptions } from './TradingPolicy.js';
import { RiskGateway, type RiskGatewayOptions } from '../risk/RiskGateway.js';
import { EventBus } from '../core/events.js';
import { CoreContext } from '../core/context.js';
import { resolveEnvironment } from './endpoints.js';
import { MarginAccount, MarginTrading } from '../resources/Margin.js';
import { Wallet } from '../resources/Wallet.js';
import { SubAccount } from '../resources/SubAccount.js';
import { buildSpotSurface, type SpotSurface } from '../products/spot/surface.js';
import {
  buildUsdmSurface,
  type FuturesNamespace,
  type UsdmSurface,
} from '../products/usdm/namespace.js';
import { buildCoinmSurface, type CoinMSurface } from '../products/coinm/surface.js';
import { ExecutionManager } from '../execution/ExecutionManager.js';
import { PaperExecutionAdapter } from '../execution/paper.js';
import { ExecutionGateway, type ExecutionBackend } from '../execution/Gateway.js';
import { PaperTradingEngine, type PaperTradingOptions } from '../paper/PaperTradingEngine.js';

import { OrderBookEngine } from '../state/OrderBookEngine.js';
import type { OrderBook } from '../state/OrderBook.js';

export interface BinanceClientOptions {
  apiKey?: string;
  apiSecret?: string;
  /** PEM-encoded Ed25519 or RSA private key. When set, requests are signed with it instead of HMAC. */
  privateKey?: string | Buffer;
  /** Defaults to 'ED25519' when privateKey is set, otherwise 'HMAC'. */
  signatureAlgorithm?: SignatureAlgorithm;
  testnet?: boolean;
  demo?: boolean;
  recvWindow?: number;
  apiBase?: string;
  wsBase?: string;
  wsUserBase?: string;
  wsApiBase?: string;
  dapiBase?: string;
  wsSpotApiBase?: string;
  wsDapiBase?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** @deprecated unused; superseded by header-based tracking (rateLimitWeightPerMinute/rateLimitSafetyMargin). */
  rateLimitTokensPerSecond?: number;
  /** @deprecated unused; superseded by header-based tracking (rateLimitWeightPerMinute/rateLimitSafetyMargin). */
  rateLimitMaxTokens?: number;
  /** Assumed per-minute IP weight ceiling used to preempt -1003 bans. Binance's default is 6000 for most REST hosts. */
  rateLimitWeightPerMinute?: number;
  /** Fraction of rateLimitWeightPerMinute at which requests are delayed until the next minute window. Set >=1 to disable. */
  rateLimitSafetyMargin?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  /** Custom keep-alive/https agent, e.g. for corporate proxies or connection pooling. */
  httpsAgent?: AxiosRequestConfig['httpsAgent'];
  /** Axios proxy configuration. */
  proxy?: AxiosRequestConfig['proxy'];
  /**
   * Client-side guardrails for autonomous/LLM-driven callers: dry run, read-only, symbol
   * allowlist, per-order notional cap, leverage/exposure/daily-loss limits, circuit breaker,
   * withdrawal and transfer switches. Omit for no policy (all requests permitted).
   * Opting in denies withdrawals unless explicitly allowed.
   *
   * Superset of the v2.0 `TradingPolicyOptions` — a full {@link RiskGateway} is
   * constructed, and it is also fed by `futures.execution`.
   */
  safety?: RiskGatewayOptions;
  /**
   * Bring your own observability bus; when omitted a fresh internal one is
   * created and exposed as `client.events`.
   */
  events?: EventBus;
}

export interface MarginNamespace {
  account: MarginAccount;
  trading: MarginTrading;
}

export class BinanceClient {
  /**
   * v3 shared runtime: one transport pool, one credential set, one
   * observability bus, one policy chain. Every product namespace below is
   * lazily constructed from this context and cached — identity is stable
   * (`client.futures.execution === client.futures.execution`), and a
   * namespace is never built until first accessed.
   */
  readonly core: CoreContext;

  get spot(): SpotSurface {
    return this.cached('spot', () => buildSpotSurface(this.core, () => this.spotListenKeyValue));
  }

  get futures(): FuturesNamespace {
    return this.cached('futures', () =>
      this.attachAliases(
        buildUsdmSurface(this.core, () => this.listenKeyValue),
      ),
    );
  }

  get coinm(): CoinMSurface {
    return this.cached('coinm', () =>
      buildCoinmSurface(this.core, () => this.coinmListenKeyValue),
    );
  }

  get margin(): MarginNamespace {
    return this.cached('margin', () => ({
      account: new MarginAccount(this.core.http('apiRoot')),
      trading: new MarginTrading(this.core.http('apiRoot')),
    }));
  }

  get wallet(): Wallet {
    return this.cached('wallet', () => new Wallet(this.core.http('apiRoot')));
  }

  get subaccount(): SubAccount {
    return this.cached('subaccount', () => new SubAccount(this.core.http('apiRoot')));
  }

  /** The active guardrail policy, or undefined when no `safety` config was supplied. */
  get policy(): TradingPolicy | undefined {
    return this.core.policy;
  }

  /** Structured observability bus: `http.*`, `ws.*`, `execution.*`, `risk.*` events. */
  get events(): EventBus {
    return this.core.events;
  }

  /** Product-oriented view: spot / futures.usdm / futures.coinm / margin / wallet / subaccount. */
  get products(): {
    spot: SpotSurface;
    usdm: FuturesNamespace;
    coinm: CoinMSurface;
    margin: MarginNamespace;
    wallet: Wallet;
    subaccount: SubAccount;
  } {
    return {
      spot: this.spot,
      usdm: this.futures.usdm,
      coinm: this.futures.coinm,
      margin: this.margin,
      wallet: this.wallet,
      subaccount: this.subaccount,
    };
  }

  private readonly namespaces = new Map<string, unknown>();
  private listenKeyValue: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private spotListenKeyValue: string | null = null;
  private spotKeepAliveInterval: NodeJS.Timeout | null = null;
  private coinmListenKeyValue: string | null = null;
  private coinmKeepAliveInterval: NodeJS.Timeout | null = null;

  static nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  static buildPair(base: string, target: string): string {
    return `${base}${target}`.toUpperCase();
  }

  static parsePair(pair: string): { base: string; target: string } | null {
    const match = pair.match(/^([A-Z0-9]+)(USDT|USDC|BUSD|BTC|ETH|BNB)$/);
    if (!match) return null;
    return { base: match[1] as string, target: match[2] as string };
  }

  static calculateLiquidationPrice(entryPrice: number, leverage: number, side: 'buy' | 'sell', mm = 0.005): number {
    const dir = side === 'buy' ? 1 : -1;
    return dir === 1
      ? entryPrice * (1 - 1 / leverage + mm)
      : entryPrice * (1 + 1 / leverage - mm);
  }

  constructor(options: BinanceClientOptions = {}) {
    this.core = new CoreContext(options);
  }

  /** Build-once cache for lazy product namespaces. */
  private cached<T>(key: string, build: () => T): T {
    let value = this.namespaces.get(key) as T | undefined;
    if (value === undefined) {
      value = build();
      this.namespaces.set(key, value);
    }
    return value;
  }

  /** Attach the ergonomic `futures.usdm` / `futures.coinm` aliases to the USDⓈ-M surface. */
  private attachAliases(usdm: UsdmSurface): FuturesNamespace {
    const withAliases = {
      ...usdm,
      usdm: null as unknown as FuturesNamespace,
      coinm: this.coinm,
    };
    withAliases.usdm = withAliases;
    return withAliases;
  }

  /**
   * Syncs local time against each REST host's server clock and stores the offset, applied to
   * every subsequent signed request's `timestamp` param. Call this once after construction to
   * mitigate `-1021` errors caused by local clock drift.
   */
  async syncTime(): Promise<void> {
    await Promise.all([
      this.core.http('fapiRoot').syncTime('/fapi/v1/time'),
      this.core.http('spot').syncTime('/time'),
      this.core.http('dapiRoot').syncTime('/dapi/v1/time'),
      this.core.http('apiRoot').syncTime('/api/v3/time'),
    ]);
  }

  /**
   * Snapshot of the most recently observed `X-MBX-USED-WEIGHT-*` / `X-MBX-ORDER-COUNT-*`
   * response headers, per REST host. Each host tracks its own weight budget independently.
   */
  getRateLimitUsage(): {
    spot: RateLimitUsage;
    futures: RateLimitUsage;
    coinm: RateLimitUsage;
    sapi: RateLimitUsage;
  } {
    return {
      spot: this.core.http('spot').getRateLimitUsage(),
      futures: this.core.http('fapiRoot').getRateLimitUsage(),
      coinm: this.core.http('dapiRoot').getRateLimitUsage(),
      sapi: this.core.http('apiRoot').getRateLimitUsage(),
    };
  }

  async startUserStream(): Promise<string> {
    const { listenKey } = await this.futures.userStream.createListenKey();
    this.listenKeyValue = listenKey;
    this.keepAliveInterval = setInterval(() => {
      this.futures.userStream.keepAliveListenKey().catch(() => {
        /* listenKey keep-alive failures are retried on the next tick */
      });
    }, 30 * 60 * 1000);
    this.futures.wsUser.connect();
    return listenKey;
  }

  closeUserStream(): void {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = null;
    this.futures.wsUser.close();
    this.futures.userStream.closeListenKey().catch(() => {
      /* best-effort cleanup */
    });
    this.listenKeyValue = null;
  }

  async startSpotUserStream(): Promise<string> {
    const { listenKey } = await this.spot.userStream.createListenKey();
    this.spotListenKeyValue = listenKey;
    this.spotKeepAliveInterval = setInterval(() => {
      this.spot.userStream.keepAliveListenKey().catch(() => {
        /* spot listenKey keep-alive failures are retried on the next tick */
      });
    }, 30 * 60 * 1000);
    this.spot.wsUser.connect();
    return listenKey;
  }

  closeSpotUserStream(): void {
    if (this.spotKeepAliveInterval) clearInterval(this.spotKeepAliveInterval);
    this.spotKeepAliveInterval = null;
    this.spot.wsUser.close();
    this.spot.userStream.closeListenKey().catch(() => {
      /* best-effort cleanup */
    });
    this.spotListenKeyValue = null;
  }

  async startCoinMUserStream(): Promise<string> {
    const { listenKey } = await this.coinm.userStream.createListenKey();
    this.coinmListenKeyValue = listenKey;
    this.coinmKeepAliveInterval = setInterval(() => {
      this.coinm.userStream.keepAliveListenKey().catch(() => {
        /* COIN-M listenKey keep-alive failures are retried on the next tick */
      });
    }, 30 * 60 * 1000);
    this.coinm.wsUser.connect();
    return listenKey;
  }

  closeCoinMUserStream(): void {
    if (this.coinmKeepAliveInterval) clearInterval(this.coinmKeepAliveInterval);
    this.coinmKeepAliveInterval = null;
    this.coinm.wsUser.close();
    this.coinm.userStream.closeListenKey().catch(() => {
      /* best-effort cleanup */
    });
    this.coinmListenKeyValue = null;
  }

  /**
   * Local L2 order-book engine on the futures market stream + REST snapshots:
   * best bid/ask, spread, microprice, imbalance, VWAP — all decimal-exact.
   *
   * ```ts
   * const books = client.createFuturesOrderBookEngine();
   * const btc = await books.subscribe('BTCUSDT');
   * btc.metrics(); // { bestBid, bestAsk, spread, imbalance, microprice, ... }
   * ```
   */
  createFuturesOrderBookEngine(options?: {
    updateSpeed?: '100ms' | '500ms';
    resyncDelayMs?: number;
  }): OrderBookEngine {
    return new OrderBookEngine({
      ws: this.futures.ws,
      fetchSnapshot: async (symbol) => {
        const snapshot = await this.futures.market.depth(symbol.toUpperCase(), 1000);
        // Re-stringify: the typed schema converts to numbers; the book engine
        // accepts numeric pairs but prefers exact strings.
        return {
          lastUpdateId: snapshot.lastUpdateId,
          bids: snapshot.bids.map((level) => [String(level.price), String(level.qty)] as [string, string]),
          asks: snapshot.asks.map((level) => [String(level.price), String(level.qty)] as [string, string]),
        };
      },
      events: this.events,
      ...options,
    });
  }

  /** Local L2 book for a futures symbol (sugar over createFuturesOrderBookEngine). */
  async subscribeFuturesOrderBook(symbol: string, options?: { updateSpeed?: '100ms' | '500ms' }): Promise<OrderBook> {
    const engine = this.createFuturesOrderBookEngine(options);
    return engine.subscribe(symbol);
  }

  /**
   * Paper trading as a first-class execution backend.
   *
   * Returns an {@link ExecutionManager} whose orders route through a local
   * {@link PaperTradingEngine} simulator — the same `Execution` envelope, the
   * same idempotency and reconciliation semantics as the live manager, zero
   * exchange traffic.
   *
   * ```ts
   * const paper = client.createPaperExecutionManager({ initialBalance: 50_000 });
   * const execution = await paper.placeOrder({
   *   symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01,
   * });
   * ```
   */
  createPaperExecutionManager(options: PaperTradingOptions = {}): ExecutionManager {
    return new ExecutionManager(new PaperExecutionAdapter(new PaperTradingEngine(options)), {
      clientOrderIdPrefix: 'paper',
      events: this.events,
    });
  }

  /**
   * Execution gateway: route orders to the live exchange or the paper
   * simulator through one interface, with independent ledgers per backend.
   *
   * ```ts
   * const gateway = client.createExecutionGateway({ defaultBackend: 'paper' });
   * await gateway.placeOrder({ symbol: 'BTCUSDT', ... });            // paper
   * await gateway.placeOrder({ ...order }, { backend: 'live' });      // live
   * gateway.paperEngine.getAccountInfo();                              // simulation state
   * ```
   */
  createExecutionGateway(
    options: { paper?: PaperTradingOptions; defaultBackend?: ExecutionBackend } = {},
  ): ExecutionGateway {
    return new ExecutionGateway({
      live: this.futures.execution,
      paperEngine: new PaperTradingEngine(options.paper),
      defaultBackend: options.defaultBackend,
    });
  }

  /** Snapshot of the active risk gateway's state, when `safety` was configured. */
  getRiskStatus(): ReturnType<RiskGateway['riskStatus']> | undefined {
    return this.policy instanceof RiskGateway ? this.policy.riskStatus() : undefined;
  }

  closeAllWebSockets(): void {
    this.futures.ws.close();
    this.futures.wsUser.close();
    this.spot.ws.close();
    this.spot.wsUser.close();
    this.coinm.ws.close();
    this.coinm.wsUser.close();
    this.closeUserStream();
    this.closeSpotUserStream();
    this.closeCoinMUserStream();
  }

  reconnectWebSocket(target: 'ws' | 'wsUser' | 'spot' | 'spotUser' | 'coinm' | 'coinmUser'): void {
    if (target === 'ws') this.futures.ws.reconnect();
    else if (target === 'wsUser') this.futures.wsUser.reconnect();
    else if (target === 'spot') this.spot.ws.reconnect();
    else if (target === 'spotUser') this.spot.wsUser.reconnect();
    else if (target === 'coinm') this.coinm.ws.reconnect();
    else this.coinm.wsUser.reconnect();
  }

  resetReconnectAttempts(): void {
    this.futures.ws.resetReconnectAttempts();
    this.futures.wsUser.resetReconnectAttempts();
    this.spot.ws.resetReconnectAttempts();
    this.spot.wsUser.resetReconnectAttempts();
    this.coinm.ws.resetReconnectAttempts();
    this.coinm.wsUser.resetReconnectAttempts();
  }
}
