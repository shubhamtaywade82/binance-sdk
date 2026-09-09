import { EventEmitter } from 'node:events';
import { Decimal } from '../../core/decimal.js';
import type { EventBus } from '../../core/events.js';
import { positionUpdatesFromAccountUpdate } from './normalize.js';
import type { PositionRecord, PositionUpdate } from './types.js';

/** Options for {@link PositionTracker}. */
export interface PositionTrackerOptions {
  /** Observability bus; `execution.position.*` events are published to it. */
  events?: EventBus;
}

/**
 * Live position-state feed (USDⓈ-M).
 *
 * Folds `ACCOUNT_UPDATE` user-stream events into one {@link PositionRecord}
 * per `symbol` + `positionSide` (one-way mode reports `BOTH`; hedge mode
 * reports `LONG` and `SHORT`). Every amount is an exact decimal string — the
 * signed position amount distinguishes direction, so a short is a negative
 * amount, never a separate flag.
 *
 * ```ts
 * const positions = platform.positions;
 * positions.on('update', (p) => log(p.symbol, p.positionAmount));
 * await platform.startUserSession();     // feed goes live
 * positions.get('BTCUSDT');              // current one-way position
 * positions.nonZero();                   // exposure view
 * ```
 *
 * The unrealized PnL is the stream's own mark at event time; strategies that
 * need a current mark should combine it with the mark-price stream rather
 * than polling this field.
 */
export class PositionTracker extends EventEmitter {
  private readonly positions = new Map<string, PositionRecord>();
  private readonly events?: EventBus;

  constructor(options: PositionTrackerOptions = {}) {
    super();
    this.setMaxListeners(0);
    this.events = options.events;
  }

  /**
   * Dispatch one raw user-data frame. `ACCOUNT_UPDATE` position entries fold
   * into records; everything else is ignored.
   */
  applyUserEvent(event: unknown): void {
    if (event === null || typeof event !== 'object') return;
    const frame = event as Record<string, unknown>;
    if (frame.e !== 'ACCOUNT_UPDATE') return;
    const updates = positionUpdatesFromAccountUpdate(frame);
    for (const update of updates) this.applyUpdate(update);
  }

  /** Fold one normalized position update and emit the updated record. */
  applyUpdate(update: PositionUpdate): void {
    const key = positionKey(update.symbol, update.positionSide);
    const record: PositionRecord = {
      symbol: update.symbol,
      positionSide: update.positionSide,
      positionAmount: update.positionAmount,
      entryPrice: update.entryPrice,
      unrealizedPnl: update.unrealizedPnl,
      marginType: update.marginType,
      isolatedWallet: update.isolatedWallet,
      updatedAt: update.updateTime,
    };
    this.positions.set(key, record);
    const copy = { ...record };
    this.emit('update', copy);
    if (this.events) {
      this.events.scoped('execution').emit('position.updated', {
        symbol: copy.symbol,
        positionSide: copy.positionSide,
        positionAmount: copy.positionAmount,
        entryPrice: copy.entryPrice,
      });
    }
  }

  /**
   * Current position for a symbol. In one-way mode pass no side (or 'BOTH');
   * in hedge mode pass 'LONG' or 'SHORT'. Defensive copy.
   */
  get(symbol: string, positionSide: string = 'BOTH'): PositionRecord | undefined {
    const record = this.positions.get(positionKey(symbol, positionSide));
    return record ? { ...record } : undefined;
  }

  /** All tracked positions (defensive copies), insertion order. */
  all(): PositionRecord[] {
    return [...this.positions.values()].map((record) => ({ ...record }));
  }

  /** Positions with a non-zero amount — the actual exposure view. */
  nonZero(): PositionRecord[] {
    return this.all().filter((record) => {
      try {
        return !Decimal.from(record.positionAmount).isZero();
      } catch {
        return true; // unparsable amount: keep it visible rather than hiding it
      }
    });
  }

  /** Number of tracked positions (cheap). */
  get size(): number {
    return this.positions.size;
  }
}

/** Internal map key — `symbol:positionSide`. */
function positionKey(symbol: string, positionSide: string): string {
  return `${symbol}:${positionSide}`;
}
