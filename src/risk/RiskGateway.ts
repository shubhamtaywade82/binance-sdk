import { Decimal } from '../core/decimal.js';
import type { EventBus } from '../core/events.js';
import { PolicyViolationError, type PolicyRule } from '../errors/index.js';
import { TradingPolicy, type TradingPolicyOptions } from '../client/TradingPolicy.js';
import type { HttpMethod } from '../client/HttpClient.js';

export interface RiskGatewayOptions extends TradingPolicyOptions {
  /**
   * Cap on leverage-change requests. `setLeverage` above this is rejected
   * before it reaches the exchange. (Binance's own ceiling is 125 on most
   * USD-M pairs.)
   */
  maxLeverage?: number;
  /**
   * Cap on the aggregate *tracked* open-order notional. Orders registered via
   * `registerOpenOrder` (done automatically for ExecutionManager placements
   * when the gateway is attached) count against this budget and are released
   * on terminal states.
   */
  maxOpenNotional?: number;
  /**
   * Quote-currency daily realized-loss limit. When `recordRealizedPnl` pushes
   * the day's PnL at or below `-maxDailyLoss`, the circuit breaker trips and
   * every mutating request is refused until the daily window resets or the
   * breaker is manually reset.
   */
  maxDailyLoss?: number;
  /**
   * Consecutive exchange rejections tolerated before the circuit breaker
   * trips. `recordFailure`/`recordSuccess` are fed by the execution layer.
   * Default: disabled (Infinity).
   */
  maxConsecutiveFailures?: number;
}

export interface CircuitBreakerState {
  tripped: boolean;
  reason?: 'maxDailyLoss' | 'maxConsecutiveFailures';
  trippedAt?: number;
  detail?: string;
}

export interface RiskStatus {
  circuitBreaker: CircuitBreakerState;
  /** Aggregate tracked open-order notional (exact decimal string). */
  openNotional: string;
  /** Day's realized PnL accumulator (exact decimal string; negative = loss). */
  dailyPnl: string;
  consecutiveFailures: number;
  /** UTC day boundary the daily counters belong to (YYYY-MM-DD). */
  day: string;
}

const MUTATING = new Set<HttpMethod>(['POST', 'PUT', 'DELETE']);
const ORDER_PATH = /order/i;

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toDecimal(value: unknown): Decimal | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return Decimal.from(value as string | number);
  } catch {
    return undefined;
  }
}

/**
 * Layered pre-trade risk gateway — a strict superset of {@link TradingPolicy}.
 *
 * TradingPolicy answers "is this request *permitted*?"; RiskGateway additionally
 * answers "is the *account* in a state where trading should continue?":
 *
 *  - hard caps: leverage ceiling, aggregate open-order notional budget;
 *  - a daily realized-loss kill switch;
 *  - a circuit breaker that trips after a run of consecutive exchange
 *    rejections (a classic symptom of a runaway agent or a desynced strategy);
 *  - daily counters that roll over at the UTC day boundary.
 *
 * The gateway is a drop-in `policy` for HttpClient/BinanceClient, and the
 * execution layer feeds it state: `registerOpenOrder` / `releaseOpenOrder`
 * maintain the notional budget, `recordRealizedPnl` drives the loss limit,
 * `recordFailure` / `recordSuccess` drive the breaker.
 */
export class RiskGateway extends TradingPolicy {
  private readonly gatewayOptions: RiskGatewayOptions;
  private openNotional = Decimal.ZERO;
  private dailyPnl = Decimal.ZERO;
  private consecutiveFailures = 0;
  private day = utcDay();
  private breaker: CircuitBreakerState = { tripped: false };
  private readonly events?: EventBus;

  constructor(options: RiskGatewayOptions = {}, events?: EventBus) {
    super(options);
    this.gatewayOptions = options;
    this.events = events;
  }

  // ---------------------------------------------------------------------------
  // Pre-trade gate (drop-in for HttpClient's policy hook)
  // ---------------------------------------------------------------------------

  /** Throws when the request is not permitted or the breaker is tripped. */
  override check(method: HttpMethod, path: string, params: Record<string, unknown> = {}): void {
    if (!MUTATING.has(method)) return;

    this.rollDayIfNeeded();
    this.assertBreakerNotTripped(method, path);

    // Base guardrails (dryRun/readOnly/symbols/notional/withdrawals/blockedPaths).
    super.check(method, path, params);

    this.checkLeverageCap(method, path, params);
    this.checkOpenNotionalBudget(method, path, params);
  }

  private assertBreakerNotTripped(method: HttpMethod, path: string): void {
    if (!this.breaker.tripped) return;
    throw new PolicyViolationError(
      'circuitBreaker',
      `circuit breaker tripped (${this.breaker.reason}: ${this.breaker.detail ?? ''}); ` +
        'mutating requests are refused until riskStatus.resetBreaker() or the next UTC day',
      method,
      path,
      { reason: this.breaker.reason, trippedAt: this.breaker.trippedAt },
    );
  }

  private checkLeverageCap(
    method: HttpMethod,
    path: string,
    params: Record<string, unknown>,
  ): void {
    const max = this.gatewayOptions.maxLeverage;
    if (max === undefined) return;
    if (!path.toLowerCase().includes('leverage')) return;
    const leverage = toDecimal(params.leverage);
    if (leverage === undefined) return;
    if (leverage.gt(max)) {
      this.deny('maxLeverage', method, path, `leverage ${leverage} exceeds cap ${max}`, {
        leverage: leverage.toString(),
        maxLeverage: max,
      });
    }
  }

