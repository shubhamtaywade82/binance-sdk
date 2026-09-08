import { randomUUID } from 'node:crypto';
import type { EventBus } from '../core/events.js';
import { Decimal } from '../core/decimal.js';
import { BinanceApiError, NetworkError } from '../errors/index.js';
import type { CreateOrderParams, Order } from '../types/trading.types.js';
import type { FuturesTrading } from '../resources/FuturesTrading.js';
import type { FuturesUserWS } from '../ws/FuturesUserWS.js';
import type {
  Execution,
  ExecutionFill,
  ExecutionManagerOptions,
  ReconciliationState,
} from './types.js';
import { ExecutionUnknownError } from './types.js';
import type { RiskGateway } from '../risk/RiskGateway.js';

interface PlaceOrderIntent extends CreateOrderParams {
  /** Idempotency key; reused across retries of the same intent. */
  intentId?: string;
}

const CLIENT_ORDER_ID_MAX = 36;

/**
 * Idempotent order placement with automatic reconciliation.
 *
 * The legacy path — `trading.createOrder()` through the retrying HttpClient —
 * had two production-critical holes:
 *
 *  1. A timeout on POST /fapi/v1/order left the caller with an exception and
 *     *no idea* whether the order existed. Retrying blindly could double the
 *     position; not retrying could lose the trade entirely.
 *  2. Callers who did generate their own `newClientOrderId` had to implement
 *     reconciliation by hand — every one of them, every time.
 *
 * ExecutionManager closes both:
 *
 *  - every order gets a deterministic `newClientOrderId` (derived from the
 *    intent id), so the exchange itself becomes the idempotency guard;
 *  - on an ambiguous failure (timeout / connection reset / 5xx), the manager
 *    polls `GET /fapi/v1/order?origClientOrderId=…`:
 *      found  → execution is recovered and returned (`reconciled`);
 *      -2013  → the order never reached the engine → one safe resubmission
 *               with the *same* clientOrderId;
 *      still ambiguous → {@link ExecutionUnknownError} carrying the intent,
 *               never a silent guess;
 *  - duplicate submissions of the same intent return the original execution.
 *
 * When a user-data stream is attached (`setUserStream`), ORDER_TRADE_UPDATE
 * events stream live state (fills, average price, status) into the ledger.
 */
export class ExecutionManager {
  private readonly trading: FuturesTrading;
  private readonly options: Required<Pick<ExecutionManagerOptions, 'clientOrderIdPrefix' | 'reconcileMaxAttempts' | 'reconcilePollDelayMs' | 'maxLedgerSize'>>;
  private readonly events?: EventBus;
  private readonly riskGateway?: RiskGateway;
  /** Executions already counted toward open exposure in the risk gateway. */
  private readonly riskRegistered = new WeakSet<Execution>();
  /** Executions whose exposure has been released (terminal). */
  private readonly riskReleased = new WeakSet<Execution>();

  /** intentId → Execution (most recent state). */
  private readonly ledger = new Map<string, Execution>();
  /** clientOrderId → intentId. */
  private readonly byClientOrderId = new Map<string, string>();
  /** clientOrderId → in-flight placement promise (dedup). */
  private readonly inFlight = new Map<string, Promise<Execution>>();
  private userStream: FuturesUserWS | null = null;

  constructor(trading: FuturesTrading, options: ExecutionManagerOptions = {}) {
    this.trading = trading;
    this.options = {
      clientOrderIdPrefix: options.clientOrderIdPrefix ?? 'nbsdk',
      reconcileMaxAttempts: options.reconcileMaxAttempts ?? 3,
      reconcilePollDelayMs: options.reconcilePollDelayMs ?? 400,
      maxLedgerSize: options.maxLedgerSize ?? 1000,
    };
    this.events = options.events;
    this.riskGateway = options.riskGateway;
  }

  /**
   * Feed ORDER_TRADE_UPDATE events into the ledger so executions track live
   * fill state without extra REST polling.
   */
  setUserStream(ws: FuturesUserWS | null): void {
    this.userStream?.off('userData', this.onUserDataEvent);
    this.userStream = ws;
    ws?.on('userData', this.onUserDataEvent);
  }

