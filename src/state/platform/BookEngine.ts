import type { CoreContext } from '../../core/context.js';
import type { EventBus } from '../../core/events.js';
import type { HttpClient } from '../../client/HttpClient.js';
import type { Subscription } from '../../ws/platform/Subscription.js';
import type { WsFamilyStreams } from '../../ws/platform/WsPlatform.js';
import { ManagedBook, type ManagedBookOptions } from './ManagedBook.js';

/**
 * v3 state platform — multi-symbol local book manager.
 *
 * The v2 `OrderBookEngine` wired books to a connection-centric WS class and
 * re-ran the snapshot after subscribing. The v3 engine keeps the pure L2
 * algorithm (it lives in `OrderBook`, unchanged) and rebuilds everything
 * around it on the platform surfaces:
 *
 *  - streams come from the **pooled WS platform** (`core.ws.usdm/spot`) —
 *    connection placement, renewal and reconnects are the platform's problem;
 *  - snapshots come from the **shared REST transports** (`core.http(...)`) —
 *    same weight budget, same mocks, same environment as everything else;
 *  - the sync algorithm is the canonical Binance one: diffs buffer while the
 *    first snapshot is in flight, and the tail that overlaps the snapshot
 *    applies on top of it — no blind window, no resubscribe dance;
 *  - an interrupted subscription marks the book desynced *immediately* (the
 *    missed-diffs fact is known before any frame says so) and a resync with
 *    backoff repairs it.
 *
 * ```ts
 * const engine = new BookEngine({ core, product: 'usdm' });
 * const book = await engine.watch('BTCUSDT');  // resolves once synced
 * book.bestBid;                                 // exact decimal strings
 * await engine.unwatch('BTCUSDT');
 * engine.close();
 * ```
 */

/** Options for {@link BookEngine}. */
export interface BookEngineOptions {
  product: 'usdm' | 'spot';
  /** Shared runtime: pooled WS subscriptions + REST snapshot transports. */
  core: Pick<CoreContext, 'http' | 'events' | 'ws'>;
  /** Diff update speed; default `100ms`. */
  updateSpeed?: '100ms' | '500ms';
  /** REST snapshot depth (levels); default 1000. */
  snapshotLimit?: number;
  /** Backoff between resync attempts after a desync. Default 1000ms. */
  resyncDelayMs?: number;
  /** Per-book tuning (diff buffer size). */
  book?: ManagedBookOptions;
}

/** Stream-name helper depth diff payload, as the pooled platform delivers it. */
interface DepthDiffFrame {
  e?: string;
  s?: string;
  U?: number;
  u?: number;
  pu?: number;
  b?: unknown;
  a?: unknown;
}

const DEFAULT_RESYNC_DELAY_MS = 1000;

/**
 * Manages {@link ManagedBook}s across symbols on one product's stream family.
 *
 * Books are per-engine and per-symbol (a second `watch` of a live symbol
 * returns the existing book). The engine holds no sockets of its own — every
 * subscription rides the pooled platform connection, so depth streams share
 * connections with everything else the context runs.
 */
export class BookEngine {
  readonly product: 'usdm' | 'spot';
  private readonly core: BookEngineOptions['core'];
  private readonly updateSpeed: '100ms' | '500ms';
  private readonly snapshotLimit: number;
  private readonly resyncDelayMs: number;
  private readonly bookOptions?: ManagedBookOptions;
  private readonly events?: EventBus;
  private readonly books = new Map<string, ManagedBook>();
  private readonly subscriptions = new Map<string, Subscription>();
  /** Symbols with a resync in flight (dedup per symbol). */
  private readonly resyncing = new Set<string>();
  private readonly messageHandler: (payload: unknown) => void;
  private closed = false;

  constructor(options: BookEngineOptions) {
    this.product = options.product;
    this.core = options.core;
    this.updateSpeed = options.updateSpeed ?? '100ms';
    this.snapshotLimit = options.snapshotLimit ?? 1000;
    this.resyncDelayMs = options.resyncDelayMs ?? DEFAULT_RESYNC_DELAY_MS;
    this.bookOptions = options.book;
    this.events = options.core.events;
    this.messageHandler = (payload) => this.onDepthFrame(payload);
  }

