import type { FuturesAccount } from '../resources/FuturesAccount.js';
import type { FuturesData } from '../resources/FuturesData.js';
import type { FuturesMarket } from '../resources/FuturesMarket.js';
import type { FuturesOps } from '../resources/FuturesOps.js';
import type { FuturesTrading } from '../resources/FuturesTrading.js';
import type { CoinMAccount } from '../resources/CoinMAccount.js';
import type { CoinMMarket } from '../resources/CoinMMarket.js';
import type { CoinMTrading } from '../resources/CoinMTrading.js';
import type { CoinMUserDataStream } from '../resources/CoinMUserDataStream.js';
import type { MarginAccount, MarginTrading } from '../resources/Margin.js';
import type { SpotAccount, SpotTrading } from '../resources/SpotTrading.js';
import type { SpotMarket } from '../resources/SpotMarket.js';
import type { SpotUserDataStream } from '../resources/SpotUserDataStream.js';
import type { SubAccount } from '../resources/SubAccount.js';
import type { UserDataStream } from '../resources/UserDataStream.js';
import type { Wallet } from '../resources/Wallet.js';
import type { CoinMMarketWS } from '../ws/CoinMMarketWS.js';
import type { CoinMUserWS } from '../ws/CoinMUserWS.js';
import type { FuturesMarketWS } from '../ws/FuturesMarketWS.js';
import type { FuturesUserWS } from '../ws/FuturesUserWS.js';
import type { SpotMarketWS } from '../ws/SpotMarketWS.js';
import type { SpotUserWS } from '../ws/SpotUserWS.js';
import type { SpotWsApi } from '../ws/SpotWsApi.js';
import type { WsApi } from '../ws/WsApi.js';
import type { OrderExecution } from './OrderExecution.js';
import type { OrderBookFeed, OrderBookFeedOptions } from '../marketstate/OrderBookFeed.js';
import type { NewOrderAck, Order, CreateOrderParams } from '../types/trading.types.js';
import type { SpotOrder } from '../types/spot.types.js';

/**
 * Capabilities a product surface can expose. The architecture is
 * Core → Product → Capability → Endpoint: products bind capabilities to
 * Binance product surfaces, so new products (options, portfolio margin, ...)
 * compose from the same vocabulary instead of growing ad-hoc client fields.
 */
export type Capability =
  | 'marketData'
  | 'analytics'
  | 'trading'
  | 'account'
  | 'compositeOps'
  | 'userStream'
  | 'wsStreams'
  | 'wsApi'
  | 'executionGuard'
  | 'orderBook';

export interface ProductCapabilities {
  readonly id: string;
  readonly capabilities: readonly Capability[];
}

export type WatchOrderBook = (symbol: string, options?: Partial<OrderBookFeedOptions>) => Promise<OrderBookFeed>;

/** Spot product surface: client.products.spot === client.spot === client.futures.usdm-adjacent alias target. */
export interface SpotProduct extends ProductCapabilities {
  id: 'spot';
  market: SpotMarket;
  account: SpotAccount;
  trading: SpotTrading;
  userStream: SpotUserDataStream;
  ws: SpotMarketWS;
  wsUser: SpotUserWS;
  wsApi: SpotWsApi;
  /** Idempotent, reconciled order submission. */
  execution: OrderExecution<SpotOrderParams, SpotOrder>;
  /** Live-maintained L2 order book (snapshot + diff stream). */
  watchOrderBook: WatchOrderBook;
}

/** USD-M futures product surface. */
export interface FuturesUsdmProduct extends ProductCapabilities {
  id: 'futures.usdm';
  market: FuturesMarket;
  data: FuturesData;
  account: FuturesAccount;
  trading: FuturesTrading;
  ops: FuturesOps;
  userStream: UserDataStream;
  ws: FuturesMarketWS;
  wsUser: FuturesUserWS;
  wsApi: WsApi;
  execution: OrderExecution<CreateOrderParams, NewOrderAck | Order>;
  watchOrderBook: WatchOrderBook;
  /** Ergonomic alias: futures.usdm === futures. */
  usdm: FuturesUsdmProduct;
  /** Ergonomic alias: futures.coinm === the COIN-M surface (client.coinm). */
  coinm: CoinMProduct;
}

/** COIN-M futures product surface. */
export interface CoinMProduct extends ProductCapabilities {
  id: 'futures.coinm';
  market: CoinMMarket;
  account: CoinMAccount;
  trading: CoinMTrading;
  userStream: CoinMUserDataStream;
  ws: CoinMMarketWS;
  wsUser: CoinMUserWS;
}

/** Margin product surface. */
export interface MarginProduct extends ProductCapabilities {
  id: 'margin';
  account: MarginAccount;
  trading: MarginTrading;
}

/**
 * Wallet product surface: the Wallet resource itself, carrying product
 * metadata. (Interfaces extending classes capture the full instance shape
 * including prototype methods.)
 */
export interface WalletProduct extends ProductCapabilities, Wallet {}

/** Sub-account product surface: the SubAccount resource plus metadata. */
export interface SubAccountProduct extends ProductCapabilities, SubAccount {}

/** Spot order parameters accepted by OrderExecution (spot uses a loose param bag). */
export interface SpotOrderParams {
  symbol: string;
  side: string;
  type: string;
  newClientOrderId?: string;
  [key: string]: unknown;
}

/** The product registry: BinanceClient → products → capability → endpoint. */
export interface Products {
  spot: SpotProduct;
  futures: {
    usdm: FuturesUsdmProduct;
    coinm: CoinMProduct;
  };
  margin: MarginProduct;
  wallet: WalletProduct;
  subaccount: SubAccountProduct;
}

export const SPOT_CAPABILITIES: readonly Capability[] = [
  'marketData', 'trading', 'account', 'userStream', 'wsStreams', 'wsApi', 'executionGuard', 'orderBook',
] as const;

export const FUTURES_USDM_CAPABILITIES: readonly Capability[] = [
  'marketData', 'analytics', 'trading', 'account', 'compositeOps', 'userStream', 'wsStreams', 'wsApi', 'executionGuard', 'orderBook',
] as const;

export const FUTURES_COINM_CAPABILITIES: readonly Capability[] = [
  'marketData', 'trading', 'account', 'userStream', 'wsStreams',
] as const;

export const MARGIN_CAPABILITIES: readonly Capability[] = ['account', 'trading'] as const;
export const WALLET_CAPABILITIES: readonly Capability[] = ['account'] as const;
export const SUBACCOUNT_CAPABILITIES: readonly Capability[] = ['account'] as const;

export type { SpotMarket, Wallet, SubAccount, MarginAccount, MarginTrading };
