import type { AxiosRequestConfig } from 'axios';
import { HttpClient, type SignatureAlgorithm } from './HttpClient.js';
import type { RateLimitUsage } from './RateLimitTracker.js';
import { RiskGateway, type RiskGatewayOptions } from './RiskGateway.js';
import { resolveEnvironment } from './endpoints.js';
import { FuturesData } from '../resources/FuturesData.js';
import { FuturesMarket } from '../resources/FuturesMarket.js';
import { SpotMarket } from '../resources/SpotMarket.js';
import { SpotAccount, SpotTrading } from '../resources/SpotTrading.js';
import { SpotUserDataStream } from '../resources/SpotUserDataStream.js';
import { FuturesAccount } from '../resources/FuturesAccount.js';
import { FuturesTrading } from '../resources/FuturesTrading.js';
import { FuturesOps } from '../resources/FuturesOps.js';
import { UserDataStream } from '../resources/UserDataStream.js';
import { CoinMMarket } from '../resources/CoinMMarket.js';
import { CoinMAccount } from '../resources/CoinMAccount.js';
import { CoinMTrading } from '../resources/CoinMTrading.js';
import { CoinMUserDataStream } from '../resources/CoinMUserDataStream.js';
import { MarginAccount, MarginTrading } from '../resources/Margin.js';
import { Wallet } from '../resources/Wallet.js';
import { SubAccount } from '../resources/SubAccount.js';
import { FuturesMarketWS } from '../ws/FuturesMarketWS.js';
import { SpotMarketWS } from '../ws/SpotMarketWS.js';
import { SpotUserWS } from '../ws/SpotUserWS.js';
import { FuturesUserWS } from '../ws/FuturesUserWS.js';
import { CoinMMarketWS } from '../ws/CoinMMarketWS.js';
import { CoinMUserWS } from '../ws/CoinMUserWS.js';
import { WsApi } from '../ws/WsApi.js';
import { SpotWsApi } from '../ws/SpotWsApi.js';
import { OrderExecution } from './OrderExecution.js';
import { watchOrderBook, type OrderBookFeed, type OrderBookFeedOptions } from '../marketstate/OrderBookFeed.js';
import type {
  CoinMProduct,
  FuturesUsdmProduct,
  MarginProduct,
  Products,
  SpotOrderParams,
  SpotProduct,
  SubAccountProduct,
  WalletProduct,
} from './products.js';
import {
  FUTURES_COINM_CAPABILITIES,
  FUTURES_USDM_CAPABILITIES,
  MARGIN_CAPABILITIES,
  SPOT_CAPABILITIES,
  SUBACCOUNT_CAPABILITIES,
  WALLET_CAPABILITIES,
} from './products.js';
import type { SdkLogger } from '../util/logger.js';
import { silentLogger } from '../util/logger.js';
import type { CreateOrderParams, NewOrderAck, Order } from '../types/trading.types.js';
import type { SpotOrder } from '../types/spot.types.js';

export { RiskGateway } from './RiskGateway.js';
export type { RiskGatewayOptions, RiskGatewayStatus } from './RiskGateway.js';

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
   * allowlist, per-order notional cap, withdrawal and transfer switches — plus the
   * stateful RiskGateway rules (maxOpenOrders, maxOrdersPerMinute, maxLeverage,
   * maxSymbolNotional, maxTotalNotional, maxDailyLoss, circuit breaker). Omit for no
   * policy (all requests permitted). Opting in denies withdrawals unless explicitly allowed.
   */
  safety?: RiskGatewayOptions;
  /** Structured JSON-lines logger for SDK internals (HTTP retries, WS lifecycle, reconciliation). Default: silent. */
  logger?: SdkLogger;
}

export class BinanceClient {
  readonly spot: SpotProduct;
  readonly futures: FuturesUsdmProduct;
  readonly coinm: CoinMProduct;
  readonly margin: MarginProduct;
  readonly wallet: WalletProduct;
  readonly subaccount: SubAccountProduct;
  /**
   * The product registry: the capability-oriented view of the same resource
   * instances (Core → Product → Capability → Endpoint). `client.products.spot
   * === client.spot`, `client.products.futures.usdm === client.futures`.
   */
  readonly products: Products;
  /** The active guardrail policy, or undefined when no `safety` config was supplied. */
  readonly policy?: RiskGateway;
  /** The RiskGateway instance behind `policy` (same object), or undefined. */
  readonly risk?: RiskGateway;

