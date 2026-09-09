import { EventEmitter } from 'node:events';
import {
  OrderBook,
  type BookLevel,
  type BookSnapshotInput,
  type DiffInput,
  type OrderBookMetrics,
} from '../OrderBook.js';

/**
 * v3 state platform — managed local book.
 *
 * The pure {@link OrderBook} owns the L2 algorithm (snapshot + diff + gap
 * detection, exact-decimal levels). {@link ManagedBook} owns the *lifecycle*
 * around it: the canonical Binance sync dance (buffer diffs while the REST
 * snapshot is in flight, apply the tail that overlaps the snapshot), a
 * consumer-visible sync state, events, and the `waitForSync()` promise —
 * the same ergonomics the execution platform's trackers have.
 */

/** Consumer-visible lifecycle of one managed book. */
export type ManagedBookState = 'syncing' | 'live' | 'desynced' | 'closed';

/** Event payload for `update` — a cheap top-of-book summary. */
export interface BookUpdateEvent {
  symbol: string;
  lastUpdateId: number | null;
  bestBid: string | null;
  bestAsk: string | null;
}

/** Event payload for `desync` / `resynced` / `synced`. */
export interface BookSyncEvent {
  symbol: string;
  /** Last applied update id (null before the first snapshot). */
  lastUpdateId: number | null;
  /** Desync reason, when known (`sequence-gap` | `interrupted` | `snapshot-stream-race`). */
  reason?: string;
  /** Diffs applied straight from the pre-snapshot buffer, when > 0. */
  buffered?: number;
}

/** Options for {@link ManagedBook}. */
export interface ManagedBookOptions {
  /** Diffs buffered while the snapshot is in flight before the oldest drop. */
  maxBufferedDiffs?: number;
}

/**
 * One symbol's live book, managed end to end.
 *
 * ```ts
 * const book = await engine.watch('BTCUSDT');   // resolves once synced
 * book.state;               // 'live'
 * book.bestBid;             // { price: '42150.10', quantity: '2.5' } — exact
 * book.metrics();           // spread, microprice, imbalance, depth…
 * book.on('update', (e) => log(e.bestBid));
 * await book.waitForSync(); // after a desync, resolves on recovery
 * ```
 *
 * The book is a *view* over the platform's pooled WS subscription and the
 * REST snapshot route — it never opens a socket or issues a request itself
 * (the {@link BookEngine} drives it).
 */
export class ManagedBook extends EventEmitter {
  readonly symbol: string;
  private readonly book: OrderBook;
  private stateValue: ManagedBookState = 'syncing';
  /** Diffs received before the first snapshot, applied (filtered) after it. */
  private readonly diffBuffer: DiffInput[] = [];
  private readonly maxBufferedDiffs: number;

  constructor(symbol: string, options: ManagedBookOptions = {}) {
    super();
    this.setMaxListeners(0);
    this.symbol = symbol.toUpperCase();
    this.book = new OrderBook(this.symbol);
    this.maxBufferedDiffs = options.maxBufferedDiffs ?? 2000;
  }

  /** Consumer-visible sync state. */
  get state(): ManagedBookState {
    return this.stateValue;
  }

  /** True while the local book mirrors the exchange book. */
  get isSynced(): boolean {
    return this.stateValue === 'live';
  }

  /** Best bid level (exact decimal strings) or null when the bid side is empty. */
  get bestBid(): BookLevel | null {
    return this.book.bestBid();
  }

  /** Best ask level (exact decimal strings) or null when the ask side is empty. */
  get bestAsk(): BookLevel | null {
    return this.book.bestAsk();
  }

  /** Mid price (exact decimal string) or null when one-sided. */
  get midPrice(): string | null {
    return this.book.midPrice();
  }

  /** Top-of-book metrics (spread, microprice, imbalance, depth, …). */
  metrics(depthPct?: number): OrderBookMetrics {
    return this.book.metrics(depthPct);
  }

  /** Bid levels (best first), for display/snapshotting. */
  bids(limit: number): BookLevel[] {
    return this.book.getBids(limit);
  }

  /** Ask levels (best first), for display/snapshotting. */
  asks(limit: number): BookLevel[] {
    return this.book.getAsks(limit);
  }

  /** Last applied update id (null before the first snapshot). */
  get lastUpdateId(): number | null {
    return this.book.getLastUpdateId();
  }

