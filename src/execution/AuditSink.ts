import type { Execution, ReconciliationState } from './types.js';
import type { ExecutionBackend } from './Gateway.js';

/**
 * The action an audit record describes. Every state transition in the
 * execution gateway emits exactly one record — placements, cancellations,
 * reconciliations, and terminal-state updates from the user-data stream.
 */
export type AuditAction =
  | 'place'
  | 'cancel'
  | 'reconcile'
  | 'update'
  | 'reject'
  | 'unknown';

/**
 * Outcome of the action, normalized from {@link ReconciliationState} plus
 * a 'pending' state for in-flight calls and 'transport-error' for
 * ambiguous network failures the gateway swallowed.
 */
export type AuditOutcome =
  | 'acked'
  | 'reconciled'
  | 'rejected'
  | 'unknown'
  | 'pending'
  | 'transport-error';

/**
 * One immutable audit record. Serializes cleanly to JSON
 * (`ts` is epoch ms, every decimal stays an exact string).
 *
 * Records are append-only: an audit sink never mutates or deletes a
 * record. A live order that fills incrementally produces a sequence of
 * records with the same `intentId` / `clientOrderId`, each describing the
 * state transition that happened.
 */
export interface AuditRecord {
  /** Epoch ms when the audited action completed (or was attempted). */
  readonly ts: number;
  /** What happened. */
  readonly action: AuditAction;
  /** Normalized outcome. */
  readonly outcome: AuditOutcome;
  /** Which backend the action ran against. */
  readonly backend: ExecutionBackend;
  /** Caller-supplied idempotency key. */
  readonly intentId: string;
  /** The newClientOrderId the exchange saw. */
  readonly clientOrderId: string;
  /** Exchange-assigned id once known. */
  readonly exchangeOrderId?: number;
  readonly symbol: string;
  readonly side: string;
  readonly type: string;
  /** Order status as reported by the exchange / simulator. */
  readonly status: string;
  /** Exact decimal string, or null when the order is quote-sized only. */
  readonly requestedQuantity: string | null;
  readonly requestedPrice: string | null;
  /** Exact decimal string of executed quantity at the time of the record. */
  readonly executedQuantity: string;
  readonly cumulativeQuoteQuantity: string;
  readonly averagePrice: string | null;
  readonly reconciliationState: ReconciliationState;
  /**
   * Optional human-readable note — e.g. why a reconciliation was forced,
   * why a transport error was swallowed, why the order was resubmitted.
   */
  readonly note?: string;
}

/**
 * Append-only audit sink for execution actions.
 *
 * The gateway calls {@link AuditSink.record} for every placeOrder /
 * cancelOrder / reconcile / live-update transition. Implementations
 * decide where the records land: in-memory ring buffer (default,
 * inspectable from tests), a writable stream, an S3-style object store,
 * a SIEM collector, etc.
 *
 * The contract is deliberately tiny: implementations MUST be safe to
 * call from the synchronous post-action path of the gateway (i.e. the
 * record call itself may not throw — a failing audit sink must not
 * break trading).
 */
export interface AuditSink {
  /** Append a record. Must not throw; on failure, implementations log and swallow. */
  record(record: AuditRecord): void;
  /**
   * Optional: iterate over retained records (in order). In-memory
   * implementations support this; sinks that stream to external stores
   * may return an empty iterator.
   */
  records?(): Iterable<AuditRecord>;
  /** Optional: clear retained records (mainly for tests). */
  clear?(): void;
}

/** Build a normalized audit record from an execution envelope. */
export function auditRecordFromExecution(
  execution: Execution,
  action: AuditAction,
  outcome: AuditOutcome,
  backend: ExecutionBackend,
  note?: string,
): AuditRecord {
  return {
    ts: execution.updatedAt,
    action,
    outcome,
    backend,
    intentId: execution.intentId,
    clientOrderId: execution.clientOrderId,
    exchangeOrderId: execution.exchangeOrderId,
    symbol: execution.symbol,
    side: execution.side,
    type: execution.type,
    status: execution.status,
    requestedQuantity: execution.requestedQuantity,
    requestedPrice: execution.requestedPrice,
    executedQuantity: execution.executedQuantity,
    cumulativeQuoteQuantity: execution.cumulativeQuoteQuantity,
    averagePrice: execution.averagePrice,
    reconciliationState: execution.reconciliationState,
    note,
  };
}

