export const VERSION = '3.0.0-next.1';

export { BinanceClient } from './client/BinanceClient.js';
export type { BinanceClientOptions, MarginNamespace } from './client/BinanceClient.js';
export { createSpotClient, createUSDMClient, createCoinMClient } from './client/factories.js';
export type { SpotClient, USDMClient as StandaloneUSDMClient, CoinMClient as StandaloneCoinMClient } from './client/factories.js';
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
export type { RiskGatewayOptions, RiskStatus, CircuitBreakerState } from './risk/RiskGateway.js';

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
export type { SpotSurface } from './products/spot/surface.js';
export type { CoinMSurface } from './products/coinm/surface.js';

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
export type { SpotUserWSOptions } from './ws/SpotUserWS.js';
export { FuturesMarketWS } from './ws/FuturesMarketWS.js';
export type { ContractType, MarkPriceSpeed } from './ws/FuturesMarketWS.js';
export { FuturesUserWS } from './ws/FuturesUserWS.js';
export type { FuturesUserWSOptions } from './ws/FuturesUserWS.js';
export { CoinMMarketWS } from './ws/CoinMMarketWS.js';
export type { CoinMContractType, CoinMMarkPriceSpeed } from './ws/CoinMMarketWS.js';
export { CoinMUserWS } from './ws/CoinMUserWS.js';
export type { CoinMUserWSOptions } from './ws/CoinMUserWS.js';
export { WsApi } from './ws/WsApi.js';
export type { WsApiOptions } from './ws/WsApi.js';
export { SpotWsApi } from './ws/SpotWsApi.js';
export type { SpotWsApiOptions } from './ws/SpotWsApi.js';

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
  derivedTools,
  wsTools,
  getBufferedWsEvents,
  createPaperContext,
  paperTools,
} from './tools/index.js';
export { createBinanceMcpServer } from './mcp/server.js';
