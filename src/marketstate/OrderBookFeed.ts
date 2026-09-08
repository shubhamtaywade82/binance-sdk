import { LocalOrderBook, type OrderBookSnapshot } from './LocalOrderBook.js';
import type { BaseWS } from '../ws/BaseWS.js';
import type { WsDepthUpdatePayload } from '../types/ws.types.js';
import type { DepthSnapshot } from '../types/market.types.js';
import type { MarketDataBase } from '../resources/MarketDataBase.js';
import type { SdkLogger } from '../util/logger.js';
import { silentLogger } from '../util/logger.js';

export interface OrderBookFeedOptions {
  symbol: string;
  /** Combined-stream WS connection (e.g. client.futures.ws / client.spot.ws). */
  ws: BaseWS;
  /** REST market resource for snapshots (e.g. client.futures.market). */
  market: MarketDataBase;
  /** Sequence semantics of the diff stream. Default 'futures'. */
  variant?: 'futures' | 'spot';
  /**
   * Diff-stream name. Defaults to `<symbol>@depth@100ms`; build it with the
   * connection's own helper (e.g. client.futures.ws.depthDiffSpeed('btcusdt',
   * '100ms')) for non-default speeds.
   */
  streamName?: string;
  /** Snapshot depth requested from REST. Binance caps at 1000. Default 1000. */
  snapshotLimit?: number;
  /** Delay before re-snapshotting after a desync. Default 250ms. */
  resnapshotDelayMs?: number;
  /** Reuse an existing book instead of creating a fresh one. */
  book?: LocalOrderBook;
  logger?: SdkLogger;
}

export interface OrderBookFeed {
  /** The maintained L2 book. */
  book: LocalOrderBook;
  /** The underlying WS connection (still subscribed to the diff stream). */
  ws: BaseWS;
  /** Latest REST snapshot fetched during setup. */
  snapshot: OrderBookSnapshot;
  /** Stop the feed: unsubscribes the diff stream (the WS connection itself stays). */
  close(): Promise<void>;
}

/**
 * Wires a {@link LocalOrderBook} to live data: subscribes to the symbol's
 * depth diff stream, fetches a snapshot, and keeps the book synchronized,
 * automatically re-snapshotting on any sequence gap.
 *
 * Usage:
 * ```ts
 * const feed = await watchOrderBook({
 *   symbol: 'BTCUSDT',
 *   ws: client.futures.ws,
 *   market: client.futures.market,
 * });
 * feed.book.on('update', () => console.log(feed.book.top()));
 * ```
 */
export async function watchOrderBook(options: OrderBookFeedOptions): Promise<OrderBookFeed> {
  const {
    symbol,
    ws,
    market,
    variant = 'futures',
    snapshotLimit = 1000,
    resnapshotDelayMs = 250,
    logger = silentLogger,
  } = options;
  const upper = symbol.toUpperCase();
  const lower = symbol.toLowerCase();
  const streamName = options.streamName ?? `${lower}@depth@100ms`;
  const book = options.book ?? new LocalOrderBook({ variant });

  let closed = false;
  let resnapshotTimer: NodeJS.Timeout | null = null;

  const handleMessage = (payload: WsDepthUpdatePayload): void => {
    if (payload.s !== upper && payload.s !== symbol) return;
    book.applyDiff({ U: payload.U, u: payload.u, pu: payload.pu, bids: payload.b, asks: payload.a });
  };

  // The REST depth schema parses levels to numbers; the book keeps exact
  // decimal strings. Number -> String is a shortest-round-trip conversion, so
  // the value is preserved exactly.
  const toExactSnapshot = (snapshot: DepthSnapshot): OrderBookSnapshot => ({
    lastUpdateId: snapshot.lastUpdateId,
    bids: snapshot.bids.map((level) => [String(level.price), String(level.qty)] as [string, string]),
    asks: snapshot.asks.map((level) => [String(level.price), String(level.qty)] as [string, string]),
  });

  const scheduleResync = (delay: number): void => {
    if (closed || resnapshotTimer) return;
    resnapshotTimer = setTimeout(() => {
      resnapshotTimer = null;
      void resync();
    }, delay);
  };

  const handleDesync = (): void => {
    if (closed) return;
    logger.warn('orderbook-desync', { symbol: upper, lastUpdateId: book.lastUpdateIdSynced });
    scheduleResync(resnapshotDelayMs);
  };

  const resync = async (): Promise<void> => {
    if (closed) return;
    try {
      const snapshot = toExactSnapshot(await market.depth(upper, snapshotLimit));
      book.applySnapshot(snapshot);
      logger.info('orderbook-resynced', { symbol: upper, lastUpdateId: snapshot.lastUpdateId });
    } catch (err) {
      logger.warn('orderbook-resync-failed', {
        symbol: upper,
        error: err instanceof Error ? err.message : String(err),
      });
      scheduleResync(resnapshotDelayMs * 2);
    }
  };

  book.on('desync', handleDesync);
  ws.on(streamName, handleMessage);

  // Order matters: subscribe first so early diffs buffer, then snapshot, then
  // the buffered diffs replay in sequence.
  await ws.subscribe([streamName]);
  const snapshot = toExactSnapshot(await market.depth(upper, snapshotLimit));
  book.applySnapshot(snapshot);

  return {
    book,
    ws,
    snapshot,
    async close(): Promise<void> {
      closed = true;
      if (resnapshotTimer) clearTimeout(resnapshotTimer);
      book.off('desync', handleDesync);
      ws.off(streamName, handleMessage);
      await ws.unsubscribe([streamName]).catch(() => undefined);
    },
  };
}
