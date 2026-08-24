import { BaseWS } from './BaseWS.js';
import type { KlineInterval } from '../types/market.types.js';

export type CoinMContractType = 'perpetual' | 'current_quarter' | 'next_quarter';
export type CoinMMarkPriceSpeed = '1s' | '3s';

/**
 * COIN-M stream names mirror USD-M's naming scheme exactly, just against `dstream.binance.com`
 * and inverse-contract symbols/pairs (e.g. `btcusd_perp`, `btcusd`).
 */
export class CoinMMarketWS extends BaseWS {
  constructor(baseStreamUrl = 'wss://dstream.binance.com/stream') {
    super({ baseStreamUrl });
  }

  kline(symbol: string, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@kline_${interval}`;
  }

  continuousKline(pair: string, contractType: CoinMContractType, interval: KlineInterval): string {
    return `${pair.toLowerCase()}_${contractType}@continuousKline_${interval}`;
  }

  indexPriceKline(pair: string, interval: KlineInterval): string {
    return `${pair.toLowerCase()}@indexPriceKline_${interval}`;
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

  allMarketTickers(): string {
    return '!ticker@arr';
  }

  miniTicker(symbol: string): string {
    return `${symbol.toLowerCase()}@miniTicker`;
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

  markPrice(symbol: string, updateSpeed: CoinMMarkPriceSpeed = '3s'): string {
    return `${symbol.toLowerCase()}@markPrice@${updateSpeed}`;
  }

  markPriceForPair(pair: string, updateSpeed: CoinMMarkPriceSpeed = '3s'): string {
    return `${pair.toLowerCase()}@markPrice@${updateSpeed}`;
  }

  liquidationOrder(symbol: string): string {
    return `${symbol.toLowerCase()}@forceOrder`;
  }

  allLiquidationOrders(): string {
    return '!forceOrder@arr';
  }
}