  /**
   * Idempotently place an order. Returns the execution envelope — either the
   * exchange's synchronous acknowledgement or a reconciled state recovered
   * after an ambiguous transport failure.
   */
  async placeOrder(params: PlaceOrderIntent): Promise<Execution> {
    const intentId = params.intentId ?? randomUUID();
    const clientOrderId = params.newClientOrderId ?? this.deriveClientOrderId(intentId);

    const existing = this.getExecution(intentId);
    if (existing) return existing;

    const inFlight = this.inFlight.get(clientOrderId);
    if (inFlight) return inFlight;

    const submission: CreateOrderParams = { ...params, newClientOrderId: clientOrderId };
    // The intent id must not leak into the exchange payload.
    delete (submission as PlaceOrderIntent).intentId;

    const promise = this.submitWithReconciliation(submission, intentId).finally(() => {
      this.inFlight.delete(clientOrderId);
    });
    this.inFlight.set(clientOrderId, promise);
    return promise;
  }

  /**
   * Cancel an order idempotently: ambiguous failures are reconciled by
   * checking whether the order actually left the book.
   */
  async cancelOrder(
    symbol: string,
    options: { orderId?: number; origClientOrderId?: string; intentId?: string } = {},
  ): Promise<Execution> {
    const intentId = options.intentId ?? randomUUID();
    const prior = this.ledger.get(intentId);
    if (prior) return prior;

    this.emit('execution.cancel.submitted', { intentId, symbol, ...options });
    try {
      const order = await this.trading.cancelOrder(
        symbol,
        options.orderId !== undefined
          ? { orderId: options.orderId }
          : { origClientOrderId: options.origClientOrderId },
      );
      const execution = this.recordFromOrder(order, intentId, 'acked', {
        requestedQuantity: null,
        requestedPrice: null,
      });
      this.emit('execution.cancel.acked', { intentId, status: order.status });
      return execution;
    } catch (err) {
      if (err instanceof BinanceApiError && (err.code === -2011 || err.code === -2013)) {
        // -2011: unknown order (already gone) — the desired end state.
        // -2013: order does not exist.
        const execution: Execution = {
          intentId,
          clientOrderId: options.origClientOrderId ?? '',
          symbol,
          side: '',
          type: 'CANCEL',
          status: 'CANCELED',
          requestedQuantity: null,
          requestedPrice: null,
          executedQuantity: '0',
          cumulativeQuoteQuantity: '0',
          averagePrice: null,
          fills: [],
          reconciliationState: 'reconciled',
          submittedAt: Date.now(),
          updatedAt: Date.now(),
          raw: { code: err.code, msg: err.message },
        };
        this.record(execution);
        this.emit('execution.cancel.reconciled', { intentId, code: err.code });
        return execution;
      }
      if (!(err instanceof NetworkError)) throw err;
      // Ambiguous: did the cancel land? Ask the book.
      try {
        const order = await this.trading.getOrder(symbol, {
          origClientOrderId: options.origClientOrderId,
          orderId: options.orderId,
        });
        const canceled = isTerminalCanceled(order.status);
        const execution = this.recordFromOrder(
          order,
          intentId,
          canceled ? 'reconciled' : 'unknown',
          { requestedQuantity: null, requestedPrice: null },
        );
        this.emit('execution.cancel.reconciled', { intentId, status: order.status });
        return execution;
      } catch {
        throw err;
      }
    }
  }

  /**
   * Force a reconciliation pass for a previously submitted intent (e.g. after
   * an {@link ExecutionUnknownError}).
   */
  async reconcile(intentId: string): Promise<Execution> {
    const execution = this.ledger.get(intentId);
    if (!execution) throw new Error(`No execution recorded for intent ${intentId}`);
    const order = await this.trading.getOrder(execution.symbol, {
      origClientOrderId: execution.clientOrderId,
    });
    return this.recordFromOrder(order, intentId, 'reconciled', {
      requestedQuantity: execution.requestedQuantity,
      requestedPrice: execution.requestedPrice,
    });
  }

  getExecution(intentId: string): Execution | undefined {
    const execution = this.ledger.get(intentId);
    return execution ? { ...execution, fills: [...execution.fills] } : undefined;
  }

  getExecutionByClientOrderId(clientOrderId: string): Execution | undefined {
    const intentId = this.byClientOrderId.get(clientOrderId);
    return intentId ? this.getExecution(intentId) : undefined;
  }

