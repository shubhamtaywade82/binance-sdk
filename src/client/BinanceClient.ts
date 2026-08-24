import type { AxiosRequestConfig } from 'axios';
import { HttpClient, type SignatureAlgorithm } from './HttpClient.js';
import { TradingPolicy, type TradingPolicyOptions } from './TradingPolicy.js';
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
   * allowlist, per-order notional cap, withdrawal and transfer switches. Omit for no policy
   * (all requests permitted). Opting in denies withdrawals unless explicitly allowed.
   */
  safety?: TradingPolicyOptions;
}

export class BinanceClient {
  readonly spot: {
    market: SpotMarket;
    account: SpotAccount;
    trading: SpotTrading;
    userStream: SpotUserDataStream;
    ws: SpotMarketWS;
    wsUser: SpotUserWS;
    wsApi: SpotWsApi;
  };
  readonly futures: {
    market: FuturesMarket;
    data: FuturesData;
    account: FuturesAccount;
    trading: FuturesTrading;
    ops: FuturesOps;
    userStream: UserDataStream;
    ws: FuturesMarketWS;
    wsUser: FuturesUserWS;
    wsApi: WsApi;
  };
  readonly coinm: {
    market: CoinMMarket;
    account: CoinMAccount;
    trading: CoinMTrading;
    userStream: CoinMUserDataStream;
    ws: CoinMMarketWS;
    wsUser: CoinMUserWS;
  };
  readonly margin: {
    account: MarginAccount;
    trading: MarginTrading;
  };
  readonly wallet: Wallet;
  readonly subaccount: SubAccount;
  /** The active guardrail policy, or undefined when no `safety` config was supplied. */
  readonly policy?: TradingPolicy;

  private readonly authHttp: HttpClient;
  private readonly spotHttp: HttpClient;
  private readonly dapiHttp: HttpClient;
  private readonly sapiHttp: HttpClient;
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
    this.policy = options.safety ? new TradingPolicy(options.safety) : undefined;
    const httpOptions = {
      policy: this.policy,
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
    this.spot = {
      market: new SpotMarket(spotHttp),
      account: new SpotAccount(spotHttp),
      trading: new SpotTrading(spotHttp),
      userStream: new SpotUserDataStream(spotHttp),
      ws: new SpotMarketWS(endpoints.wsSpotMarket),
      wsUser: new SpotUserWS({
        baseUserUrl: endpoints.wsSpotUser,
        getListenKey: () => this.spotListenKeyValue,
      }),
      wsApi: new SpotWsApi({
        baseUrl: endpoints.wsSpotApi,
        apiKey: options.apiKey,
        apiSecret: options.apiSecret,
        privateKey: options.privateKey,
        signatureAlgorithm: options.signatureAlgorithm,
        recvWindow: options.recvWindow,
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
      market: futuresMarket,
      data: futuresData,
      account: futuresAccount,
      trading: futuresTrading,
      ops: new FuturesOps(futuresMarket, futuresData, futuresAccount, futuresTrading),
      userStream: new UserDataStream(this.authHttp),
      ws: new FuturesMarketWS(endpoints.wsMarket),
      wsUser: new FuturesUserWS({
        baseUserUrl: endpoints.wsUser,
        getListenKey: () => this.listenKeyValue,
      }),
      wsApi: new WsApi({
        baseUrl: endpoints.wsApi,
        apiKey: options.apiKey,
        apiSecret: options.apiSecret,
        privateKey: options.privateKey,
        signatureAlgorithm: options.signatureAlgorithm,
        recvWindow: options.recvWindow,
      }),
    };

    this.dapiHttp = new HttpClient({ baseURL: endpoints.restDapiRoot, ...httpOptions });
    this.coinm = {
      market: new CoinMMarket(new HttpClient({ baseURL: endpoints.restDapi, ...httpOptions })),
      account: new CoinMAccount(this.dapiHttp),
      trading: new CoinMTrading(this.dapiHttp),
      userStream: new CoinMUserDataStream(this.dapiHttp),
      ws: new CoinMMarketWS(endpoints.wsDapiMarket),
      wsUser: new CoinMUserWS({
        baseUserUrl: endpoints.wsDapiUser,
        getListenKey: () => this.coinmListenKeyValue,
      }),
    };

    this.sapiHttp = new HttpClient({ baseURL: endpoints.restApiRoot, ...httpOptions });
    this.margin = {
      account: new MarginAccount(this.sapiHttp),
      trading: new MarginTrading(this.sapiHttp),
    };
    this.wallet = new Wallet(this.sapiHttp);
    this.subaccount = new SubAccount(this.sapiHttp);
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
