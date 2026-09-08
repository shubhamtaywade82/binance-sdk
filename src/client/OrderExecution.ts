import {
  AmbiguousExecutionError,
  BinanceApiError,
  NetworkError,
  OrderUnconfirmedError,
  RateLimitError,
} from '../errors/index.js';
import type { SdkLogger } from '../util/logger.js';
import { silentLogger } from '../util/logger.js';

/** The minimum surface OrderExecution needs from a trading resource. */
export interface OrderTradingResource<TParams, TOrder> {
  createOrder(params: TParams): Promise<TOrder>;
  getOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<TOrder>;
}

/** Orders must at least expose their exchange id and lifecycle status. */
export interface ReconcilableOrder {
  orderId?: number;
  status?: string;
}

export interface OrderExecutionOptions<TParams extends { symbol: string; newClientOrderId?: string }, TOrder> {
  trading: OrderTradingResource<TParams, TOrder>;
  /** Custom client-order-id generator; default is exchange-safe (<= 36 chars, [A-Za-z0-9-]). */
  generateClientOrderId?: () => string;
  /** Total submission attempts (initial + safe retries). Default 2. */
  maxAttempts?: number;
  logger?: SdkLogger;
  /** Optional hook fired exactly once per accepted order (created, reconciled or retried). */
  onOrderAccepted?: (order: TOrder, outcome: SubmitOutcome) => void;
}

export type SubmitOutcome = 'created' | 'reconciled-existing' | 'retried';

export interface SubmitOrderResult<TOrder> {
  order: TOrder;
  outcome: SubmitOutcome;
  /** The clientOrderId used — reconcile with it via getOrder(symbol, { origClientOrderId }). */
  clientOrderId: string;
  attempts: number;
}

/** Binance error code for "order does not exist" when querying by clientOrderId. */
const ORDER_NOT_FOUND_CODE = -2013;

function defaultClientOrderId(): string {
  const entropy = Math.random().toString(36).slice(2, 10);
  return `sdk-${Date.now().toString(36)}-${entropy}`;
}

function isAmbiguousFailure(err: unknown): err is AmbiguousExecutionError | NetworkError {
  return err instanceof AmbiguousExecutionError || err instanceof NetworkError;
}

function isOrderNotFound(err: unknown): boolean {
  return err instanceof BinanceApiError && err.code === ORDER_NOT_FOUND_CODE;
}

/**
 * Execution idempotency and reconciliation for order submission.
 *
 * The correctness problem this solves: POST /order can be accepted by Binance
 * while the response is lost (timeout, connection reset, 5xx). A generic
 * retry then creates a *second* order. This layer instead:
 *
 *   submit → ambiguity (no confirmation either way)
 *          → reconcile by clientOrderId
 *          → found   → return the existing order (no duplicate)
 *          → missing → the order never landed → retry once, safely
 *          → reconcile itself ambiguous → OrderUnconfirmedError (reconcile later)
 *
 * Every submission carries a clientOrderId: the caller's `newClientOrderId`
 * when provided, otherwise a generated exchange-safe one.
 */
export class OrderExecution<
  TParams extends { symbol: string; newClientOrderId?: string } = { symbol: string; newClientOrderId?: string },
  TOrder extends ReconcilableOrder = ReconcilableOrder,
