import { PaperTradingEngine } from '../paper/PaperTradingEngine.js';
import { ExecutionManager } from './ExecutionManager.js';
import { PaperExecutionAdapter } from './paper.js';
import type { Execution } from './types.js';
import {
  InMemoryAuditSink,
  auditRecordFromExecution,
  type AuditAction,
  type AuditOutcome,
  type AuditRecord,
  type AuditSink,
} from './AuditSink.js';

/** Where an order routed through the gateway executes. */
export type ExecutionBackend = 'live' | 'paper';

export interface ExecutionGatewayOptions {
  /** The live (exchange-backed) execution manager. */
  live: ExecutionManager;
  /**
   * Paper simulator engine the paper backend routes through. When omitted a
   * fresh engine (10,000 quote balance, instant fills) is created.
   */
  paperEngine?: PaperTradingEngine;
  /** Backend used when a call does not specify one. Default 'live'. */
  defaultBackend?: ExecutionBackend;
  /**
   * Append-only audit sink for execution actions (M6). When omitted, an
   * {@link InMemoryAuditSink} (10_000-record ring buffer) is constructed
   * for inspection via {@link ExecutionGateway.audit}. A throwing sink is
   * never allowed to break trading — the gateway swallows record failures.
   */
  audit?: AuditSink;
}

export interface PlaceOrderOptions {
  backend?: ExecutionBackend;
}

/**
 * Routes orders to the live exchange or the paper simulator behind one
 * interface, so strategy code never branches on backend:
 *
 * ```ts
 * const gateway = client.createExecutionGateway({ defaultBackend: 'paper' });
 * await gateway.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01 });
 * await gateway.placeOrder({ ...order }, { backend: 'live' }); // one live order
 * gateway.paperEngine.getAccountInfo();                          // inspect the simulation
 * ```
 *
 * Both backends return the identical {@link Execution} envelope and maintain
 * independent ledgers; `listExecutions('paper')` never mixes with live orders.
 */
export class ExecutionGateway {
  readonly live: ExecutionManager;
  readonly paper: ExecutionManager;
  private readonly paperAdapter: PaperExecutionAdapter;
  private readonly defaultBackend: ExecutionBackend;
  private readonly auditSink: AuditSink;

  constructor(options: ExecutionGatewayOptions) {
    this.live = options.live;
    const engine = options.paperEngine ?? new PaperTradingEngine();
    this.paperAdapter = new PaperExecutionAdapter(engine);
    this.paper = new ExecutionManager(this.paperAdapter, {
      clientOrderIdPrefix: 'paper',
    });
    this.defaultBackend = options.defaultBackend ?? 'live';
    this.auditSink = options.audit ?? new InMemoryAuditSink();
  }

  /** The paper simulator engine (account, positions, order history). */
  get paperEngine(): PaperTradingEngine {
    return this.paperAdapter.simulator;
  }

  /** Backend used when a call does not specify one. */
  get backend(): ExecutionBackend {
    return this.defaultBackend;
  }

  /**
   * The audit sink this gateway writes execution records to. M6: every
   * placeOrder / cancelOrder / reconcile emits exactly one record, plus
   * one per transport-error swallow (recovered via reconciliation).
   */
  get audit(): AuditSink {
    return this.auditSink;
  }

  private resolve(backend?: ExecutionBackend): ExecutionManager {
    return (backend ?? this.defaultBackend) === 'paper' ? this.paper : this.live;
  }

