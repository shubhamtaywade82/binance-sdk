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
   * Cap on the aggregate OPEN-POSITION notional (exposure actually held, as
   * opposed to `maxOpenNotional`, which budgets *orders resting on the book*).
   * The execution/agent layer feeds authoritative position sizes via
   * `recordPositionNotional` (exchange `positionRisk` or the paper engine);
   * every exposure-extending order is then checked against the cap at the
   * gate. Reducing orders (`reduceOnly` / `closePosition`) never count.
   */
  maxPositionNotional?: number;
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

/**
 * Persistable slice of {@link RiskStatus}: everything that must survive a process
 * restart. `openNotional` is deliberately excluded — open-order exposure is
 * process-local state the execution layer re-establishes as orders re-register.
 */
export interface PersistedRiskState {
  day: string;
  dailyPnl: string | number;
  breaker?: CircuitBreakerState;
  consecutiveFailures?: number;
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
  /** Open-position notional per symbol, from the latest authoritative snapshot. */
  private positionNotional = new Map<string, Decimal>();
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
    this.checkPositionNotionalBudget(method, path, params);
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
    // Price-less orders budget against a *fresh* registered reference price
    // (the trusted pre-trade validation path). Still undeterminable → leave the
    // order untracked rather than guessing; TradingPolicy.maxNotionalPerOrder
    // remains the fail-closed gate for that case.
    const reference = toDecimal(this.freshReferencePrice(params.symbol));
    const notional =
      quoteOrderQty ??
      (price !== undefined && quantity !== undefined ? price.mul(quantity) : undefined) ??
      (reference !== undefined && quantity !== undefined ? reference.mul(quantity) : undefined);
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

  /**
   * Authoritative snapshot of open-position notionals per symbol (quote
   * currency), from exchange `positionRisk` records or the paper engine's
   * positions. REPLACES the previous snapshot — positions close, so the map
   * must shrink too. Feed it once per agent cycle.
   */
  recordPositionNotional(positions: Record<string, string | number>): void {
    const next = new Map<string, Decimal>();
    for (const [symbol, value] of Object.entries(positions)) {
      const dec = toDecimal(value);
      if (dec && !dec.isZero()) next.set(symbol.toUpperCase(), dec.abs());
    }
    this.positionNotional = next;
    this.emitEvent('risk.position.snapshot', {
      symbols: [...next.keys()],
      aggregate: [...next.values()].reduce((s, v) => s.add(v), Decimal.ZERO).toString(),
    });
  }

  /** Aggregate open-position notional from the latest snapshot (exact decimal string). */
  get positionNotionalTotal(): string {
    let sum = Decimal.ZERO;
    for (const v of this.positionNotional.values()) sum = sum.add(v);
    return sum.toString();
  }

  /**
   * Position-exposure cap. Worst-case accounting: a new exposure-extending
   * order is projected on top of the current aggregate, because whether an
   * opposing order merely reduces or flips a position cannot be resolved from
   * request parameters alone. Reduce-only and close-position orders never
   * count (they can only lower exposure).
   */
  private checkPositionNotionalBudget(
    method: HttpMethod,
    path: string,
    params: Record<string, unknown>,
  ): void {
    const max = toDecimal(this.gatewayOptions.maxPositionNotional);
    if (max === undefined) return;
    if (method === 'DELETE' || path.toLowerCase().includes('cancel')) return;
    if (!ORDER_PATH.test(path)) return;
    if (params.reduceOnly === true || params.reduceOnly === 'true') return;
    if (params.closePosition === true || params.closePosition === 'true') return;

    const quantity = toDecimal(params.quantity);
    const quoteOrderQty = toDecimal(params.quoteOrderQty);
    if (quantity === undefined && quoteOrderQty === undefined) return;

    const price = toDecimal(params.price);
    const reference = toDecimal(this.freshReferencePrice(params.symbol));
    const notional =
      quoteOrderQty ??
      (price !== undefined && quantity !== undefined ? price.mul(quantity) : undefined) ??
      (reference !== undefined && quantity !== undefined ? reference.mul(quantity) : undefined);
    if (notional === undefined) return; // undeterminable — the per-order cap stays fail-closed

    const projected = Decimal.from(this.positionNotionalTotal).add(notional);
    if (projected.gt(max)) {
      this.deny(
        'maxPositionNotional',
        method,
        path,
        `projected open-position notional ${projected} exceeds cap ${max}`,
        {
          currentPositionNotional: this.positionNotionalTotal,
          orderNotional: notional.toString(),
          maxPositionNotional: max.toString(),
        },
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
   * `-maxDailyLoss`. Feed this from a reliable, deduplicated source — see
   * {@link RealizedPnlFeed} (exchange income records) or user-data events.
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

  /**
   * Restore persisted daily state (process restart). Explicit restart contract:
   *
   *  - a snapshot from a *previous* UTC day is ignored — the new day starts clean;
   *  - a same-day snapshot restores the daily PnL, the failure streak and a tripped
   *    breaker — a restart must never silently clear a tripped breaker;
   *  - a restored day already at/below `-maxDailyLoss` re-trips the breaker;
   *  - the accumulator is *replaced*, not added to — seed from the authoritative
   *    source (e.g. exchange income for the day) and this stays exact.
   */
  restoreDailyState(state: PersistedRiskState): void {
    const today = utcDay();
    if (state.day !== today) return; // stale snapshot from a previous day

    this.day = today;
    const pnl = toDecimal(state.dailyPnl);
    this.dailyPnl = pnl ?? Decimal.ZERO;
    const failures = Number(state.consecutiveFailures);
    this.consecutiveFailures = Number.isFinite(failures) && failures > 0 ? failures : 0;

    if (state.breaker?.tripped) {
      this.breaker = { ...state.breaker };
      this.emitEvent('risk.circuit.restored', {
        reason: state.breaker.reason,
        trippedAt: state.breaker.trippedAt,
      });
    }

    const maxLoss = toDecimal(this.gatewayOptions.maxDailyLoss);
    if (maxLoss !== undefined && this.dailyPnl.neg().gte(maxLoss)) {
      this.breaker = {
        tripped: true,
        reason: 'maxDailyLoss',
        detail: `restored daily realized loss ${this.dailyPnl} at limit ${maxLoss.neg()}`,
        trippedAt: Date.now(),
      };
      this.emitEvent('risk.circuit.restored', { reason: 'maxDailyLoss' });
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

  /**
   * Persistable daily state for {@link restoreDailyState} (round-trips through
   * JSON storage). `openNotional` is intentionally absent — see {@link PersistedRiskState}.
   */
  persistedState(): PersistedRiskState {
    this.rollDayIfNeeded();
    return {
      day: this.day,
      dailyPnl: this.dailyPnl.toString(),
      breaker: { ...this.breaker },
      consecutiveFailures: this.consecutiveFailures,
    };
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
