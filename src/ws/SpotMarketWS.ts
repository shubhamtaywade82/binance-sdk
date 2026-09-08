import { BaseWS, type BaseWSOptions } from './BaseWS.js';
import type { SdkLogger } from '../util/logger.js';
import type { KlineInterval } from '../types/market.types.js';

export class SpotMarketWS extends BaseWS {
  constructor(
    baseStreamUrl: string | BaseWSOptions = 'wss://stream.binance.com:9443/stream',
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

  depthDiffSpeed(symbol: string, updateSpeed: '100ms' | '1000ms'): string {
    return `${symbol.toLowerCase()}@depth@${updateSpeed}`;
  }

  avgPrice(symbol: string): string {
    return `${symbol.toLowerCase()}@avgPrice`;
  }

  ticker(symbol: string): string {
    return `${symbol.toLowerCase()}@ticker`;
  }

  rollingWindowTicker(
    symbol: string,
    window: '1h' | '4h' | '1d' | '7d' | '30d' = '1h',
  ): string {
    return `${symbol.toLowerCase()}@ticker_${window}`;
  }

  allRollingWindowTickers(window: '1h' | '4h' | '1d' | '7d' | '30d' = '1h'): string {
    return `!ticker_${window}@arr`;
  }

  miniTicker(symbol: string): string {
    return `${symbol.toLowerCase()}@miniTicker`;
  }

  allMarketTickers(): string {
    return '!ticker@arr';
  }

  allMiniTickers(): string {
    return '!miniTicker@arr';
  }

  bookTicker(symbol: string): string {
    return `${symbol.toLowerCase()}@bookTicker`;
  }

  allBookTickers(): string {
    return '!bookTicker';
  }
}