  /** Idempotent order placement on the chosen backend. */
  async placeOrder(
    params: Parameters<ExecutionManager['placeOrder']>[0],
    options: PlaceOrderOptions = {},
  ): Promise<Execution> {
    const backend = options.backend ?? this.defaultBackend;
    try {
      const execution = await this.resolve(backend).placeOrder(params);
      this.recordAudit(execution, 'place', mapOutcome(execution.reconciliationState), backend);
      return execution;
    } catch (err) {
      // The manager either recorded a REJECTED execution in its ledger, or
      // threw ExecutionUnknownError carrying the in-flight execution.
      const execution = extractExecutionFromError(err) ?? syntheticExecution(params, options, 'place');
      this.recordAudit(
        execution,
        'place',
        err instanceof Error && err.name === 'ExecutionUnknownError' ? 'unknown' : 'transport-error',
        backend,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  /** Idempotent cancel on the chosen backend. */
  async cancelOrder(
    symbol: string,
    options: Parameters<ExecutionManager['cancelOrder']>[1] & PlaceOrderOptions = {},
  ): Promise<Execution> {
    const { backend, ...cancelOptions } = options;
    const resolvedBackend = backend ?? this.defaultBackend;
    try {
      const execution = await this.resolve(resolvedBackend).cancelOrder(symbol, cancelOptions);
      this.recordAudit(
        execution,
        'cancel',
        mapOutcome(execution.reconciliationState),
        resolvedBackend,
      );
      return execution;
    } catch (err) {
      const execution = syntheticCancel(symbol, options);
      this.recordAudit(
        execution,
        'cancel',
        err instanceof Error && err.name === 'ExecutionUnknownError' ? 'unknown' : 'transport-error',
        resolvedBackend,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  /** Force a reconciliation pass for an intent on a backend. */
  async reconcile(intentId: string, backend?: ExecutionBackend): Promise<Execution> {
    const resolvedBackend = backend ?? this.defaultBackend;
    try {
      const execution = await this.resolve(resolvedBackend).reconcile(intentId);
      this.recordAudit(execution, 'reconcile', 'reconciled', resolvedBackend);
      return execution;
    } catch (err) {
      const execution = this.getExecution(intentId, resolvedBackend) ?? syntheticReconcile(intentId);
      this.recordAudit(
        execution,
        'reconcile',
        'unknown',
        resolvedBackend,
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  }

  private recordAudit(
    execution: Execution,
    action: AuditAction,
    outcome: AuditOutcome,
    backend: ExecutionBackend,
    note?: string,
  ): void {
    let record: AuditRecord;
    try {
      record = auditRecordFromExecution(execution, action, outcome, backend, note);
    } catch {
      // Building the record itself failed — never break trading.
      return;
    }
    try {
      this.auditSink.record(record);
    } catch {
      // A failing audit sink must not break trading. Swallow.
    }
  }

  getExecution(intentId: string, backend?: ExecutionBackend): Execution | undefined {
    return this.resolve(backend).getExecution(intentId);
  }

  listExecutions(backend?: ExecutionBackend): Execution[] {
    return this.resolve(backend).listExecutions();
  }

  /** Scoped view of one backend, for callers that prefer a direct manager. */
  use(backend: ExecutionBackend): ExecutionManager {
    return this.resolve(backend);
  }
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

function mapOutcome(state: Execution['reconciliationState']): AuditOutcome {
  switch (state) {
    case 'acked':
      return 'acked';
    case 'reconciled':
      return 'reconciled';
    case 'rejected':
      return 'rejected';
    case 'unknown':
      return 'unknown';
  }
}

/**
 * Extract an Execution envelope from an error thrown by ExecutionManager
 * — ExecutionUnknownError carries the in-flight shape. Used to give the
 * audit record a real intentId/clientOrderId/symbol even on the failure
 * path.
 */
function extractExecutionFromError(err: unknown): Execution | undefined {
  if (!(err instanceof Error)) return undefined;
  const exec = (err as { execution?: Execution }).execution;
  return exec;
}

/** Build a minimal Execution envelope from the placeOrder params. */
function syntheticExecution(
  params: Parameters<ExecutionManager['placeOrder']>[0],
  _options: PlaceOrderOptions,
  _action: AuditAction,
): Execution {
  const now = Date.now();
  return {
    intentId: params.intentId ?? '',
    clientOrderId: params.newClientOrderId ?? '',
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    status: 'UNKNOWN',
    requestedQuantity: params.quantity !== undefined ? String(params.quantity) : null,
    requestedPrice: params.price !== undefined ? String(params.price) : null,
    executedQuantity: '0',
    cumulativeQuoteQuantity: '0',
    averagePrice: null,
    fills: [],
    reconciliationState: 'unknown',
    submittedAt: now,
    updatedAt: now,
    raw: {},
  };
}

function syntheticCancel(
  symbol: string,
  options: Parameters<ExecutionManager['cancelOrder']>[1] & PlaceOrderOptions,
): Execution {
  const now = Date.now();
  return {
    intentId: options.intentId ?? '',
    clientOrderId: options.origClientOrderId ?? '',
    symbol,
    side: '',
    type: 'CANCEL',
    status: 'UNKNOWN',
    requestedQuantity: null,
    requestedPrice: null,
    executedQuantity: '0',
    cumulativeQuoteQuantity: '0',
    averagePrice: null,
    fills: [],
    reconciliationState: 'unknown',
    submittedAt: now,
    updatedAt: now,
    raw: {},
  };
}

function syntheticReconcile(intentId: string): Execution {
  const now = Date.now();
  return {
    intentId,
    clientOrderId: '',
    symbol: '',
    side: '',
    type: '',
    status: 'UNKNOWN',
    requestedQuantity: null,
    requestedPrice: null,
    executedQuantity: '0',
    cumulativeQuoteQuantity: '0',
    averagePrice: null,
    fills: [],
    reconciliationState: 'unknown',
    submittedAt: now,
    updatedAt: now,
    raw: {},
  };
}