  listExecutions(): Execution[] {
    return [...this.ledger.values()].map((e) => ({ ...e, fills: [...e.fills] }));
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private deriveClientOrderId(intentId: string): string {
    const suffix = intentId.replace(/-/g, '').slice(0, 24);
    const id = `${this.options.clientOrderIdPrefix}-${suffix}`;
    if (id.length > CLIENT_ORDER_ID_MAX) return id.slice(0, CLIENT_ORDER_ID_MAX);
    return id;
  }

  private async submitWithReconciliation(
    submission: CreateOrderParams,
    intentId: string,
  ): Promise<Execution> {
    const submittedAt = Date.now();
    this.emit('execution.submitted', {
      intentId,
      symbol: submission.symbol,
      side: submission.side,
      type: submission.type,
    });

    // Up to two submissions: the second only happens when reconciliation
    // proved the first never reached the engine (-2013), so it cannot double.
    for (let submissionIndex = 0; submissionIndex < 2; submissionIndex += 1) {
      let response: NewOrderResponseLike;
      try {
        response = await this.trading.createOrder(submission) as NewOrderResponseLike;
      } catch (err) {
        if (err instanceof BinanceApiError) {
          // Definitive exchange rejection.
          const execution: Execution = {
            intentId,
            clientOrderId: submission.newClientOrderId as string,
            symbol: submission.symbol,
            side: submission.side,
            type: submission.type,
            status: 'REJECTED',
            requestedQuantity: decimalOrNull(submission.quantity),
            requestedPrice: decimalOrNull(submission.price),
            executedQuantity: '0',
            cumulativeQuoteQuantity: '0',
            averagePrice: null,
            fills: [],
            reconciliationState: 'rejected',
            submittedAt,
            updatedAt: Date.now(),
            raw: { code: err.code, msg: err.message },
          };
          this.record(execution);
          this.emit('execution.rejected', { intentId, code: err.code, message: err.message });
          throw err;
        }
        if (!(err instanceof NetworkError)) throw err;

        // Ambiguous outcome — reconcile by clientOrderId.
        const recovered = await this.recoverByClientOrderId(submission, intentId, submittedAt);
        if (recovered) return recovered;
        if (submissionIndex === 0) {
          // Reconciliation says the order does not exist: safe to resubmit
          // once with the identical clientOrderId.
          this.emit('execution.retry', { intentId, reason: 'order-not-found-after-transport-error' });
          continue;
        }
        const unknown = new ExecutionUnknownError(
          `Order outcome could not be determined for intent ${intentId} ` +
            `(clientOrderId=${submission.newClientOrderId}); reconcile() manually`,
          {
            intentId,
            clientOrderId: submission.newClientOrderId as string,
            symbol: submission.symbol,
            side: submission.side,
            type: submission.type,
            submittedAt,
          },
          this.options.reconcileMaxAttempts,
        );
        this.record({
          intentId,
          clientOrderId: submission.newClientOrderId as string,
          symbol: submission.symbol,
          side: submission.side,
          type: submission.type,
          status: 'UNKNOWN',
          requestedQuantity: decimalOrNull(submission.quantity),
          requestedPrice: decimalOrNull(submission.price),
          executedQuantity: '0',
          cumulativeQuoteQuantity: '0',
          averagePrice: null,
          fills: [],
          reconciliationState: 'unknown',
          submittedAt,
          updatedAt: Date.now(),
          raw: { error: err.message },
        });
        throw unknown;
      }

      // Synchronous ack.
      const execution = this.executionFromResponse(response, submission, intentId, submittedAt, 'acked');
      this.record(execution);
      this.emit('execution.acked', {
        intentId,
        exchangeOrderId: execution.exchangeOrderId,
        status: execution.status,
      });
      return execution;
    }
    // Unreachable: the loop either returns or throws.
    throw new Error('unreachable');
  }

  /**
   * After an ambiguous transport failure, poll REST for the order.
   * Returns the recovered execution, or null when the exchange reports
   * the order does not exist (safe to resubmit).
   */
  private async recoverByClientOrderId(
    submission: CreateOrderParams,
    intentId: string,
    submittedAt: number,
  ): Promise<Execution | null> {
    const symbol = submission.symbol;
    const clientOrderId = submission.newClientOrderId as string;
    for (let attempt = 1; attempt <= this.options.reconcileMaxAttempts; attempt += 1) {
      await this.delay(this.options.reconcilePollDelayMs * attempt);
      this.emit('execution.reconcile.attempt', { intentId, attempt });
      try {
        const order = await this.trading.getOrder(symbol, { origClientOrderId: clientOrderId });
        const execution = this.recordFromOrder(
          order,
          intentId,
          'reconciled',
          {
            requestedQuantity: decimalOrNull(submission.quantity),
            requestedPrice: decimalOrNull(submission.price),
          },
          submittedAt,
        );
        this.emit('execution.reconciled', {
          intentId,
          exchangeOrderId: execution.exchangeOrderId,
          status: execution.status,
        });
        return execution;
      } catch (err) {
        if (err instanceof BinanceApiError && err.code === -2013) {
          // Order does not exist: the submission never reached the engine.
          return null;
        }
        // Query itself failed; keep polling while attempts remain.
      }
    }
    // Could not determine existence either way — the ambiguous case the
    // caller must never auto-resubmit through. Record and surface it.
    this.record({
      intentId,
      clientOrderId,
      symbol: submission.symbol,
      side: submission.side,
      type: submission.type,
      status: 'UNKNOWN',
      requestedQuantity: decimalOrNull(submission.quantity),
      requestedPrice: decimalOrNull(submission.price),
      executedQuantity: '0',
      cumulativeQuoteQuantity: '0',
      averagePrice: null,
      fills: [],
      reconciliationState: 'unknown',
      submittedAt,
      updatedAt: Date.now(),
      raw: { reconciliationAttempts: this.options.reconcileMaxAttempts },
    });
    throw new ExecutionUnknownError(
      `Order outcome could not be determined for intent ${intentId} (clientOrderId=${clientOrderId}); ` +
        `${this.options.reconcileMaxAttempts} reconciliation attempts failed`,
      {
        intentId,
        clientOrderId,
        symbol: submission.symbol,
        side: submission.side,
        type: submission.type,
        submittedAt,
      },
      this.options.reconcileMaxAttempts,
    );
  }

  private executionFromResponse(
    response: NewOrderResponseLike,
    submission: CreateOrderParams,
    intentId: string,
    submittedAt: number,
    state: ReconciliationState,
  ): Execution {
    const executedQty = Decimal.from(response.executedQty ?? '0');
    const cumQuote = Decimal.from(response.cumQuote ?? '0');
    return {
      intentId,
      clientOrderId: response.clientOrderId ?? (submission.newClientOrderId as string),
      exchangeOrderId: response.orderId,
      symbol: response.symbol,
      side: response.side,
      type: response.type,
      status: response.status,
      requestedQuantity: decimalOrNull(submission.quantity),
      requestedPrice: decimalOrNull(submission.price),
      executedQuantity: (response.executedQty ?? '0').toString(),
      cumulativeQuoteQuantity: (response.cumQuote ?? '0').toString(),
      averagePrice: averagePrice(executedQty, cumQuote, response.avgPrice),
      fills: fillsFromResponse(response),
      reconciliationState: state,
      submittedAt,
      updatedAt: response.updateTime ?? Date.now(),
      raw: response as unknown as Record<string, unknown>,
    };
  }

  private recordFromOrder(
    order: Order,
    intentId: string,
    state: ReconciliationState,
    requested: { requestedQuantity: string | null; requestedPrice: string | null },
    submittedAt = Date.now(),
  ): Execution {
    const executedQty = Decimal.from(String(order.executedQty));
    const cumQuote = Decimal.from(String(order.cumQuote));
    const execution: Execution = {
      intentId,
      clientOrderId: order.clientOrderId,
      exchangeOrderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status: order.status,
      requestedQuantity: requested.requestedQuantity,
      requestedPrice: requested.requestedPrice,
      executedQuantity: order.executedQty.toString(),
      cumulativeQuoteQuantity: order.cumQuote.toString(),
      averagePrice: averagePrice(executedQty, cumQuote, String(order.avgPrice)),
      fills: [],
      reconciliationState: state,
      submittedAt,
      updatedAt: order.updateTime,
      raw: order as unknown as Record<string, unknown>,
    };
    this.record(execution);
    return execution;
  }

  private record(execution: Execution): void {
    this.ledger.set(execution.intentId, execution);
    this.byClientOrderId.set(execution.clientOrderId, execution.intentId);
    if (this.ledger.size > this.options.maxLedgerSize) {
      const oldest = this.ledger.keys().next().value;
      if (oldest !== undefined) this.ledger.delete(oldest);
    }
    this.updateRiskGateway(execution);
  }

  /** Feed exposure/failure state into the attached risk gateway. */
  private updateRiskGateway(execution: Execution): void {
    const risk = this.riskGateway;
    if (!risk) return;

    if (execution.reconciliationState === 'rejected' || execution.status === 'REJECTED') {
      risk.recordFailure(`order rejected (${execution.status})`);
      return;
    }
    risk.recordSuccess();

    const notional = notionalOf(execution);
    if (notional === null) return;
    if (isTerminal(execution.status)) {
      if (!this.riskReleased.has(execution)) {
        this.riskReleased.add(execution);
        risk.releaseOpenOrder(notional);
      }
    } else if (!this.riskRegistered.has(execution)) {
      this.riskRegistered.add(execution);
      risk.registerOpenOrder(notional);
    }
  }

  private readonly onUserDataEvent = (event: unknown): void => {
    if (
      event === null ||
      typeof event !== 'object' ||
      (event as { e?: string }).e !== 'ORDER_TRADE_UPDATE'
    ) {
      return;
    }
    const report = (event as { o: Record<string, unknown> }).o;
    const clientOrderId = String(report.c ?? '');
    if (!clientOrderId) return;
    const intentId = this.byClientOrderId.get(clientOrderId);
    if (!intentId) return;
    const execution = this.ledger.get(intentId);
    if (!execution) return;

    const lastPrice = String(report.L ?? '0');
    const lastQty = String(report.l ?? '0');
    const commission = String(report.n ?? '0');
    const commissionAsset = String(report.N ?? '');

    execution.status = String(report.X ?? execution.status);
    if (execution.exchangeOrderId === undefined && report.i !== undefined) {
      execution.exchangeOrderId = Number(report.i);
    }
    if (lastQty !== '0' && commission !== '0') {
      execution.fills.push({
        price: lastPrice,
        quantity: lastQty,
        commission: commission === '0' ? undefined : commission,
        commissionAsset: commissionAsset || undefined,
        tradeId: report.t !== undefined ? Number(report.t) : undefined,
      });
    }
    const executedQty = Decimal.from(String(report.z ?? execution.executedQuantity));
    const cumQuote = Decimal.from(String(report.z ?? '0')).mul(String(report.ap ?? '0'));
    execution.executedQuantity = executedQty.toString();
    if (!execution.fills.length) {
      execution.averagePrice =
        averagePrice(executedQty, cumQuote, String(report.ap ?? '0')) ?? execution.averagePrice;
    } else {
      execution.averagePrice = weightedAverage(execution.fills);
    }
    execution.updatedAt = Date.now();
    this.emit('execution.updated', {
      intentId,
      status: execution.status,
      executedQuantity: execution.executedQuantity,
    });
  };

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emit(name: string, payload: Record<string, unknown>): void {
    if (!this.events) return;
    this.events.scoped('execution').emit(name, payload);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface NewOrderResponseLike {
  orderId?: number;
  symbol: string;
  status: string;
  clientOrderId?: string;
  price?: string | number;
  avgPrice?: string | number;
  origQty?: string | number;
  executedQty?: string | number;
  cumQuote?: string | number;
  type: string;
  side: string;
  time?: number;
  updateTime?: number;
  fills?: Array<{ price?: string | number; qty?: string | number; commission?: string | number; commissionAsset?: string }>;
}

function decimalOrNull(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  return Decimal.from(value).toString();
}

function averagePrice(
  executedQty: Decimal,
  cumQuote: Decimal,
  fallback: string | number | undefined,
): string | null {
  if (!executedQty.isZero()) {
    const computed = cumQuote.div(executedQty);
    if (!computed.isZero()) return computed.toString();
  }
  if (fallback === undefined || fallback === '') return null;
  const parsed = Decimal.from(fallback);
  return parsed.isZero() ? null : parsed.toString();
}

function fillsFromResponse(response: NewOrderResponseLike): ExecutionFill[] {
  if (!Array.isArray(response.fills)) return [];
  return response.fills
    .filter((fill) => fill.price !== undefined && fill.qty !== undefined)
    .map((fill) => ({
      price: Decimal.from(fill.price as string | number).toString(),
      quantity: Decimal.from(fill.qty as string | number).toString(),
      commission: fill.commission !== undefined ? Decimal.from(fill.commission).toString() : undefined,
      commissionAsset: fill.commissionAsset,
    }));
}

function weightedAverage(fills: ExecutionFill[]): string | null {
  let notional = Decimal.ZERO;
  let qty = Decimal.ZERO;
  for (const fill of fills) {
    notional = notional.add(Decimal.from(fill.price).mul(fill.quantity));
    qty = qty.add(fill.quantity);
  }
  if (qty.isZero()) return null;
  return notional.div(qty).toString();
}

function isTerminalCanceled(status: string): boolean {
  return status === 'CANCELED' || status === 'EXPIRED' || status === 'CANCELED_EXPIRED';
}

function isTerminal(status: string): boolean {
  return (
    status === 'FILLED' ||
    status === 'CANCELED' ||
    status === 'EXPIRED' ||
    status === 'REJECTED' ||
    status === 'PARTIALLY_CANCELED'
  );
}

/** Notional estimate: executed quote value, falling back to requested. */
function notionalOf(execution: Execution): string | null {
  const cumQuote = Decimal.from(execution.cumulativeQuoteQuantity);
  if (!cumQuote.isZero()) return cumQuote.toString();
  if (execution.requestedPrice !== null && execution.requestedQuantity !== null) {
    return Decimal.from(execution.requestedPrice).mul(execution.requestedQuantity).toString();
  }
  return null;
}