  private checkOpenNotionalBudget(
    method: HttpMethod,
    path: string,
    params: Record<string, unknown>,
  ): void {
    const max = toDecimal(this.gatewayOptions.maxOpenNotional);
    if (max === undefined) return;
    // Cancels and queries are not new exposure.
    if (method === 'DELETE' || path.toLowerCase().includes('cancel')) return;
    if (!ORDER_PATH.test(path)) return;

    const quantity = toDecimal(params.quantity);
    const quoteOrderQty = toDecimal(params.quoteOrderQty);
    if (quantity === undefined && quoteOrderQty === undefined) return;

    const price = toDecimal(params.price);
    const notional =
      quoteOrderQty ??
      (price !== undefined && quantity !== undefined ? price.mul(quantity) : undefined);
    if (notional === undefined) return; // TradingPolicy.maxNotionalPerOrder handles "undeterminable"

    const projected = this.openNotional.add(notional);
    if (projected.gt(max)) {
      this.deny(
        'maxOpenNotional',
        method,
        path,
        `projected open notional ${projected} exceeds cap ${max}`,
        { currentOpenNotional: this.openNotional.toString(), orderNotional: notional.toString() },
      );
    }
  }

  private deny(
    rule: PolicyRule,
    method: HttpMethod,
    path: string,
    message: string,
    details?: Record<string, unknown>,
  ): never {
    this.emitEvent('risk.denied', { rule, method, path, message, ...details });
    throw new PolicyViolationError(rule, message, method, path, details);
  }

  // ---------------------------------------------------------------------------
  // State feeds from the execution layer
  // ---------------------------------------------------------------------------

  /** Track an order's notional against the open-order budget. */
  registerOpenOrder(notional: string | number): void {
    const value = toDecimal(notional);
    if (!value) return;
    this.openNotional = this.openNotional.add(value);
    this.emitEvent('risk.exposure.updated', {
      openNotional: this.openNotional.toString(),
      delta: value.toString(),
    });
  }

  /** Release an order's notional (fill/cancel/expire). */
  releaseOpenOrder(notional: string | number): void {
    const value = toDecimal(notional);
    if (!value) return;
    this.openNotional = this.openNotional.sub(value);
    this.emitEvent('risk.exposure.updated', {
      openNotional: this.openNotional.toString(),
      delta: value.neg().toString(),
    });
  }

  /**
   * Accumulate realized PnL. Trips the breaker when the day's loss reaches
   * `-maxDailyLoss`.
   */
  recordRealizedPnl(delta: string | number): void {
    this.rollDayIfNeeded();
    const value = toDecimal(delta);
    if (!value) return;
    this.dailyPnl = this.dailyPnl.add(value);
    this.emitEvent('risk.pnl.recorded', {
      delta: value.toString(),
      dailyPnl: this.dailyPnl.toString(),
    });
    const maxLoss = toDecimal(this.gatewayOptions.maxDailyLoss);
    if (maxLoss !== undefined && this.dailyPnl.neg().gte(maxLoss)) {
      this.trip('maxDailyLoss', `daily realized loss ${this.dailyPnl} reached limit ${maxLoss.neg()}`);
    }
  }

  /** Report an exchange rejection; trips the breaker past the failure cap. */
  recordFailure(detail = 'exchange rejection'): void {
    this.consecutiveFailures += 1;
    const cap = this.gatewayOptions.maxConsecutiveFailures ?? Number.POSITIVE_INFINITY;
    this.emitEvent('risk.failure.recorded', { consecutiveFailures: this.consecutiveFailures, detail });
    if (this.consecutiveFailures >= cap) {
      this.trip('maxConsecutiveFailures', `${this.consecutiveFailures} consecutive failures: ${detail}`);
    }
  }

  /** Report a successful exchange interaction (resets the failure streak). */
  recordSuccess(): void {
    if (this.consecutiveFailures !== 0) {
      this.consecutiveFailures = 0;
      this.emitEvent('risk.failures.reset', {});
    }
  }

  trip(reason: CircuitBreakerState['reason'], detail: string): void {
    if (this.breaker.tripped) return;
    this.breaker = { tripped: true, reason, detail, trippedAt: Date.now() };
    this.emitEvent('risk.circuit.tripped', { reason, detail });
  }

  /** Manually clear the breaker (e.g. after human review). */
  resetBreaker(): void {
    if (!this.breaker.tripped) return;
    this.breaker = { tripped: false };
    this.consecutiveFailures = 0;
    this.emitEvent('risk.circuit.reset', {});
  }

  /** Current risk state snapshot (all money values are exact decimal strings). */
  riskStatus(): RiskStatus {
    this.rollDayIfNeeded();
    return {
      circuitBreaker: { ...this.breaker },
      openNotional: this.openNotional.toString(),
      dailyPnl: this.dailyPnl.toString(),
      consecutiveFailures: this.consecutiveFailures,
      day: this.day,
    };
  }

  /** Reset the daily PnL/loss window (automatic at UTC midnight). */
  resetDaily(): void {
    this.day = utcDay();
    this.dailyPnl = Decimal.ZERO;
    if (this.breaker.reason === 'maxDailyLoss') this.resetBreaker();
    this.emitEvent('risk.day.rolled', { day: this.day });
  }

  private rollDayIfNeeded(): void {
    const today = utcDay();
    if (today !== this.day) this.resetDaily();
  }

  private emitEvent(name: string, payload: Record<string, unknown>): void {
    if (!this.events) return;
    this.events.scoped('risk').emit(name, payload);
  }
}
