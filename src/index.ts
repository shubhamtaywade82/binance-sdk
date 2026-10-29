export { VERSION } from './version.js';

export { BinanceClient } from './client/BinanceClient.js';
export type { BinanceClientOptions, MarginNamespace } from './client/BinanceClient.js';
export { createSpotClient, createUSDMClient, createCoinMClient } from './client/factories.js';
export type {
  SpotClient as StandaloneSpotClient,
  USDMClient as StandaloneUSDMClient,
  CoinMClient as StandaloneCoinMClient,
} from './client/factories.js';
export { HttpClient } from './client/HttpClient.js';
export type { HttpClientOptions, AuthMode, HttpMethod, SignatureAlgorithm, RetryPolicy } from './client/HttpClient.js';
export { resolveEnvironment } from './client/endpoints.js';
export type { Environment, Endpoints } from './client/endpoints.js';
export { Signer } from './client/Signer.js';
export type { SignerOptions } from './client/Signer.js';
export { RateLimitTracker } from './client/RateLimitTracker.js';
export type { RateLimitUsage, RateLimitTrackerOptions } from './client/RateLimitTracker.js';
export { TradingPolicy } from './client/TradingPolicy.js';
export type { TradingPolicyOptions } from './client/TradingPolicy.js';
export { RiskGateway } from './risk/RiskGateway.js';
export type { RiskGatewayOptions, RiskStatus, CircuitBreakerState, PersistedRiskState } from './risk/RiskGateway.js';
export { RealizedPnlFeed } from './risk/RealizedPnlFeed.js';
export type { RealizedPnlFeedOptions } from './risk/RealizedPnlFeed.js';

// ---- Core: exact decimal math, observability, lossless JSON ----
export { Decimal, dec, sum, vwap } from './core/decimal.js';
export type { DecimalInput } from './core/decimal.js';
export { EventBus, forwardEventsToLogger } from './core/events.js';
export type { SdkEvent, SdkEventListener, EventBusOptions, SdkLogger } from './core/events.js';
export { parseJsonLossless, parseJsonLosslessAs, normalizeIntStrings } from './core/json.js';

// ---- v3 Foundation: CoreContext, Credentials, product boundary ----
export { CoreContext } from './core/context.js';
export type { RestHost, CoreTransportOptions } from './core/context.js';
export { Credentials } from './core/credentials.js';
export type { ProductId, ProductClient, ProductFactory } from './products/types.js';
export { isProductClient } from './products/types.js';
export { USDMClient } from './products/usdm/USDMClient.js';
export type { UsdmSurface, FuturesNamespace } from './products/usdm/namespace.js';
export { SpotClient } from './products/spot/SpotClient.js';
export type { SpotSurface } from './products/spot/surface.js';
export { CoinMClient } from './products/coinm/CoinMClient.js';
export type { CoinMSurface } from './products/coinm/surface.js';

// ---- New product surfaces (gap closure) ----
export { OptionsClient } from './products/options/OptionsClient.js';
export type { OptionsSurface } from './products/options/surface.js';
export { PortfolioMarginClient } from './products/portfolio/PortfolioMarginClient.js';
export type { PortfolioMarginSurface } from './products/portfolio/surface.js';
export { PortfolioMarginProClient } from './products/portfolioPro/PortfolioMarginProClient.js';
export type { PortfolioMarginProSurface } from './products/portfolioPro/surface.js';
export { ConvertClient } from './products/convert/ConvertClient.js';
export type { ConvertSurface } from './products/convert/surface.js';
export { CryptoLoanClient } from './products/cryptoLoan/CryptoLoanClient.js';
export type { CryptoLoanSurface } from './products/cryptoLoan/surface.js';
export { AlgoClient } from './products/algo/AlgoClient.js';
export type { AlgoSurface } from './products/algo/surface.js';
export { DualInvestmentClient } from './products/dualInvestment/DualInvestmentClient.js';
export type { DualInvestmentSurface } from './products/dualInvestment/surface.js';
export { AlphaClient } from './products/alpha/AlphaClient.js';
export type { AlphaSurface } from './products/alpha/surface.js';
export { CopyTradingClient } from './products/copyTrading/CopyTradingClient.js';
export type { CopyTradingSurface } from './products/copyTrading/surface.js';
export { C2CClient } from './products/c2c/C2CClient.js';
export type { C2CSurface } from './products/c2c/surface.js';

