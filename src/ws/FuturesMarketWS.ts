import { BaseWS, type BaseWSOptions } from './BaseWS.js';
import type { KlineInterval } from '../types/market.types.js';

export type ContractType = 'perpetual' | 'current_quarter' | 'next_quarter';
export type MarkPriceSpeed = '1s' | '3s';

export class FuturesMarketWS extends BaseWS {
  constructor(
    baseStreamUrl = 'wss://fstream.binance.com/market/stream',
    options?: Omit<BaseWSOptions, 'baseStreamUrl'>,
  ) {
    super({ baseStreamUrl, ...options, name: options?.name ?? 'futuresMarket' });
  }

  kline(symbol: string, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@kline_${interval}`;
  }

  /**
   * Continuous contract kline stream.
   *
   * Binance's USDⓈ-M stream-name format places the contract type *between* the
   * symbol and the stream kind: `<symbol>_<contractType>@continuousKline_<interval>`.
   * The previous implementation emitted `<symbol>@continuousKline_<contractType>_<interval>`,
   * which Binance does not route — see https://binance-docs.github.io/apidocs/futures/en/#continuous-contract-kline-streams
   */
  continuousKline(symbol: string, contractType: ContractType, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}_${contractType}@continuousKline_${interval}`;
  }

  indexPriceKline(symbol: string, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@indexPriceKline_${interval}`;
  }

  markPriceKline(symbol: string, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@markPriceKline_${interval}`;
  }

  aggTrade(symbol: string): string {
    return `${symbol.toLowerCase()}@aggTrade`;
  }

  trade(symbol: string): string {
    return `${symbol.toLowerCase()}@trade`;
  }

  depth(symbol: string, level: 5 | 10 | 20 = 20): string {
    return `${symbol.toLowerCase()}@depth${level}`;
  }

  depthDiff(symbol: string): string {
    return `${symbol.toLowerCase()}@depth`;
  }

  depthDiffSpeed(symbol: string, updateSpeed: '100ms' | '500ms'): string {
    return `${symbol.toLowerCase()}@depth@${updateSpeed}`;
  }

  ticker(symbol: string): string {
    return `${symbol.toLowerCase()}@ticker`;
  }

  rollingWindowTicker(symbol: string, window: '1h' | '4h' | '1d' = '1h'): string {
    return `${symbol.toLowerCase()}@ticker_${window}`;
  }

  allRollingWindowTickers(window: '1h' | '4h' | '1d' = '1h'): string {
    return `!ticker_${window}@arr`;
  }

  allMarketTickers(): string {
    return '!ticker@arr';
  }

  allBookTickers(): string {
    return '!bookTicker';
  }

  miniTicker(symbol: string): string {
    return `${symbol.toLowerCase()}@miniTicker`;
  }

  allMiniTickers(): string {
    return '!miniTicker@arr';
  }

  markPrice(symbol: string, updateSpeed: MarkPriceSpeed = '3s'): string {
    return `${symbol.toLowerCase()}@markPrice@${updateSpeed}`;
  }

  /** All-symbols mark price stream, default 3s update speed. */
  allMarkPrices(): string {
    return '!markPrice@arr';
  }

  /** All-symbols mark price stream at the 1s update speed (Binance 2026 addition). */
  allMarkPrices1s(): string {
    return '!markPrice@arr@1s';
  }

  bookTicker(symbol: string): string {
    return `${symbol.toLowerCase()}@bookTicker`;
  }

  liquidationOrder(symbol: string): string {
    return `${symbol.toLowerCase()}@forceOrder`;
  }

  allLiquidationOrders(): string {
    return '!forceOrder@arr';
  }

  compositeIndex(symbol: string): string {
    return `${symbol.toLowerCase()}@compositeIndex`;
  }

  assetIndex(symbol: string): string {
    return `${symbol.toLowerCase()}@assetIndex`;
  }

  allAssetIndices(): string {
    return '!assetIndex@arr';
  }

  /**
   * Contract info stream — fires on symbol listing/delisting, contract parameter
   * updates (leverage bracket, lot size, price precision). All-market stream.
   */
  contractInfo(): string {
    return '!contractInfo';
  }

  /**
   * RPI (Retail Price Improvement) order-book depth stream, 500ms diff updates.
   * Complements the REST `/fapi/v1/rpiDepth` endpoint.
   */
  rpiDepth(symbol: string): string {
    return `${symbol.toLowerCase()}@rpiDepth@500ms`;
  }

  /**
   * Trading session stream — emits session open/close and phase transitions
   * (introduced by Binance in December 2025 alongside `/fapi/v1/tradingSchedule`).
   * No symbol prefix: the stream reports the platform-wide session state.
   */
  tradingSession(): string {
    return 'tradingSession';
  }
}
