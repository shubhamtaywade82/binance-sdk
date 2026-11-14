/**
 * USDⓈ-M gateway routing by stream name, for the three-base split:
 * - `public`:  `/public/stream`, depth and book-level streams
 * - `market`:  `/market/stream`, trades, marks, klines, tickers, liquidations
 * - `private`: `/private`, user data (listenKey)
 *
 * Verified: depth streams are served on `wss://fstream.binance.com/public/stream`
 * (order-book procedure, streams=btcusdt@depth). The bookTicker, rpiDepth, and
 * contractInfo placement, and the market-channel list, come from the SDK's
 * endpoints.ts routing notes, not from a re-read of the vendored spec. Unknown
 * channels throw. They are never guessed onto a base.
 */

export type UsdmStreamFamily = 'public' | 'market' | 'private';

const PUBLIC_CHANNELS = new Set(['depth', 'bookTicker', 'rpiDepth', 'contractInfo']);
const MARKET_CHANNELS = new Set([
  'aggTrade',
  'markPrice',
  'kline',
  'ticker',
  'miniTicker',
  'forceOrder',
]);

/** Channel name of a stream: `btcusdt@depth5@100ms` → `depth5`, `!ticker@arr` → `ticker`. */
export function streamChannel(stream: string): string {
  if (stream.startsWith('!')) {
    // All-market streams: `!<channel>[@arr]`.
    return stream.slice(1).split('@')[0] ?? '';
  }
  // Symbol streams: `<symbol>@<channel>[@...]`.
  return stream.split('@')[1] ?? '';
}

/** Base family for one stream name. Numeric suffixes (`depth5`, `kline_1m`, `markPrice@1s`) are normalized. */
export function routeUsdmStream(stream: string): UsdmStreamFamily {
  const channel = streamChannel(stream);
  // Split on underscore to drop interval suffixes like `_1m` without backtracking regexes.
  const base = (channel.split('_')[0] ?? '').replace(/\d+$/, '');
  const normalized = channel.startsWith('depth') ? 'depth' : channel.startsWith('rpiDepth') ? 'rpiDepth' : base;
  if (PUBLIC_CHANNELS.has(normalized)) return 'public';
  if (MARKET_CHANNELS.has(normalized)) return 'market';
  throw new RangeError(`no USDⓈ-M gateway route for stream "${stream}" (channel "${channel}")`);
}

/** User-data frames are always on the private base. */
export function usdmUserDataFamily(): UsdmStreamFamily {
  return 'private';
}