  private readonly authHttp: HttpClient;
  private readonly spotHttp: HttpClient;
  private readonly dapiHttp: HttpClient;
  private readonly sapiHttp: HttpClient;
  private readonly logger: SdkLogger;
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
    const { endpoints } = resolveEnvironment(options);
    this.logger = options.logger ?? silentLogger;
    const risk = options.safety ? new RiskGateway(options.safety) : undefined;
    this.policy = risk;
    this.risk = risk;
    const httpOptions = {
      policy: risk,
      logger: this.logger.child('http'),
      apiKey: options.apiKey,
      apiSecret: options.apiSecret,
      privateKey: options.privateKey,
      signatureAlgorithm: options.signatureAlgorithm,
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

    this.authHttp = new HttpClient({ baseURL: endpoints.restRoot, ...httpOptions });

    this.spotHttp = new HttpClient({ baseURL: endpoints.restSpot, ...httpOptions });
    const spotHttp = this.spotHttp;
    const spotMarket = new SpotMarket(spotHttp);
    const spotTrading = new SpotTrading(spotHttp);
    this.spot = {
      id: 'spot',
      capabilities: SPOT_CAPABILITIES,
      market: spotMarket,
      account: new SpotAccount(spotHttp),
      trading: spotTrading,
      userStream: new SpotUserDataStream(spotHttp),
      ws: new SpotMarketWS(endpoints.wsSpotMarket, this.logger.child('spot-ws')),
      wsUser: new SpotUserWS({
        baseUserUrl: endpoints.wsSpotUser,
        getListenKey: () => this.spotListenKeyValue,
        logger: this.logger.child('spot-user-ws'),
      }),
      wsApi: new SpotWsApi({
        baseUrl: endpoints.wsSpotApi,
        apiKey: options.apiKey,
        apiSecret: options.apiSecret,
        privateKey: options.privateKey,
        signatureAlgorithm: options.signatureAlgorithm,
        recvWindow: options.recvWindow,
      }),
      execution: new OrderExecution<SpotOrderParams, SpotOrder>({
        trading: spotTrading,
        logger: this.logger.child('spot-execution'),
        onOrderAccepted: (order) =>
          risk?.recordOrderPlaced({
            clientOrderId: order.clientOrderId,
            orderId: order.orderId,
            symbol: order.symbol,
          }),
      }),
      watchOrderBook: (symbol: string, feedOptions?: Partial<OrderBookFeedOptions>) =>
        watchOrderBook({
          symbol,
          variant: 'spot',
          ws: this.spot.ws,
          market: spotMarket,
          streamName: this.spot.ws.depthDiffSpeed(symbol.toLowerCase(), '100ms'),
          ...feedOptions,
        }),
    };

    const futuresMarket = new FuturesMarket(
      new HttpClient({ baseURL: endpoints.restFapi, ...httpOptions }),
      endpoints.restRoot,
    );
    const futuresData = new FuturesData({
      restFapi: endpoints.restFapi,
      restFuturesData: endpoints.restFuturesData,
      ...httpOptions,
    });
    const futuresAccount = new FuturesAccount(this.authHttp);
    const futuresTrading = new FuturesTrading(this.authHttp);

    this.futures = {
      id: 'futures.usdm',
      capabilities: FUTURES_USDM_CAPABILITIES,
      market: futuresMarket,
      data: futuresData,
      account: futuresAccount,
      trading: futuresTrading,
      ops: new FuturesOps(futuresMarket, futuresData, futuresAccount, futuresTrading),
      userStream: new UserDataStream(this.authHttp),
      ws: new FuturesMarketWS(endpoints.wsMarket, this.logger.child('futures-ws')),
      wsUser: new FuturesUserWS({
        baseUserUrl: endpoints.wsUser,
        getListenKey: () => this.listenKeyValue,
        logger: this.logger.child('futures-user-ws'),
      }),
      wsApi: new WsApi({
        baseUrl: endpoints.wsApi,
        apiKey: options.apiKey,
        apiSecret: options.apiSecret,
        privateKey: options.privateKey,
        signatureAlgorithm: options.signatureAlgorithm,
        recvWindow: options.recvWindow,
      }),
      execution: new OrderExecution<CreateOrderParams, NewOrderAck | Order>({
        trading: futuresTrading,
        logger: this.logger.child('futures-execution'),
        onOrderAccepted: (order) =>
          risk?.recordOrderPlaced({
            clientOrderId: order.clientOrderId,
            orderId: order.orderId,
            symbol: order.symbol,
          }),
      }),
      watchOrderBook: (symbol: string, feedOptions?: Partial<OrderBookFeedOptions>) =>
        watchOrderBook({
          symbol,
          variant: 'futures',
          ws: this.futures.ws,
          market: futuresMarket,
          streamName: this.futures.ws.depthDiffSpeed(symbol.toLowerCase(), '100ms'),
          ...feedOptions,
        }),
      // Ergonomic aliases are assigned after the surfaces exist (below).
      usdm: undefined as unknown as FuturesUsdmProduct,
      coinm: undefined as unknown as CoinMProduct,
    };

    this.dapiHttp = new HttpClient({ baseURL: endpoints.restDapiRoot, ...httpOptions });
    const coinmMarket = new CoinMMarket(new HttpClient({ baseURL: endpoints.restDapi, ...httpOptions }));
    this.coinm = {
      id: 'futures.coinm',
      capabilities: FUTURES_COINM_CAPABILITIES,
      market: coinmMarket,
      account: new CoinMAccount(this.dapiHttp),
      trading: new CoinMTrading(this.dapiHttp),
      userStream: new CoinMUserDataStream(this.dapiHttp),
      ws: new CoinMMarketWS(endpoints.wsDapiMarket, this.logger.child('coinm-ws')),
      wsUser: new CoinMUserWS({
        baseUserUrl: endpoints.wsDapiUser,
        getListenKey: () => this.coinmListenKeyValue,
        logger: this.logger.child('coinm-user-ws'),
      }),
    };
    this.futures.usdm = this.futures;
    this.futures.coinm = this.coinm;

    this.sapiHttp = new HttpClient({ baseURL: endpoints.restApiRoot, ...httpOptions });
    this.margin = {
      id: 'margin',
      capabilities: MARGIN_CAPABILITIES,
      account: new MarginAccount(this.sapiHttp),
      trading: new MarginTrading(this.sapiHttp),
    };
    this.wallet = Object.assign(new Wallet(this.sapiHttp), {
      id: 'wallet',
      capabilities: WALLET_CAPABILITIES,
    });
    this.subaccount = Object.assign(new SubAccount(this.sapiHttp), {
      id: 'subaccount',
      capabilities: SUBACCOUNT_CAPABILITIES,
    });

    this.products = {
      spot: this.spot,
      futures: { usdm: this.futures, coinm: this.coinm },
      margin: this.margin,
      wallet: this.wallet,
      subaccount: this.subaccount,
    };
  }

