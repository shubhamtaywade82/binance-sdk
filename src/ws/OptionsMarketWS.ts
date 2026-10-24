import { BaseWS, type BaseWSOptions } from './BaseWS.js';
import type { KlineInterval } from '../types/market.types.js';

/**
 * Binance Options market WebSocket streams.
 *
 * Market stream URL: `wss://nbstream.binance.com/eoptions/stream`
 *
 * Available streams per symbol (Binance Options documentation):
 *   - `<symbol>@trade`            — real-time trades
 *   - `<symbol>@depth`            — order-book depth (diff updates)
 *   - `<symbol>@depth20`          — 20-level depth snapshot
 *   - `<symbol>@kline_<interval>` — kline/candlestick
 *   - `<symbol>@ticker`           — 24h ticker
 *   - `<symbol>@mark`             — mark price
 *   - `<symbol>@index`            — index price (for the underlying)
 *
 * Unlike Futures, Options use a single combined-stream URL (no /public vs /market split).
 *
 * Usage:
 *   const ws = new OptionsMarketWS();
 *   await ws.subscribe(['btc-240329-50000-c@trade']);
 *   ws.on('message', (payload) => console.log(payload));
 */
export class OptionsMarketWS extends BaseWS {
  constructor(
    baseStreamUrl = 'wss://nbstream.binance.com/eoptions/stream',
    options?: Omit<BaseWSOptions, 'baseStreamUrl'>,
  ) {
    super({ baseStreamUrl, ...options, name: options?.name ?? 'optionsMarket' });
  }

  /** `<symbol>@trade` — real-time trades for an options symbol. */
  trade(symbol: string): string {
    return `${symbol.toLowerCase()}@trade`;
  }

  /** `<symbol>@depth` — diff depth updates. */
  depth(symbol: string): string {
    return `${symbol.toLowerCase()}@depth`;
  }

  /** `<symbol>@depth20` — 20-level depth snapshot. */
  depth20(symbol: string): string {
    return `${symbol.toLowerCase()}@depth20`;
  }

  /** `<symbol>@kline_<interval>` — kline/candlestick. */
  kline(symbol: string, interval: KlineInterval): string {
    return `${symbol.toLowerCase()}@kline_${interval}`;
  }

  /** `<symbol>@ticker` — 24h ticker. */
  ticker(symbol: string): string {
    return `${symbol.toLowerCase()}@ticker`;
  }

  /** `<symbol>@mark` — mark price. */
  mark(symbol: string): string {
    return `${symbol.toLowerCase()}@mark`;
  }

  /** `<underlying>@index` — index price for the underlying asset. */
  index(underlying: string): string {
    return `${underlying.toLowerCase()}@index`;
  }

  /** `!ticker@arr` — all-market ticker array. */
  allTicker(): string {
    return '!ticker@arr';
  }
}