/**
 * Default in-memory audit sink: a capped ring buffer (default 10_000
 * records) that never blocks the caller and never throws. Useful for
 * inspection in tests and for short-running CLI sessions; production
 * deployments that need durable audit should swap in a stream-backed
 * sink via {@link ExecutionGatewayOptions.audit}.
 */
export class InMemoryAuditSink implements AuditSink {
  private readonly buffer: AuditRecord[] = [];
  private readonly capacity: number;

  constructor(capacity = 10_000) {
    this.capacity = capacity;
  }

  record(record: AuditRecord): void {
    try {
      this.buffer.push(record);
      if (this.buffer.length > this.capacity) {
        this.buffer.shift();
      }
    } catch {
      // Audit must never break trading. Swallow.
    }
  }

  records(): Iterable<AuditRecord> {
    return this.buffer.slice();
  }

  clear(): void {
    this.buffer.length = 0;
  }

  /** Number of retained records. Safe to call from the trading path. */
  get size(): number {
    try {
      return this.buffer.length;
    } catch {
      return 0;
    }
  }
}

/**
 * Audit sink that fans out to one or more child sinks — e.g. the
 * in-memory ring buffer for inspection AND a stream sink for durable
 * persistence. Children are called in registration order; a throwing
 * child does not stop later children (the failing child is skipped on
 * that record).
 */
export class FanOutAuditSink implements AuditSink {
  private readonly children: AuditSink[];

  constructor(children: AuditSink[]) {
    this.children = children;
  }

  record(record: AuditRecord): void {
    for (const child of this.children) {
      try {
        child.record(record);
      } catch {
        // Skip a failing child; audit must not break trading.
      }
    }
  }

  records(): Iterable<AuditRecord> {
    // Merge in registration order; de-dup by ts+intentId+action+outcome.
    const seen = new Set<string>();
    const merged: AuditRecord[] = [];
    for (const child of this.children) {
      if (!child.records) continue;
      for (const r of child.records()) {
        const key = `${r.ts}|${r.intentId}|${r.action}|${r.outcome}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }
    }
    return merged;
  }

  clear(): void {
    for (const child of this.children) {
      try {
        child.clear?.();
      } catch {
        // Best-effort.
      }
    }
  }
}

/**
 * Stream-backed audit sink: writes one JSON line per record to a
 * Node.js WritableStream. Buffering and backpressure follow the
 * stream's own semantics. Errors on the stream are logged and
 * swallowed (a closed stream does not break trading).
 *
 * Mainly used as the durable leg of a {@link FanOutAuditSink}:
 *
 * ```ts
 * import { createWriteStream } from 'node:fs';
 * const file = createWriteStream('audit.ndjson', { flags: 'a' });
 * const sink = new FanOutAuditSink([
 *   new InMemoryAuditSink(),
 *   new StreamAuditSink(file),
 * ]);
 * const gateway = client.createExecutionGateway({ audit: sink });
 * ```
 */
export class StreamAuditSink implements AuditSink {
  private readonly stream: NodeJS.WritableStream;
  private readonly serializer: (record: AuditRecord) => string;

  constructor(
    stream: NodeJS.WritableStream,
    serializer: (record: AuditRecord) => string = (r) => JSON.stringify(r),
  ) {
    this.stream = stream;
    this.serializer = serializer;
  }

  record(record: AuditRecord): void {
    try {
      const line = `${this.serializer(record)}\n`;
      const w = this.stream as { write?(chunk: string): boolean };
      if (typeof w.write === 'function') {
        w.write(line);
      }
    } catch {
      // Swallow — see contract.
    }
  }
}