  /**
   * Syncs local time against each REST host's server clock and stores the offset, applied to
   * every subsequent signed request's `timestamp` param. Call this once after construction to
   * mitigate `-1021` errors caused by local clock drift.
   */
  async syncTime(): Promise<void> {
    await Promise.all([
      this.authHttp.syncTime('/fapi/v1/time'),
      this.spotHttp.syncTime('/time'),
      this.dapiHttp.syncTime('/dapi/v1/time'),
      this.sapiHttp.syncTime('/api/v3/time'),
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
      spot: this.spotHttp.getRateLimitUsage(),
      futures: this.authHttp.getRateLimitUsage(),
      coinm: this.dapiHttp.getRateLimitUsage(),
      sapi: this.sapiHttp.getRateLimitUsage(),
    };
  }

  /**
   * Live-maintained L2 order book for a USD-M futures symbol: subscribes the
   * diff stream, snapshots REST depth, and re-snapshots automatically on any
   * sequence gap. Returns the book plus a close() to stop the feed.
   */
  watchFuturesOrderBook(symbol: string, options?: Partial<OrderBookFeedOptions>): Promise<OrderBookFeed> {
    return this.futures.watchOrderBook(symbol, options);
  }

  /** Live-maintained L2 order book for a spot symbol. */
  watchSpotOrderBook(symbol: string, options?: Partial<OrderBookFeedOptions>): Promise<OrderBookFeed> {
    return this.spot.watchOrderBook(symbol, options);
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