// ---- Contract-first generated product surfaces (Wave 5: 9 new products
// derived from the official Binance Postman collections at
// https://github.com/binance/binance-api-postman). ----
export { FiatClient } from './products/fiat/FiatClient.js';
export type { FiatSurface } from './products/fiat/surface.js';
export { FiatResource } from './resources/FiatResource.js';
export { GiftCardClient } from './products/giftCard/GiftCardClient.js';
export type { GiftCardSurface } from './products/giftCard/surface.js';
export { GiftCardResource } from './resources/GiftCardResource.js';
export { MiningClient } from './products/mining/MiningClient.js';
export type { MiningSurface } from './products/mining/surface.js';
export { MiningResource } from './resources/MiningResource.js';
export { NftClient } from './products/nft/NftClient.js';
export type { NftSurface } from './products/nft/surface.js';
export { NftResource } from './resources/NftResource.js';
export { PayClient } from './products/pay/PayClient.js';
export type { PaySurface } from './products/pay/surface.js';
export { PayResource } from './resources/PayResource.js';
export { RebateClient } from './products/rebate/RebateClient.js';
export type { RebateSurface } from './products/rebate/surface.js';
export { RebateResource } from './resources/RebateResource.js';
export { SimpleEarnClient } from './products/simpleEarn/SimpleEarnClient.js';
export type { SimpleEarnSurface } from './products/simpleEarn/surface.js';
export { SimpleEarnResource } from './resources/SimpleEarnResource.js';
export { StakingClient } from './products/staking/StakingClient.js';
export type { StakingSurface } from './products/staking/surface.js';
export { StakingResource } from './resources/StakingResource.js';
export { VipLoanClient } from './products/vipLoan/VipLoanClient.js';
export type { VipLoanSurface } from './products/vipLoan/surface.js';
export { VipLoanResource } from './resources/VipLoanResource.js';

// ---- Wave 6 contract-first gap closure: 188 endpoints across 7 laggard
// products (spot, options, portfolioPro, portfolio, margin, wallet,
// subaccount). Each Wave-6 resource class lives alongside its
// hand-curated sibling so the hand-written Zod schemas stay intact. ----
export { SpotWave6 } from './resources/SpotWave6.js';
export { OptionsWave6 } from './resources/OptionsWave6.js';
export { PortfolioMarginProWave6 } from './resources/PortfolioMarginProWave6.js';
export { PortfolioMarginWave6 } from './resources/PortfolioMarginWave6.js';
export { MarginWave6 } from './resources/MarginWave6.js';
export { WalletWave6 } from './resources/WalletWave6.js';
export { SubAccountWave6 } from './resources/SubAccountWave6.js';

// ---- Execution: idempotent placement + reconciliation ----
export { ExecutionManager } from './execution/ExecutionManager.js';
export type { ExecutionManagerOptions } from './execution/types.js';
export type { Execution, ExecutionFill, ReconciliationState } from './execution/types.js';
export { ExecutionUnknownError } from './execution/types.js';
export { FuturesExecutionAdapter, SpotExecutionAdapter, isExecutionAdapter } from './execution/adapter.js';
export type {
  ExecutionAdapter,
  ExecutionReportShape,
  OrderShape,
  OrderKey,
  UserStreamLike,
} from './execution/adapter.js';
export { PaperExecutionAdapter } from './execution/paper.js';
export { ExecutionGateway } from './execution/Gateway.js';
export type { ExecutionBackend, ExecutionGatewayOptions } from './execution/Gateway.js';
// v3 execution audit sink (M6)
export {
  InMemoryAuditSink,
  FanOutAuditSink,
  StreamAuditSink,
  auditRecordFromExecution,
} from './execution/AuditSink.js';
export type {
  AuditSink,
  AuditRecord,
  AuditAction,
  AuditOutcome,
} from './execution/AuditSink.js';

// ---- State: local L2 order books ----
export { OrderBook } from './state/OrderBook.js';
export type {
  BookLevel,
  BookSnapshotInput,
  DiffInput,
  OrderBookMetrics,
  RawLevel,
} from './state/OrderBook.js';
export { OrderBookEngine } from './state/OrderBookEngine.js';
export type { OrderBookEngineOptions } from './state/OrderBookEngine.js';

