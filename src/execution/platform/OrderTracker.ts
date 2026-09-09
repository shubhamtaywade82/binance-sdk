import { EventEmitter } from 'node:events';
import type { EventBus } from '../../core/events.js';
import type { OrderShape } from '../adapter.js';
import {
  foldOrderUpdate,
  orderRecordFromUpdate,
  orderUpdateFromOrderShape,
  orderUpdateFromOrderTradeUpdate,
  orderUpdateFromSpotExecutionReport,
} from './normalize.js';
import {
  EXECUTION_PLATFORM_DEFAULTS,
  isTerminalOrderStatus,
  type OrderRecord,
  type OrderUpdate,
} from './types.js';

/** Options for {@link OrderTracker}. */
export interface OrderTrackerOptions {
  /** Observability bus; `execution.order.*` events are published to it. */
  events?: EventBus;
  /** Retained records before the oldest are evicted. Default 5000. */
  maxRecords?: number;
}

/**
 * Live order-state feed.
 *
 * One {@link OrderRecord} per order, folded from every source that observes
 * it: user-stream execution reports (all orders on the account — including
 * orders placed outside this SDK), REST order views, and anything else a
 * caller pushes through `applyUpdate`. Records hold exact decimal strings and
 * per-trade fills deduplicated by trade id.
 *
 * ```ts
 * const orders = platform.orders;
 * orders.on('update', (record) => log(record.status));
 *
 * await platform.startUserSession();          // feed goes live
 * const final = await orders.waitForTerminal('nbsdk-abc');  // promise form
 * ```
 *
 * The tracker is a *view*, not a ledger: it keeps no intents and drives no
 * requests — the execution manager owns submission/reconciliation, this owns
 * "what does the account's order book look like right now".
 */
export class OrderTracker extends EventEmitter {
  private readonly records = new Map<string, OrderRecord>();
  private readonly byExchangeId = new Map<number, string>();
  private readonly maxRecords: number;
  private readonly events?: EventBus;

  constructor(options: OrderTrackerOptions = {}) {
    super();
    this.setMaxListeners(0);
    this.events = options.events;
    this.maxRecords = options.maxRecords ?? EXECUTION_PLATFORM_DEFAULTS.maxTrackedOrders;
  }

  /**
   * Dispatch one raw user-data frame. Recognized execution reports
   * (`ORDER_TRADE_UPDATE`, spot `executionReport`) fold into records;
   * everything else is ignored — the session feeds this its full event flow.
   */
  applyUserEvent(event: unknown): void {
    if (event === null || typeof event !== 'object') return;
    const frame = event as Record<string, unknown>;
    const type = frame.e;
    if (type === 'ORDER_TRADE_UPDATE') {
      const update = orderUpdateFromOrderTradeUpdate(frame);
      if (update) this.applyUpdate(update);
    } else if (type === 'executionReport') {
      const update = orderUpdateFromSpotExecutionReport(frame);
      if (update) this.applyUpdate(update);
    }
  }

  /** Fold a REST order view (create ack / query / cancel result). */
  applyOrderShape(shape: OrderShape): void {
    this.applyUpdate(orderUpdateFromOrderShape(shape));
  }

  /** Fold one normalized observation and emit the updated record. */
  applyUpdate(update: OrderUpdate): void {
    if (!update.clientOrderId) return;
    const existing = this.records.get(update.clientOrderId);
    if (existing && isTerminalOrderStatus(existing.status)) {
      // Terminal orders are immutable; late events are protocol noise.
      return;
    }
    const record = existing ?? orderRecordFromUpdate(update);
    if (existing) foldOrderUpdate(existing, update);
    this.records.set(update.clientOrderId, record);
    if (record.exchangeOrderId !== undefined) {
      this.byExchangeId.set(record.exchangeOrderId, update.clientOrderId);
    }
    this.evictOverflow();
    const copy = this.copy(record);
    this.emit('update', copy);
    if (this.events) {
      this.events.scoped('execution').emit('order.updated', {
        clientOrderId: copy.clientOrderId,
        symbol: copy.symbol,
        status: copy.status,
        executedQuantity: copy.executedQuantity,
        source: update.source,
      });
    }
  }

  /** Current record for a client order id (defensive copy). */
  get(clientOrderId: string): OrderRecord | undefined {
    const record = this.records.get(clientOrderId);
    return record ? this.copy(record) : undefined;
  }

  /** Current record for an exchange order id (defensive copy). */
  getByExchangeId(orderId: number): OrderRecord | undefined {
    const clientOrderId = this.byExchangeId.get(orderId);
    return clientOrderId ? this.get(clientOrderId) : undefined;
  }

  /** All tracked records (defensive copies), insertion order. */
  all(): OrderRecord[] {
    return [...this.records.values()].map((record) => this.copy(record));
  }

  /** Records that have not reached a terminal status. */
  open(): OrderRecord[] {
    return this.all().filter((record) => !isTerminalOrderStatus(record.status));
  }

  /**
   * Resolve with the record once its status is terminal. Rejects if the order
   * is unknown, or on timeout. Safe to call repeatedly for the same order.
   */
  waitForTerminal(
    clientOrderId: string,
    timeoutMs: number = EXECUTION_PLATFORM_DEFAULTS.terminalTimeoutMs,
  ): Promise<OrderRecord> {
    const existing = this.records.get(clientOrderId);
    if (existing) {
      if (isTerminalOrderStatus(existing.status)) {
        return Promise.resolve(this.copy(existing));
      }
    } else {
      return Promise.reject(new Error(`OrderTracker: unknown clientOrderId ${clientOrderId}`));
    }
    return new Promise<OrderRecord>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`OrderTracker: ${clientOrderId} not terminal within ${timeoutMs}ms`));
      }, timeoutMs);
      const onUpdate = (record: OrderRecord): void => {
        if (record.clientOrderId !== clientOrderId) return;
        if (isTerminalOrderStatus(record.status)) {
          cleanup();
          resolve(record);
        }
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        this.off('update', onUpdate);
      };
      this.on('update', onUpdate);
    });
  }

  /** Number of tracked records (cheap). */
  get size(): number {
    return this.records.size;
  }

  private evictOverflow(): void {
    while (this.records.size > this.maxRecords) {
      const oldest = this.records.keys().next().value;
      if (oldest === undefined) break;
      this.evict(oldest);
    }
  }

  private evict(clientOrderId: string): void {
    const record = this.records.get(clientOrderId);
    if (record?.exchangeOrderId !== undefined) {
      this.byExchangeId.delete(record.exchangeOrderId);
    }
    this.records.delete(clientOrderId);
  }

  private copy(record: OrderRecord): OrderRecord {
    return { ...record, fills: record.fills.map((fill) => ({ ...fill })) };
  }
}
