import type { AxiosRequestConfig } from 'axios';
import type { SignatureAlgorithm } from './HttpClient.js';
import type { RateLimitUsage } from './RateLimitTracker.js';
import { TradingPolicy } from './TradingPolicy.js';
import { RiskGateway, type RiskGatewayOptions } from '../risk/RiskGateway.js';
import { EventBus } from '../core/events.js';
import { CoreContext } from '../core/context.js';
import type { WsPlatform, WsPlatformOptions } from '../ws/platform/WsPlatform.js';
import { MarginAccount, MarginTrading } from '../resources/Margin.js';
import { MarginWave6 } from '../resources/MarginWave6.js';
import { Wallet } from '../resources/Wallet.js';
import { WalletWave6 } from '../resources/WalletWave6.js';
import { SubAccount } from '../resources/SubAccount.js';
import { SubAccountWave6 } from '../resources/SubAccountWave6.js';
import { buildSpotSurface, type SpotSurface } from '../products/spot/surface.js';
import {
  buildUsdmSurface,
  type FuturesNamespace,
  type UsdmSurface,
} from '../products/usdm/namespace.js';
import { buildCoinmSurface, type CoinMSurface } from '../products/coinm/surface.js';
import { buildOptionsSurface, type OptionsSurface } from '../products/options/surface.js';
import {
  buildPortfolioMarginSurface,
  type PortfolioMarginSurface,
} from '../products/portfolio/surface.js';
import {
  buildPortfolioMarginProSurface,
  type PortfolioMarginProSurface,
} from '../products/portfolioPro/surface.js';
import { buildConvertSurface, type ConvertSurface } from '../products/convert/surface.js';
import { buildCryptoLoanSurface, type CryptoLoanSurface } from '../products/cryptoLoan/surface.js';
import { buildAlgoSurface, type AlgoSurface } from '../products/algo/surface.js';
import {
  buildDualInvestmentSurface,
  type DualInvestmentSurface,
} from '../products/dualInvestment/surface.js';
import { buildAlphaSurface, type AlphaSurface } from '../products/alpha/surface.js';
import {
  buildCopyTradingSurface,
  type CopyTradingSurface,
} from '../products/copyTrading/surface.js';
import { buildC2CSurface, type C2CSurface } from '../products/c2c/surface.js';
// Contract-first generated product surfaces (Wave 5: 9 new products from
// the official Binance Postman collections at
// https://github.com/binance/binance-api-postman).
import { buildFiatSurface, type FiatSurface } from '../products/fiat/surface.js';
import { buildGiftCardSurface, type GiftCardSurface } from '../products/giftCard/surface.js';
import { buildMiningSurface, type MiningSurface } from '../products/mining/surface.js';
import { buildNftSurface, type NftSurface } from '../products/nft/surface.js';
import { buildPaySurface, type PaySurface } from '../products/pay/surface.js';
import { buildRebateSurface, type RebateSurface } from '../products/rebate/surface.js';
import { buildSimpleEarnSurface, type SimpleEarnSurface } from '../products/simpleEarn/surface.js';
import { buildStakingSurface, type StakingSurface } from '../products/staking/surface.js';
import { buildVipLoanSurface, type VipLoanSurface } from '../products/vipLoan/surface.js';
import { ExecutionManager } from '../execution/ExecutionManager.js';
import { PaperExecutionAdapter } from '../execution/paper.js';
import { ExecutionGateway, type ExecutionBackend } from '../execution/Gateway.js';
import type { AuditSink } from '../execution/AuditSink.js';
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
  /** USDⓈ-M `/public` stream URL override (defaults to `wsBase` with `/market/` → `/public/`). */
  wsMarketPublicBase?: string;
  wsUserBase?: string;
  wsApiBase?: string;
  dapiBase?: string;
  wsSpotApiBase?: string;
  wsDapiBase?: string;
  wsDapiMarketPublicBase?: string;
  wsDapiApiBase?: string;
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
  /**
   * v3 WebSocket platform tuning: per-family connection caps, renewal and
   * heartbeat windows, reconnect policy. The platform itself is lazily built
   * on first `client.ws` access.
   */
  wsPlatform?: WsPlatformOptions;
}