// v3 state platform: managed local L2 books
export { ManagedBook } from './state/platform/ManagedBook.js';
export type {
  ManagedBookOptions,
  ManagedBookState,
  BookUpdateEvent,
  BookSyncEvent,
} from './state/platform/ManagedBook.js';
export { BookEngine } from './state/platform/BookEngine.js';
export type { BookEngineOptions } from './state/platform/BookEngine.js';

// ---- Registry: endpoint maps ----
export {
  ENDPOINT_REGISTRY,
  listEndpoints,
  findEndpoint,
  endpointCounts,
} from './registry/endpoints.js';
export type { EndpointEntry, EndpointAuth, EndpointMethod, EndpointQuery } from './registry/endpoints.js';

// ---- Contracts: security schemes, weights, canonical paths ----
export {
  canonicalPath,
  contractFor,
  describeContract,
  findContract,
  getContract,
} from './contracts/index.js';
export type {
  EndpointContract,
  EndpointSecurityScheme,
  HttpContractMeta,
} from './contracts/index.js';

export { MarketDataBase } from './resources/MarketDataBase.js';
export { SpotMarket } from './resources/SpotMarket.js';
export { SpotAccount, SpotTrading } from './resources/SpotTrading.js';
export { SpotUserDataStream } from './resources/SpotUserDataStream.js';
export { FuturesMarket } from './resources/FuturesMarket.js';
export { FuturesData } from './resources/FuturesData.js';
export type { FuturesDataEndpoints } from './resources/FuturesData.js';
export { FuturesAccount } from './resources/FuturesAccount.js';
export { FuturesTrading } from './resources/FuturesTrading.js';
export { FuturesOps } from './resources/FuturesOps.js';
export type {
  SizePositionParams,
  PositionSizing,
  ClosePositionParams,
  BracketOrderParams,
} from './resources/FuturesOps.js';
export { UserDataStream } from './resources/UserDataStream.js';
export { CoinMMarket } from './resources/CoinMMarket.js';
export { CoinMAccount } from './resources/CoinMAccount.js';
export { CoinMTrading } from './resources/CoinMTrading.js';
export { CoinMUserDataStream } from './resources/CoinMUserDataStream.js';
export { MarginAccount, MarginTrading } from './resources/Margin.js';
export { Wallet } from './resources/Wallet.js';
export { SubAccount } from './resources/SubAccount.js';

// ---- New resources (gap closure) ----
export { CoinMData } from './resources/CoinMData.js';
export { OptionsMarket } from './resources/OptionsMarket.js';
export { OptionsAccount } from './resources/OptionsAccount.js';
export { OptionsTrading } from './resources/OptionsTrading.js';
export { OptionsMmp } from './resources/OptionsMmp.js';
export { OptionsBlockTrading } from './resources/OptionsBlockTrading.js';
export { OptionsUserDataStream } from './resources/OptionsUserDataStream.js';
export { PortfolioMarginAccount } from './resources/PortfolioMarginAccount.js';
export { PortfolioMarginUm } from './resources/PortfolioMarginUm.js';
export { PortfolioMarginCm } from './resources/PortfolioMarginCm.js';
export { PortfolioMarginMargin } from './resources/PortfolioMarginMargin.js';
export { PortfolioMarginPortfolio } from './resources/PortfolioMarginPortfolio.js';
export { PortfolioMarginUserDataStream } from './resources/PortfolioMarginUserDataStream.js';
export { PortfolioMarginPro } from './resources/PortfolioMarginPro.js';
export { Convert } from './resources/Convert.js';
export { CryptoLoan } from './resources/CryptoLoan.js';
export { Algo, AlgoFutures, AlgoSpot } from './resources/Algo.js';
export { DualInvestment } from './resources/DualInvestment.js';
export { Alpha } from './resources/Alpha.js';
export { CopyTrading } from './resources/CopyTrading.js';
export { C2C } from './resources/C2C.js';

export { PaperTradingEngine } from './paper/PaperTradingEngine.js';
export type {
  PaperAccount,
  PaperOrder,
  PaperPosition,
  PaperPositionSide,
  PaperTradingOptions,
} from './paper/PaperTradingEngine.js';
export {
  InstantFillModel,
  SlippageModel,
  PartialFillModel,
  OrderBookModel,
  LatencyModel,
  CompositeModel,
  TakerMakerFeeModel,
  BinanceUsdmFeeModel,
} from './paper/models.js';
export type {
  ExecutionModel,
  ExecutionContext,
  ExecutionQuote,
  FeeModel,
  FeeQuote,
  BookView,
} from './paper/models.js';

