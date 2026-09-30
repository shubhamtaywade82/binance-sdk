import { BaseWS, type BaseWSOptions } from './BaseWS.js';
import type { KlineInterval } from '../types/market.types.js';

export type ContractType = 'perpetual' | 'current_quarter' | 'next_quarter';
export type MarkPriceSpeed = '1s' | '3s';

/**
 * Binance routes USDⓈ-M market streams over two URL paths (legacy
 * `wss://fstream.binance.com/stream` was decommissioned on 2026-04-23):
 *
 *  - `public` — order-book data: book tickers, partial/diff depth, RPI depth;
 *  - `market` — every other market stream (trades, klines, tickers, mark
 *    price, liquidations, index, contract info, trading session).
 *
 * A stream subscribed on the wrong path is not delivered, so the route is
 * derived from the stream name.
 */
export type FuturesStreamRoute = 'public' | 'market';

/** Which URL path carries `stream` (`public` for order-book streams, else `market`). */
export function futuresStreamRoute(stream: string): FuturesStreamRoute {
  if (/(^|[@!])bookTicker$/.test(stream)) return 'public';
  if (/@(depth\d*|rpiDepth)(@\d+ms)?$/.test(stream)) return 'public';
  return 'market';
}

function routeOfUrl(url: string): FuturesStreamRoute | null {
  if (/\/public(\/|$)/.test(url)) return 'public';
  if (/\/market(\/|$)/.test(url)) return 'market';
  return null;
}

export class FuturesMarketWS extends BaseWS {
  private readonly route: FuturesStreamRoute | null;

  /**
   * @param baseStreamUrl combined-stream URL *including the route path*
   *   (`…/market/stream` or `…/public/stream`). Connections whose URL names a
   *   route reject streams that belong to the other one.
   */
  constructor(baseStreamUrl = 'wss://fstream.binance.com/market/stream', options?: Omit<BaseWSOptions, 'baseStreamUrl'>) {
    super({ baseStreamUrl, ...options, name: options?.name ?? 'futuresMarket' });
    this.route = routeOfUrl(baseStreamUrl);
  }

  override subscribe(streams: string[]): Promise<void> {
    const route = this.route;
    if (route) {
      const wrong = streams.filter((stream) => futuresStreamRoute(stream) !== route);
      if (wrong.length) {
        return Promise.reject(
          new Error(
            `[${this.label}] stream(s) ${wrong.join(', ')} are not served on the /${route} path; ` +
              `use the /${route === 'public' ? 'market' : 'public'} connection (client.ws.usdm routes automatically).`,
          ),
        );
      }
    }
    return super.subscribe(streams);
  }

  kline(symbol: string, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@kline_${interval}`;
  }

  /** `<pair>_<contractType>@continuousKline_<interval>` (e.g. `btcusdt_perpetual@continuousKline_1m`). */
  continuousKline(pair: string, contractType: ContractType, interval: KlineInterval): string {
    return `${pair.toLowerCase()}_${contractType}@continuousKline_${interval}`;
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

  /** All-market mark price array; `3s` (default) is `!markPrice@arr`, `1s` is `!markPrice@arr@1s`. */
  allMarkPrices(updateSpeed: MarkPriceSpeed = '3s'): string {
    return updateSpeed === '1s' ? '!markPrice@arr@1s' : '!markPrice@arr';
  }

  /** RPI diff. book depth (500ms). Served on the `/public` path. */
  rpiDepth(symbol: string): string {
    return `${symbol.toLowerCase()}@rpiDepth@500ms`;
  }

  /** Contract (symbol) information updates for the whole exchange. */
  contractInfo(): string {
    return '!contractInfo';
  }

  /** Trading session transitions (see `GET /fapi/v1/tradingSchedule`). */
  tradingSession(): string {
    return 'tradingSession';
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
