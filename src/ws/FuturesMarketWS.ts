import { BaseWS, type BaseWSOptions } from './BaseWS.js';
import type { SdkLogger } from '../util/logger.js';
import type { KlineInterval } from '../types/market.types.js';

export type ContractType = 'perpetual' | 'current_quarter' | 'next_quarter';
export type MarkPriceSpeed = '1s' | '3s';

export class FuturesMarketWS extends BaseWS {
  constructor(
    baseStreamUrl: string | BaseWSOptions = 'wss://fstream.binance.com/stream',
    logger?: SdkLogger,
  ) {
    super(
      typeof baseStreamUrl === 'string'
        ? { baseStreamUrl, logger }
        : { logger, ...baseStreamUrl },
    );
  }

  kline(symbol: string, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@kline_${interval}`;
  }

  continuousKline(symbol: string, contractType: ContractType, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@continuousKline_${contractType}_${interval}`;
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

  depthDiffSpeed(symbol: string, updateSpeed: '100ms' | '250ms' | '500ms'): string {
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

  allMarkPrices(): string {
    return '!markPrice@arr';
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
}