export { BaseWS } from './ws/BaseWS.js';
export type { BaseWSOptions, WsConnectionState } from './ws/BaseWS.js';
export { WsConnection } from './ws/WsConnection.js';
export type { WsConnectionOptions } from './ws/WsConnection.js';
export { SpotMarketWS } from './ws/SpotMarketWS.js';
export { SpotUserWS } from './ws/SpotUserWS.js';
export type { SpotUserWSOptions, SpotUserDataSigner } from './ws/SpotUserWS.js';
export { FuturesMarketWS } from './ws/FuturesMarketWS.js';
export type { ContractType, MarkPriceSpeed } from './ws/FuturesMarketWS.js';
export { FuturesUserWS } from './ws/FuturesUserWS.js';
export type { FuturesUserWSOptions } from './ws/FuturesUserWS.js';
export { CoinMMarketWS } from './ws/CoinMMarketWS.js';
export type { CoinMContractType, CoinMMarkPriceSpeed } from './ws/CoinMMarketWS.js';
export { CoinMUserWS } from './ws/CoinMUserWS.js';
export type { CoinMUserWSOptions } from './ws/CoinMUserWS.js';
// Wave 8 — Options + Portfolio Margin WebSocket streams.
export { OptionsMarketWS } from './ws/OptionsMarketWS.js';
export { OptionsUserWS } from './ws/OptionsUserWS.js';
export type { OptionsUserWSOptions } from './ws/OptionsUserWS.js';
export { PortfolioMarginUserWS } from './ws/PortfolioMarginUserWS.js';
export type { PortfolioMarginUserWSOptions } from './ws/PortfolioMarginUserWS.js';
export { WsApi } from './ws/WsApi.js';
export type { WsApiOptions } from './ws/WsApi.js';
export { SpotWsApi } from './ws/SpotWsApi.js';
export type { SpotWsApiOptions } from './ws/SpotWsApi.js';

// v3 WebSocket platform
export { WsPlatform, createWsPlatform, familyLimits } from './ws/platform/WsPlatform.js';
export type { WsPlatformOptions, WsFamilyStreams, WsApiSurface } from './ws/platform/WsPlatform.js';
export { Subscription } from './ws/platform/Subscription.js';
export type { SubscriptionState } from './ws/platform/types.js';
export { FamilyConnectionPool } from './ws/platform/ConnectionPool.js';
export type { FamilyConnectionPoolOptions, PooledConnection } from './ws/platform/ConnectionPool.js';
export { FamilySubscriptionRegistry } from './ws/platform/SubscriptionRegistry.js';
export { WsHeartbeat } from './ws/platform/Heartbeat.js';
export type { WsHeartbeatOptions } from './ws/platform/Heartbeat.js';
export { RenewalController } from './ws/platform/RenewalController.js';
export type { RenewalControllerOptions, RenewableConnection } from './ws/platform/RenewalController.js';
export { exponentialBackoff, fixedBackoff, linearBackoff } from './ws/platform/ReconnectPolicy.js';
export type { ExponentialBackoffOptions } from './ws/platform/ReconnectPolicy.js';
export { WsApiClient } from './ws/platform/WsApiClient.js';
export type { WsApiClientOptions, WsApiClientState, WsRequestOptions } from './ws/platform/WsApiClient.js';
export { FuturesWsApiClient, SpotWsApiClient } from './ws/platform/ProductWsApi.js';
export {
  WS_FAMILY_LIMITS,
  WS_PLATFORM_DEFAULTS,
} from './ws/platform/types.js';
export type {
  WsFamily,
  WsFamilyLimits,
  WsConnectionStats,
  WsPlatformStats,
  SubscribeOptions,
  ReconnectPolicy,
} from './ws/platform/types.js';