> {
  private readonly trading: OrderTradingResource<TParams, TOrder>;
  private readonly generateClientOrderId: () => string;
  private readonly maxAttempts: number;
  private readonly logger: SdkLogger;
  private readonly onOrderAccepted?: (order: TOrder, outcome: SubmitOutcome) => void;
  /** In-flight submissions keyed by clientOrderId, deduping concurrent duplicates. */
  private readonly inFlight = new Map<string, Promise<SubmitOrderResult<TOrder>>>();

  constructor(options: OrderExecutionOptions<TParams, TOrder>) {
    this.trading = options.trading;
    this.generateClientOrderId = options.generateClientOrderId ?? defaultClientOrderId;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.logger = options.logger ?? silentLogger;
    this.onOrderAccepted = options.onOrderAccepted;
  }

  /**
   * Submit an order with idempotency guarantees. Resolves with the order as
   * the exchange sees it — whether it was just created, already existed from
   * an ambiguous earlier attempt, or landed on a safe retry.
   */
  async submitOrder(params: TParams): Promise<SubmitOrderResult<TOrder>> {
    const clientOrderId = params.newClientOrderId ?? this.generateClientOrderId();
    const submission = { ...params, newClientOrderId: clientOrderId };

    const existing = this.inFlight.get(clientOrderId);
    if (existing) {
      this.logger.warn('duplicate-submission-blocked', { symbol: params.symbol, clientOrderId });
      return existing;
    }

    const promise = this.execute(submission, clientOrderId, 0).finally(() => {
      this.inFlight.delete(clientOrderId);
    });
    this.inFlight.set(clientOrderId, promise);
    return promise;
  }

  /** Convenience wrapper returning just the order (drop-in for trading.createOrder). */
  async createOrder(params: TParams): Promise<TOrder> {
    const { order } = await this.submitOrder(params);
    return order;
  }

  /** Orders currently being submitted (for diagnostics and shutdown draining). */
  getInFlightClientOrderIds(): string[] {
    return [...this.inFlight.keys()];
  }

  private async execute(
    submission: TParams,
    clientOrderId: string,
    startAttempt: number,
  ): Promise<SubmitOrderResult<TOrder>> {
    let attempt = startAttempt;
    const failures: unknown[] = [];

    while (attempt < this.maxAttempts) {
      attempt += 1;
      try {
        const order = await this.trading.createOrder(submission);
        this.logger.info('order-created', { symbol: submission.symbol, clientOrderId, attempt });
        this.emitAccepted(order, attempt === 1 ? 'created' : 'retried');
        return { order, outcome: attempt === 1 ? 'created' : 'retried', clientOrderId, attempts: attempt };
      } catch (err) {
        failures.push(err);

        // Definitive exchange rejection (4xx with a Binance error body): not
        // executed, and retrying the same payload will not help.
        if (err instanceof BinanceApiError && !(err instanceof RateLimitError)) {
          if ((err as BinanceApiError).status >= 500) {
            // 5xx responses carry a Binance body but are still ambiguous for mutations.
            return this.reconcile(submission, clientOrderId, attempt, failures);
          }
          throw err;
        }

        // Rate limits are definitive rejections — the order was not placed.
        if (err instanceof RateLimitError) {
          if (attempt < this.maxAttempts) {
            this.logger.warn('order-rate-limited', {
              symbol: submission.symbol,
              clientOrderId,
              retryAfterMs: err.retryAfterMs,
            });
            if (err.retryAfterMs) await sleep(Math.min(err.retryAfterMs, 5_000));
            continue;
          }
          throw err;
        }

        // Ambiguous outcome: the order may or may not exist on the exchange.
        if (isAmbiguousFailure(err)) {
          return this.reconcile(submission, clientOrderId, attempt, failures);
        }

        throw err;
      }
    }

    throw new OrderUnconfirmedError(
      submission.symbol,
      clientOrderId,
      'submission attempts exhausted',
      failures,
    );
  }

  /** Query the exchange for the clientOrderId and decide: existing, retry, or unconfirmed. */
  private async reconcile(
    submission: TParams,
    clientOrderId: string,
    attempt: number,
    failures: unknown[],
  ): Promise<SubmitOrderResult<TOrder>> {
    this.logger.warn('order-reconciling', { symbol: submission.symbol, clientOrderId, attempt });
    try {
      const order = await this.trading.getOrder(submission.symbol, { origClientOrderId: clientOrderId });
      // The original submission DID land — return it instead of duplicating.
      this.logger.info('order-reconciled-existing', {
        symbol: submission.symbol,
        clientOrderId,
        status: order?.status,
      });
      this.emitAccepted(order, 'reconciled-existing');
      return { order, outcome: 'reconciled-existing', clientOrderId, attempts: attempt };
    } catch (queryErr) {
      if (isOrderNotFound(queryErr)) {
        // Definitively not on the exchange — a retry cannot duplicate.
        if (attempt < this.maxAttempts) {
          this.logger.info('order-retry-safe', { symbol: submission.symbol, clientOrderId, attempt });
          return this.execute(submission, clientOrderId, attempt);
        }
        throw new OrderUnconfirmedError(
          submission.symbol,
          clientOrderId,
          'order not found after reconciliation, but submission attempts are exhausted',
          failures,
        );
      }
      // The reconciliation query itself failed ambiguously — the order's
      // existence cannot be determined. Surface for manual reconciliation.
      throw new OrderUnconfirmedError(
        submission.symbol,
        clientOrderId,
        `reconciliation query failed (${queryErr instanceof Error ? queryErr.message : String(queryErr)})`,
        [...failures, queryErr],
        queryErr,
      );
    }
  }

  private emitAccepted(order: TOrder, outcome: SubmitOutcome): void {
    try {
      this.onOrderAccepted?.(order, outcome);
    } catch (err) {
      this.logger.warn('order-accepted-hook-failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
