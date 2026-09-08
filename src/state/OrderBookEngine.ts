import type { EventBus } from '../core/events.js';
import type { BaseWS } from '../ws/BaseWS.js';
import { OrderBook, type BookSnapshotInput, type OrderBookMetrics, type RawLevel } from './OrderBook.js';

export interface OrderBookEngineOptions {
  /** Market websocket whose combined stream carries the depth diffs. */
  ws: BaseWS;
  /**
   * Fetch a REST depth snapshot for a symbol. Return raw string levels when
   * possible (exactness); numeric pairs are accepted too.
   */
  fetchSnapshot: (symbol: string) => Promise<BookSnapshotInput>;
  /** Diff update speed: `@depth@100ms` (default) or `@depth@500ms`. */
  updateSpeed?: '100ms' | '500ms';
  /** Observability events under the `orderBook` scope. */
  events?: EventBus;
  /** Backoff between resync attempts after a desync. Default 1000ms. */
  resyncDelayMs?: number;
}

interface RawDepthFrame {
  stream?: string;
  data?: {
    e?: string;
    E?: number;
    s?: string;
    U?: number;
    u?: number;
    pu?: number;
    b?: unknown;
    a?: unknown;
  };
}

const DIFF_EVENT = 'depthUpdate';

/**
 * Multi-symbol local book manager: subscribes to diff streams, seeds books
 * from REST snapshots, applies diffs in order, and self-heals desyncs.
 *
 * Canonical usage:
 *
 * ```ts
 * const engine = client.futures.createOrderBookEngine();
 * await engine.subscribe('BTCUSDT');
 * engine.metrics('BTCUSDT'); // best bid/ask, spread, imbalance, microprice…
 * ```
 */
export class OrderBookEngine {
  private readonly books = new Map<string, OrderBook>();
  private readonly resyncing = new Set<string>();
  private readonly ws: BaseWS;
  private readonly fetchSnapshot: (symbol: string) => Promise<BookSnapshotInput>;
  private readonly updateSpeed: '100ms' | '500ms';
  private readonly events?: EventBus;
  private readonly resyncDelayMs: number;
  private readonly messageHandler: (stream: string, payload: unknown) => void;

  constructor(options: OrderBookEngineOptions) {
    this.ws = options.ws;
    this.fetchSnapshot = options.fetchSnapshot;
    this.updateSpeed = options.updateSpeed ?? '100ms';
    this.events = options.events;
    this.resyncDelayMs = options.resyncDelayMs ?? 1000;

    this.messageHandler = (stream, payload) => this.onStreamMessage(stream, payload);
    this.ws.on('message', this.messageHandler);
  }

  /**
   * Start maintaining a local book for `symbol`. Returns once the snapshot is
   * seeded and the diff stream is live.
   */
  async subscribe(symbol: string): Promise<OrderBook> {
    const upper = symbol.toUpperCase();
    if (!this.books.has(upper)) {
      this.books.set(upper, new OrderBook(upper));
    }
    await this.ws.subscribe([`${upper.toLowerCase()}@depth@${this.updateSpeed}`]);
    if (!this.books.get(upper)?.isSynced) {
      await this.resync(upper);
    }
    return this.books.get(upper) as OrderBook;
  }

  async unsubscribe(symbol: string): Promise<void> {
    const upper = symbol.toUpperCase();
    this.books.delete(upper);
    await this.ws.unsubscribe([`${upper.toLowerCase()}@depth@${this.updateSpeed}`]);
  }

  getBook(symbol: string): OrderBook | undefined {
    return this.books.get(symbol.toUpperCase());
  }

  metrics(symbol: string, depthPct?: number): OrderBookMetrics | undefined {
    return this.getBook(symbol)?.metrics(depthPct);
  }

  symbols(): string[] {
    return [...this.books.keys()];
  }

  /** Detach from the websocket (does not close it). */
  destroy(): void {
    this.ws.off('message', this.messageHandler);
    this.books.clear();
  }

  // ---------------------------------------------------------------------------

  private onStreamMessage(stream: string, payload: unknown): void {
    if (!stream.includes('@depth')) return;
    const frame = payload as RawDepthFrame['data'];
    if (!frame || frame.e !== DIFF_EVENT) return;
    const symbol = (frame.s ?? stream.split('@')[0]).toUpperCase();
    const book = this.books.get(symbol);
    if (!book) return;

    const diff = {
      U: frame.U as number,
      u: frame.u as number,
      pu: frame.pu,
      bids: (frame.b ?? []) as readonly RawLevel[],
      asks: (frame.a ?? []) as readonly RawLevel[],
    };

    const applied = book.applyDiff(diff);
    if (!applied) {
      this.emitEvent('orderBook.desync', { symbol, lastUpdateId: book.getLastUpdateId() });
      void this.scheduleResync(symbol);
    }
  }

  private async scheduleResync(symbol: string): Promise<void> {
    if (this.resyncing.has(symbol)) return;
    this.resyncing.add(symbol);
    try {
      await new Promise((resolve) => setTimeout(resolve, this.resyncDelayMs));
      await this.resync(symbol);
    } finally {
      this.resyncing.delete(symbol);
    }
  }

  private async resync(symbol: string): Promise<void> {
    const book = this.books.get(symbol);
    if (!book) return;
    try {
      const snapshot = await this.fetchSnapshot(symbol);
      book.applySnapshot(snapshot);
      this.emitEvent('orderBook.synced', {
        symbol,
        lastUpdateId: snapshot.lastUpdateId,
        bids: snapshot.bids.length,
        asks: snapshot.asks.length,
      });
    } catch (err) {
      this.emitEvent('orderBook.sync.failed', {
        symbol,
        message: (err as Error).message,
      });
    }
  }

  private emitEvent(name: string, payload: Record<string, unknown>): void {
    if (!this.events) return;
    this.events.scoped('orderBook').emit(name, payload);
  }
}
