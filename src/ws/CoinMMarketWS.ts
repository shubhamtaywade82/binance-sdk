import { BaseWS, type BaseWSOptions } from './BaseWS.js';
import type { KlineInterval } from '../types/market.types.js';

export type CoinMContractType = 'perpetual' | 'current_quarter' | 'next_quarter';
export type CoinMMarkPriceSpeed = '1s' | '3s';

/**
 * COIN-M stream names mirror USD-M's naming scheme exactly, just against `dstream.binance.com`
 * and inverse-contract symbols/pairs (e.g. `btcusd_perp`, `btcusd`). The default
 * base URL uses the 2026 `/market/stream` routing path — the legacy `/stream`
 * path is being shut down alongside the USDⓈ-M one.
 */
export class CoinMMarketWS extends BaseWS {
  constructor(baseStreamUrl = 'wss://dstream.binance.com/market/stream', options?: Omit<BaseWSOptions, 'baseStreamUrl'>) {
    super({ baseStreamUrl, ...options, name: options?.name ?? 'coinmMarket' });
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

  /** All-symbols mark price stream, default 3s update speed. */
  allMarkPrices(): string {
    return '!markPrice@arr';
  }

  /** All-symbols mark price stream at the 1s update speed (Binance 2026 addition). */
  allMarkPrices1s(): string {
    return '!markPrice@arr@1s';
  }

  /**
   * Contract info stream — fires on symbol listing/delisting, contract parameter
   * updates (leverage bracket, lot size, price precision). All-market stream.
   */
  contractInfo(): string {
    return '!contractInfo';
  }

  liquidationOrder(symbol: string): string {
    return `${symbol.toLowerCase()}@forceOrder`;
  }

  allLiquidationOrders(): string {
    return '!forceOrder@arr';
  }
}
