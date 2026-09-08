export const VERSION = '2.1.0';

export { BinanceClient } from './client/BinanceClient.js';
export type { BinanceClientOptions } from './client/BinanceClient.js';
export { HttpClient } from './client/HttpClient.js';
export type {
  HttpClientOptions,
  HttpClientRequestOptions,
  AuthMode,
  HttpMethod,
  SignatureAlgorithm,
} from './client/HttpClient.js';
export { resolveEnvironment } from './client/endpoints.js';
export type { Environment, Endpoints } from './client/endpoints.js';
export { Signer } from './client/Signer.js';
export type { SignerOptions } from './client/Signer.js';
export { RateLimitTracker } from './client/RateLimitTracker.js';
export type { RateLimitUsage, RateLimitTrackerOptions } from './client/RateLimitTracker.js';
export { TradingPolicy } from './client/TradingPolicy.js';
export type { TradingPolicyOptions } from './client/TradingPolicy.js';
export { RiskGateway } from './client/RiskGateway.js';
export type { RiskGatewayOptions, RiskGatewayStatus } from './client/RiskGateway.js';
export { OrderExecution } from './client/OrderExecution.js';
export type {
  OrderTradingResource,
  ReconcilableOrder,
  OrderExecutionOptions,
  SubmitOrderResult,
  SubmitOutcome,
} from './client/OrderExecution.js';
export type {
  Capability,
  Products,
  SpotProduct,
  FuturesUsdmProduct,
  CoinMProduct,
  MarginProduct,
  WalletProduct,
  SubAccountProduct,
  SpotOrderParams,
} from './client/products.js';

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
  SlippageExecutionModel,
  NoFeeModel,
  TakerMakerFeeModel,
} from './paper/execution.js';
export type {
  ExecutionModel,
  FeeModel,
  PaperFill,
  PaperOrderRequest,
  SlippageExecutionModelOptions,
  TakerMakerFeeModelOptions,
} from './paper/execution.js';

export { BaseWS, WsState } from './ws/BaseWS.js';
export type { BaseWSOptions } from './ws/BaseWS.js';
export { UserWSBase } from './ws/UserWSBase.js';
export type { UserWSBaseOptions } from './ws/UserWSBase.js';
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

export { LocalOrderBook } from './marketstate/LocalOrderBook.js';
export type {
  BookLevel,
  BookTop,
  LocalOrderBookOptions,
  OrderBookDiff,
  OrderBookSnapshot,
  OrderBookSide,
} from './marketstate/LocalOrderBook.js';
export { watchOrderBook } from './marketstate/OrderBookFeed.js';
export type { OrderBookFeed, OrderBookFeedOptions } from './marketstate/OrderBookFeed.js';

export * from './util/decimal.js';
export {
  createConsoleLogger,
  createTestLogger,
  silentLogger,
} from './util/logger.js';
export type { LogLevel, SdkLogger, ConsoleLoggerOptions } from './util/logger.js';

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
  spotTools,
  derivedTools,
  wsTools,
  getBufferedWsEvents,
  createPaperContext,
  paperTools,
} from './tools/index.js';
export { createBinanceMcpServer } from './mcp/server.js';