  /**
   * Start maintaining a local book for `symbol`: subscribe the pooled depth
   * stream, buffer diffs, fetch the REST snapshot, apply the overlap, go
   * live. Resolves once the book is synced; throws (after unsubscribing)
   * when the snapshot cannot be fetched.
   */
  async watch(symbol: string): Promise<ManagedBook> {
    const upper = symbol.toUpperCase();
    const existing = this.books.get(upper);
    if (existing && existing.state !== 'closed') return existing;
    if (this.closed) throw new Error('BookEngine: closed');

    const book = new ManagedBook(upper, this.bookOptions);
    this.books.set(upper, book);
    book.on('desync', () => void this.scheduleResync(upper));

    const stream = `${upper.toLowerCase()}@depth@${this.updateSpeed}`;
    try {
      const sub = await this.family().subscribe(stream);
      sub.on('message', this.messageHandler);
      sub.on('interrupted', () => {
        // A reconnect implies missed diffs by construction — mark now, the
        // next frame's sequence check would only confirm it later.
        book.markInterrupted('stream-interrupted');
      });
      sub.on('state', (state) => {
        if (state === 'closed') book.markInterrupted('stream-closed');
      });
      this.subscriptions.set(upper, sub);

      await this.snapshot(upper);
      return book;
    } catch (err) {
      // Leave no half-wired state behind: drop the book + subscription.
      await this.unwatch(upper).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Stop maintaining a symbol: close the book and release its subscription
   * (refcounted — the server-level UNSUBSCRIBE fires only for the last
   * consumer). Idempotent; unknown symbols are a no-op.
   */
  async unwatch(symbol: string): Promise<void> {
    const upper = symbol.toUpperCase();
    this.books.get(upper)?.close();
    this.books.delete(upper);
    const sub = this.subscriptions.get(upper);
    this.subscriptions.delete(upper);
    sub?.close();
  }

  /** The managed book for a symbol, if watching. */
  getBook(symbol: string): ManagedBook | undefined {
    return this.books.get(symbol.toUpperCase());
  }

  /** All watched symbols (insertion order). */
  symbols(): string[] {
    return [...this.books.keys()];
  }

  /** True while the engine is usable (not terminally closed). */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Close every book and release every subscription. Terminal; idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const book of this.books.values()) book.close();
    this.books.clear();
    for (const sub of this.subscriptions.values()) sub.close();
    this.subscriptions.clear();
    this.events?.scoped('state').emit('bookEngine.closed', { product: this.product });
  }

  // -------------------------------------------------------------------------

  /** The pooled stream family this product's depth streams ride on. */
  private family(): WsFamilyStreams {
    const ws = this.core.ws;
    return this.product === 'usdm' ? ws.usdm : ws.spot;
  }

  /** Snapshot host: `fapi` (USDⓈ-M `/fapi/v1/depth`) or `spot` (`/api/v3/depth`). */
  private snapshotHttp(): HttpClient {
    return this.core.http(this.product === 'usdm' ? 'fapi' : 'spot');
  }

  /** Fetch + apply one REST snapshot for a symbol. */
  private async snapshot(symbol: string): Promise<void> {
    const book = this.books.get(symbol);
    if (!book || book.state === 'closed') return;
    const raw = (await this.snapshotHttp().get('/depth', {
      symbol,
      limit: this.snapshotLimit,
    })) as Record<string, unknown>;
    book.applySnapshot({
      lastUpdateId: Number(raw.lastUpdateId),
      bids: (raw.bids ?? []) as [string, string][],
      asks: (raw.asks ?? []) as [string, string][],
    });
    this.events?.scoped('state').emit('book.synced', {
      symbol,
      product: this.product,
      lastUpdateId: book.lastUpdateId,
    });
  }

  /** One depth frame off the pooled subscription → the book for its symbol. */
  private onDepthFrame(payload: unknown): void {
    if (this.closed) return;
    const frame = payload as DepthDiffFrame;
    if (!frame || frame.e !== 'depthUpdate') return;
    const symbol = typeof frame.s === 'string' ? frame.s.toUpperCase() : '';
    const book = this.books.get(symbol);
    if (!book || book.state === 'closed') return;
    book.receiveDiff({
      U: Number(frame.U),
      u: Number(frame.u),
      pu: frame.pu !== undefined ? Number(frame.pu) : undefined,
      bids: (frame.b ?? []) as [string, string][],
      asks: (frame.a ?? []) as [string, string][],
    });
  }

  /** Delayed, deduplicated resync after a desync. */
  private async scheduleResync(symbol: string): Promise<void> {
    if (this.closed || this.resyncing.has(symbol)) return;
    const book = this.books.get(symbol);
    if (!book || book.state === 'closed' || book.isSynced) return;
    this.resyncing.add(symbol);
    try {
      await new Promise((resolve) => setTimeout(resolve, this.resyncDelayMs));
      if (this.closed) return;
      const still = this.books.get(symbol);
      if (!still || still.state === 'closed' || still.isSynced) return;
      await this.snapshot(symbol);
      this.events?.scoped('state').emit('book.resynced', { symbol, product: this.product });
    } catch (err) {
      // A failed resync retries on the next desync event (or watch call).
      this.events?.scoped('state').emit('book.resync.failed', {
        symbol,
        product: this.product,
        message: (err as Error).message,
      });
    } finally {
      this.resyncing.delete(symbol);
    }
  }
}