export interface MarginNamespace {
  account: MarginAccount;
  trading: MarginTrading;
  /** Wave-6 gap closure (45 endpoints). */
  wave6: MarginWave6;
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
    return this.cached('spot', () => buildSpotSurface(this.core));
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
      wave6: new MarginWave6(this.core.http('apiRoot')),
    }));
  }

  get wallet(): Wallet {
    return this.cached('wallet', () => new Wallet(this.core.http('apiRoot')));
  }

  /**
   * Wave-6 contract-first gap closure for the Wallet product — 33 endpoints
   * added from the official Binance Postman collection (account status/info,
   * apiTradingStatus, assetDividend, custody transfers, capital config,
   * address verification, local-entity deposit/withdraw, fast-withdraw
   * switches, dust-btc, dust-convert, bnbBurn, system status, etc.).
   */
  get walletWave6(): WalletWave6 {
    return this.cached('walletWave6', () => new WalletWave6(this.core.http('apiRoot')));
  }

  get subaccount(): SubAccount {
    return this.cached('subaccount', () => new SubAccount(this.core.http('apiRoot')));
  }

  /**
   * Wave-6 contract-first gap closure for the Sub-Account product — 33
   * endpoints added from the official Binance Postman collection (managed
   * sub-account deposit/withdraw/asset/snapshot/info, futures account +
   * position risk + internal transfer + move-position, margin account
   * summary, sub-account transfer histories, transaction statistics,
   * eoptions enable, v2/v4 sub-account endpoints, IP restriction
   * management).
   */
  get subaccountWave6(): SubAccountWave6 {
    return this.cached('subaccountWave6', () => new SubAccountWave6(this.core.http('apiRoot')));
  }

  /**
   * Binance Options product surface. Distinct product family (eapi host)
   * covering market data, account/bill, order placement, MMP, and block
   * trading. Lazy — never constructed until first access.
   */
  get options(): OptionsSurface {
    return this.cached('options', () => buildOptionsSurface(this.core, () => this.optionsListenKeyValue));
  }

  /**
   * Binance Portfolio Margin product surface. Unified margin account
   * (account, UM/CM/margin sub-surfaces, portfolio configuration, listenKey).
   * Lazy — never constructed until first access.
   */
  get portfolioMargin(): PortfolioMarginSurface {
    return this.cached('portfolioMargin', () => buildPortfolioMarginSurface(this.core, () => this.pmListenKeyValue));
  }

  /**
   * Binance Portfolio Margin Pro product surface. Next-generation PM under
   * `/sapi/v1/portfolio/*` and `/sapi/v2/portfolio/*` (24 endpoints).
   */
  get portfolioMarginPro(): PortfolioMarginProSurface {
    return this.cached('portfolioMarginPro', () => buildPortfolioMarginProSurface(this.core));
  }

  /**
   * SAPI Convert product surface — RFQ, accept quote, limit orders, trade
   * flow (9 endpoints). Distinct from the Futures-hosted `/fapi/v1/convert/*`
   * surface already on `client.futures.trading`.
   */
  get convert(): ConvertSurface {
    return this.cached('convert', () => buildConvertSurface(this.core));
  }

  /** Binance Crypto Loan product surface — fixed-term (v1) + flexible (v2). */
  get cryptoLoan(): CryptoLoanSurface {
    return this.cached('cryptoLoan', () => buildCryptoLoanSurface(this.core));
  }

  /** SAPI Algo product surface — spot TWAP/VP and futures TWAP/VP. */
  get algo(): AlgoSurface {
    return this.cached('algo', () => buildAlgoSurface(this.core));
  }

  /** Dual Investment product surface — subscribe, positions, accounts. */
  get dualInvestment(): DualInvestmentSurface {
    return this.cached('dualInvestment', () => buildDualInvestmentSurface(this.core));
  }

  /** Alpha product surface — bapi-hosted public market data. */
  get alpha(): AlphaSurface {
    return this.cached('alpha', () => buildAlphaSurface(this.core));
  }

  /** Copy Trading product surface — futures lead-symbol & user-status. */
  get copyTrading(): CopyTradingSurface {
    return this.cached('copyTrading', () => buildCopyTradingSurface(this.core));
  }

  /** C2C product surface — order-match history. */
  get c2c(): C2CSurface {
    return this.cached('c2c', () => buildC2CSurface(this.core));
  }

  // ----- Contract-first generated product surfaces (Wave 5: 9 new products
  // derived from the official Binance Postman collections). Each surface is
  // a thin resource wrapper around the same HttpClient pipeline; response
  // payloads are `unknown` until a Zod schema is added (see existing
  // src/types/*.types.ts pattern for upgrading to typed responses).

  /** Fiat order history (SAPI). */
  get fiat(): FiatSurface {
    return this.cached('fiat', () => buildFiatSurface(this.core));
  }

  /** Gift Card creation / redemption (SAPI). */
  get giftCard(): GiftCardSurface {
    return this.cached('giftCard', () => buildGiftCardSurface(this.core));
  }

  /** Mining account / hash-rate resales (SAPI). */
  get mining(): MiningSurface {
    return this.cached('mining', () => buildMiningSurface(this.core));
  }

  /** NFT deposit / withdrawal / transaction history (SAPI). */
  get nft(): NftSurface {
    return this.cached('nft', () => buildNftSurface(this.core));
  }

  /** Binance Pay order / payout history (SAPI). */
  get pay(): PaySurface {
    return this.cached('pay', () => buildPaySurface(this.core));
  }

  /** Cashback / commission rebate history (SAPI). */
  get rebate(): RebateSurface {
    return this.cached('rebate', () => buildRebateSurface(this.core));
  }

  /** Simple Earn: flexible + locked products, redeem, subscribe (SAPI). */
  get simpleEarn(): SimpleEarnSurface {
    return this.cached('simpleEarn', () => buildSimpleEarnSurface(this.core));
  }

  /** Staking: ETH staking, redeem, rewards history (SAPI). */
  get staking(): StakingSurface {
    return this.cached('staking', () => buildStakingSurface(this.core));
  }

  /** VIP Loan: borrow / repay / collateral history (SAPI). */
  get vipLoan(): VipLoanSurface {
    return this.cached('vipLoan', () => buildVipLoanSurface(this.core));
  }

  /**
   * The v3 WebSocket platform: pooled connections per product family with
   * refcounted `Subscription` objects, central liveness/renewal, and
   * persistent multiplexed WS API clients — all sharing the core's
   * credentials and observability bus.
   *
   * ```ts
   * const sub = await client.ws.usdm.subscribe('btcusdt@aggTrade');
   * sub.on('message', (tick) => console.log(tick.p));
   * await client.ws.api.usdm.accountStatus(); // one persistent socket
   * ```
   */
  get ws(): WsPlatform {
    return this.core.ws;
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
    options: OptionsSurface;
    portfolioMargin: PortfolioMarginSurface;
    portfolioMarginPro: PortfolioMarginProSurface;
    convert: ConvertSurface;
    cryptoLoan: CryptoLoanSurface;
    algo: AlgoSurface;
    dualInvestment: DualInvestmentSurface;
    alpha: AlphaSurface;
    copyTrading: CopyTradingSurface;
    c2c: C2CSurface;
    fiat: FiatSurface;
    giftCard: GiftCardSurface;
    mining: MiningSurface;
    nft: NftSurface;
    pay: PaySurface;
    rebate: RebateSurface;
    simpleEarn: SimpleEarnSurface;
    staking: StakingSurface;
    vipLoan: VipLoanSurface;
  } {
    return {
      spot: this.spot,
      usdm: this.futures.usdm,
      coinm: this.futures.coinm,
      margin: this.margin,
      wallet: this.wallet,
      subaccount: this.subaccount,
      options: this.options,
      portfolioMargin: this.portfolioMargin,
      portfolioMarginPro: this.portfolioMarginPro,
      convert: this.convert,
      cryptoLoan: this.cryptoLoan,
      algo: this.algo,
      dualInvestment: this.dualInvestment,
      alpha: this.alpha,
      copyTrading: this.copyTrading,
      c2c: this.c2c,
      fiat: this.fiat,
      giftCard: this.giftCard,
      mining: this.mining,
      nft: this.nft,
      pay: this.pay,
      rebate: this.rebate,
      simpleEarn: this.simpleEarn,
      staking: this.staking,
      vipLoan: this.vipLoan,
    };
  }

  private readonly namespaces = new Map<string, unknown>();
  private listenKeyValue: string | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private coinmListenKeyValue: string | null = null;
  private coinmKeepAliveInterval: NodeJS.Timeout | null = null;
  private optionsListenKeyValue: string | null = null;
  private optionsKeepAliveInterval: NodeJS.Timeout | null = null;
  private pmListenKeyValue: string | null = null;
  private pmKeepAliveInterval: NodeJS.Timeout | null = null;

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

  /** Start the Spot user stream (WebSocket API subscription); resolves with the subscription id. */
  async startSpotUserStream(): Promise<string> {
    return String(await this.spot.wsUser.start());
  }

  closeSpotUserStream(): void {
    this.spot.wsUser.close();
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

  // ---- Wave 8: Options + Portfolio Margin user-data stream lifecycle ----

  async startOptionsUserStream(): Promise<string> {
    const { listenKey } = await this.options.userStream.createListenKey();
    this.optionsListenKeyValue = listenKey;
    this.optionsKeepAliveInterval = setInterval(() => {
      this.options.userStream.keepAliveListenKey().catch(() => {
        /* retried on next tick */
      });
    }, 30 * 60 * 1000);
    this.options.wsUser.connect();
    return listenKey;
  }

  closeOptionsUserStream(): void {
    if (this.optionsKeepAliveInterval) clearInterval(this.optionsKeepAliveInterval);
    this.optionsKeepAliveInterval = null;
    this.options.wsUser.close();
    this.options.userStream.closeListenKey().catch(() => {
      /* best-effort cleanup */
    });
    this.optionsListenKeyValue = null;
  }

  async startPortfolioMarginUserStream(): Promise<string> {
    const { listenKey } = await this.portfolioMargin.userStream.createListenKey();
    this.pmListenKeyValue = listenKey;
    this.pmKeepAliveInterval = setInterval(() => {
      this.portfolioMargin.userStream.keepAliveListenKey().catch(() => {
        /* retried on next tick */
      });
    }, 30 * 60 * 1000);
    this.portfolioMargin.wsUser.connect();
    return listenKey;
  }

  closePortfolioMarginUserStream(): void {
    if (this.pmKeepAliveInterval) clearInterval(this.pmKeepAliveInterval);
    this.pmKeepAliveInterval = null;
    this.portfolioMargin.wsUser.close();
    this.portfolioMargin.userStream.closeListenKey().catch(() => {
      /* best-effort cleanup */
    });
    this.pmListenKeyValue = null;
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
      ws: this.futures.wsPublic, // depth streams are served on the /public path
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
    options: { paper?: PaperTradingOptions; defaultBackend?: ExecutionBackend; audit?: AuditSink } = {},
  ): ExecutionGateway {
    return new ExecutionGateway({
      live: this.futures.execution,
      paperEngine: new PaperTradingEngine(options.paper),
      defaultBackend: options.defaultBackend,
      audit: options.audit,
    });
  }

  /** Snapshot of the active risk gateway's state, when `safety` was configured. */
  getRiskStatus(): ReturnType<RiskGateway['riskStatus']> | undefined {
    return this.policy instanceof RiskGateway ? this.policy.riskStatus() : undefined;
  }

  closeAllWebSockets(): void {
    this.core.closeWebSockets(); // platform pools/WS API (no-op when never built)
    this.futures.ws.close();
    this.futures.wsPublic.close();
    this.futures.wsUser.close();
    this.spot.ws.close();
    this.spot.wsUser.close();
    this.coinm.ws.close();
    this.coinm.wsUser.close();
    // Wave 8 — Options + Portfolio Margin WS cleanup.
    this.options.ws.close();
    this.options.wsUser.close();
    this.portfolioMargin.wsUser.close();
    this.closeUserStream();
    this.closeSpotUserStream();
    this.closeCoinMUserStream();
    this.closeOptionsUserStream();
    this.closePortfolioMarginUserStream();
  }

  reconnectWebSocket(target: 'ws' | 'wsUser' | 'spot' | 'spotUser' | 'coinm' | 'coinmUser' | 'options' | 'optionsUser' | 'pmUser'): void {
    if (target === 'ws') {
      this.futures.ws.reconnect();
      this.futures.wsPublic.reconnect();
    }
    else if (target === 'wsUser') this.futures.wsUser.reconnect();
    else if (target === 'spot') this.spot.ws.reconnect();
    else if (target === 'spotUser') this.spot.wsUser.reconnect();
    else if (target === 'coinm') this.coinm.ws.reconnect();
    else if (target === 'coinmUser') this.coinm.wsUser.reconnect();
    else if (target === 'options') this.options.ws.reconnect();
    else if (target === 'optionsUser') this.options.wsUser.reconnect();
    else if (target === 'pmUser') this.portfolioMargin.wsUser.reconnect();
  }

  resetReconnectAttempts(): void {
    this.futures.ws.resetReconnectAttempts();
    this.futures.wsPublic.resetReconnectAttempts();
    this.futures.wsUser.resetReconnectAttempts();
    this.spot.ws.resetReconnectAttempts();
    this.spot.wsUser.resetReconnectAttempts();
    this.coinm.ws.resetReconnectAttempts();
    this.coinm.wsUser.resetReconnectAttempts();
  }
}