  /**
   * Resolve once the book is synced. Rejects on timeout or terminal close.
   * Safe to call repeatedly; also the recovery signal after a desync.
   */
  waitForSync(timeoutMs = 30_000): Promise<void> {
    if (this.stateValue === 'live') return Promise.resolve();
    if (this.stateValue === 'closed') {
      return Promise.reject(new Error(`book ${this.symbol} is closed`));
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(`book ${this.symbol} not synced within ${timeoutMs}ms (state=${this.stateValue})`),
        );
      }, timeoutMs);
      const onSync = (): void => {
        if (this.stateValue === 'live') {
          cleanup();
          resolve();
        } else if (this.stateValue === 'closed') {
          cleanup();
          reject(new Error(`book ${this.symbol} closed before sync`));
        }
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        this.off('synced', onSync);
        this.off('resynced', onSync);
        this.off('close', onSync);
      };
      this.on('synced', onSync);
      this.on('resynced', onSync);
      this.on('close', onSync);
    });
  }

  /** Terminal close — the engine calls this on unwatch/engine close. */
  close(): void {
    if (this.stateValue === 'closed') return;
    this.stateValue = 'closed';
    this.diffBuffer.length = 0;
    this.emit('close', { symbol: this.symbol });
    this.removeAllListeners();
  }

  // -------------------------------------------------------------------------
  // Engine-driven surface
  // -------------------------------------------------------------------------

  /**
   * Feed one depth diff. Before the first snapshot the diff buffers (the
   * canonical Binance sync algorithm); after it, a failed apply means a
   * sequence gap — the book desyncs and the engine must resnapshot.
   * @internal
   */
  receiveDiff(diff: DiffInput): void {
    if (this.stateValue === 'closed') return;
    if (!this.book.isSynced) {
      this.diffBuffer.push(diff);
      while (this.diffBuffer.length > this.maxBufferedDiffs) this.diffBuffer.shift();
      return;
    }
    this.applyLiveDiff(diff);
  }

  /**
   * Apply a REST snapshot, then the buffered diff tail that overlaps it.
   * This is the only path from `syncing`/`desynced` back to `live`.
   * @internal
   */
  applySnapshot(snapshot: BookSnapshotInput): void {
    if (this.stateValue === 'closed') return;
    // Book's own prior state decides the recovery event: a first seed emits
    // `synced`, a desync repair emits `resynced`.
    const firstSnapshot = this.stateValue === 'syncing';
    this.book.applySnapshot(snapshot);
    // Apply the buffered tail: diffs whose final id exceeds the snapshot.
    // Diffs fully covered by the snapshot (u <= lastUpdateId) are stale by
    // definition — Binance's documented rule.
    const buffered = this.diffBuffer.splice(0, this.diffBuffer.length);
    let appliedFromBuffer = 0;
    for (const diff of buffered) {
      if (diff.u > snapshot.lastUpdateId) {
        this.book.applyDiff(diff);
        appliedFromBuffer += 1;
      }
    }
    // A freshly seeded book may still be desynced when the buffer's tail did
    // not reach the snapshot boundary (snapshot raced ahead of the stream);
    // stay desynced and wait for the next snapshot.
    if (this.book.isSynced) {
      this.stateValue = 'live';
      this.emit(firstSnapshot ? 'synced' : 'resynced', {
        symbol: this.symbol,
        lastUpdateId: this.book.getLastUpdateId(),
        ...(appliedFromBuffer > 0 ? { buffered: appliedFromBuffer } : {}),
      });
      this.emitUpdate();
    } else {
      this.stateValue = 'desynced';
      this.emit('desync', {
        symbol: this.symbol,
        lastUpdateId: this.book.getLastUpdateId(),
        reason: 'snapshot-stream-race',
      });
    }
  }

  /**
   * Mark the book desynced without a gap event — the engine knows the stream
   * was interrupted (a reconnect implies missed diffs by construction).
   * @internal
   */
  markInterrupted(reason = 'interrupted'): void {
    if (this.stateValue !== 'live') return;
    this.stateValue = 'desynced';
    this.emit('desync', {
      symbol: this.symbol,
      lastUpdateId: this.book.getLastUpdateId(),
      reason,
    });
  }

  // -------------------------------------------------------------------------

  private applyLiveDiff(diff: DiffInput): void {
    const applied = this.book.applyDiff(diff);
    if (!applied) {
      this.stateValue = 'desynced';
      this.emit('desync', {
        symbol: this.symbol,
        lastUpdateId: this.book.getLastUpdateId(),
        reason: 'sequence-gap',
      });
      return;
    }
    if (this.stateValue === 'desynced') {
      // An interrupted book whose next diff applies cleanly missed nothing:
      // sequence continuity is proven, back to live without a resnapshot.
      this.stateValue = 'live';
      this.emit('resynced', {
        symbol: this.symbol,
        lastUpdateId: this.book.getLastUpdateId(),
        reason: 'sequence-restored',
      });
    }
    this.emitUpdate();
  }

  private emitUpdate(): void {
    const bid = this.book.bestBid();
    const ask = this.book.bestAsk();
    this.emit('update', {
      symbol: this.symbol,
      lastUpdateId: this.book.getLastUpdateId(),
      bestBid: bid?.price ?? null,
      bestAsk: ask?.price ?? null,
    } satisfies BookUpdateEvent);
  }
}