// v3 execution platform
export { ExecutionPlatform } from './execution/platform/ExecutionPlatform.js';
export type { ExecutionPlatformOptions, UserSessionTuning } from './execution/platform/ExecutionPlatform.js';
export { OrderTracker } from './execution/platform/OrderTracker.js';
export type { OrderTrackerOptions } from './execution/platform/OrderTracker.js';
export { PositionTracker } from './execution/platform/PositionTracker.js';
export type { PositionTrackerOptions } from './execution/platform/PositionTracker.js';
export { UserStreamSession } from './execution/platform/UserStreamSession.js';
export type { UserStreamSessionOptions } from './execution/platform/UserStreamSession.js';
export { classifyRetrySafety, isRetrySafety } from './execution/platform/RetrySafety.js';
export {
  EXECUTION_PLATFORM_DEFAULTS,
  isTerminalOrderStatus,
} from './execution/platform/types.js';
export type {
  OrderStatus,
  OrderRecord,
  OrderUpdate,
  PositionRecord,
  PositionUpdate,
  UserSessionState,
  ListenKeyApi,
  RetrySafety,
  RetryClassification,
} from './execution/platform/types.js';
export { createUserEventParser } from './execution/platform/normalize.js';
export type { UserEventParser } from './execution/platform/normalize.js';
export { createPaperExecutionPlatform } from './execution/platform/PaperBackend.js';
export type {
  PaperExecutionPlatformOptions,
  PaperExecutionPlatform,
} from './execution/platform/PaperBackend.js';
export { PaperSession, paperOrderTradeUpdateFrame, paperAccountUpdateFrame, decimalString } from './execution/platform/PaperSession.js';
export type { PaperSessionOptions } from './execution/platform/PaperSession.js';
export {
  orderShapeFromUsdmOpenOrder,
  orderShapeFromSpotOpenOrder,
  positionUpdatesFromPositionRisk,
  reconcileExecutionPlatform,
} from './execution/platform/Reconciler.js';
export type { ReconcileOptions, ReconcileTarget } from './execution/platform/Reconciler.js';
export type { PaperBackendOptions, PlatformUserSession } from './execution/platform/ExecutionPlatform.js';
export type { ReconciliationSummary } from './execution/platform/types.js';

export * from './types/market.types.js';
export * from './types/filters.types.js';
export * from './types/futures.types.js';
export * from './types/spot.types.js';
export * from './types/ws.types.js';
export * from './types/account.types.js';
export * from './types/trading.types.js';
export * from './types/userdata.types.js';
export * from './types/coinm.types.js';
export * from './types/margin.types.js';
export * from './types/wallet.types.js';
export * from './types/subaccount.types.js';
export * from './errors/index.js';

export {
  createFuturesToolkit,
  toolkitToFormats,
  type FuturesToolkit,
  type FuturesToolkitOptions,
} from './tools/index.js';
export type {
  ToolDefinition,
  ToolContext,
} from './tools/types.js';
export {
  toJsonSchema,
  toOpenAITool,
  toAnthropicTool,
  toMCPTool,
  toToolList,
  textResult,
} from './tools/types.js';
export {
  marketDataTools,
  accountTools,
  tradingTools,
  executionTools,
  spotTools,
  newProductsTools,
  derivedTools,
  wsTools,
  getBufferedWsEvents,
  createPaperContext,
  paperTools,
} from './tools/index.js';
export { createBinanceMcpServer } from './mcp/server.js';

// v3 audit remediation: pluggable transport + atomic cancel-replace + Ed25519 session
export type {
  IExecutionTransport,
  OrderPlacementParams,
  OrderExecutionResult,
  OrderCancelResult,
  OrderSide as TransportOrderSide,
  OrderType as TransportOrderType,
  SelfTradePreventionMode,
} from './execution/ITransport.js';
export { LiveBinanceTransport, PaperBrokerTransport } from './execution/Transports.js';
export {
  AtomicOrderManager,
  type CancelReplaceParams,
  type CancelReplaceResult,
  type CancelReplaceMode,
  type ReplaceOrderType,
  type CancelReplaceTransportCall,
} from './execution/AtomicOrderManager.js';

// v3 audit remediation: Ed25519 session.logon handshaker
export {
  WsSession,
  type WsSessionOptions,
  type WsSessionTransport,
  type SessionLogonResponse,
  type SessionStatusResponse,
  type SessionLogoutResponse,
  type SessionAuthMethod,
  newSessionRequestId,
} from './ws/platform/WsSession.js';

// Agentic futures trading layer: watchlist scanner, regime classifier,
// confluence scorer and risk-gated execution helpers (live + paper).
export * from './agent/index.js';
