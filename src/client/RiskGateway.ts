import { PolicyViolationError, type PolicyRule } from '../errors/PolicyViolationError.js';
import { TradingPolicy, type TradingPolicyOptions } from './TradingPolicy.js';
import type { HttpMethod } from './HttpClient.js';

export interface RiskGatewayOptions extends TradingPolicyOptions {
  /** Maximum concurrently open (working) orders across the account. */
  maxOpenOrders?: number;
  /** Maximum order-placing requests per minute (sliding window, client-side). */
  maxOrdersPerMinute?: number;
  /** Maximum leverage permitted on any leverage-changing request. */
  maxLeverage?: number;
  /**
   * Per-symbol notional exposure ceiling, e.g. { BTCUSDT: 50000 }. Checked
   * against the tracked position exposure plus the incoming order's notional.
   */
  maxSymbolNotional?: Record<string, number>;
  /** Total notional exposure ceiling across all symbols. */
  maxTotalNotional?: number;
  /**
   * Realized-loss ceiling for the current day (quote units). When cumulative
   * realized PnL falls below -maxDailyLoss the breaker trips. Feed PnL via
   * recordRealizedPnl (e.g. from user-stream ACCOUNT_UPDATE / ORDER_TRADE_UPDATE).
   */
  maxDailyLoss?: number;
  /**
   * Once the breaker trips for any reason, ALL mutating requests are refused
   * until reset() is called explicitly — a human (or supervisor agent) has to
   * re-arm the gateway.
   */
  breaker?: { enabled?: boolean };
}

export interface RiskGatewayStatus {
  openOrders: number;
  ordersThisMinute: number;
  totalNotionalExposure: number;
  symbolNotionalExposure: Record<string, number>;
  realizedPnlToday: number;
  breaker: { tripped: boolean; reason?: string; trippedAt?: number };
}

const ORDER_PATH_FRAGMENTS = ['/order', '/algo'];
const LEVERAGE_FRAGMENTS = ['/leverage'];

function isOrderPlacingPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes('/allopenorders') || lower.includes('/batch')) return true; // cancel-all & batch count as order activity
  return ORDER_PATH_FRAGMENTS.some((f) => lower.includes(f)) && !lower.includes('/order/test');
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

const MINUTE_MS = 60_000;

/**
 * Stateful, account-aware extension of {@link TradingPolicy}.
 *
 * TradingPolicy covers request-local rules (dry run, read-only, symbol
 * allowlists, per-order notional). RiskGateway adds the runtime state a real
 * execution boundary needs:
 *
 * - open-order counting and order-rate limiting (maxOrdersPerMinute),
 * - leverage caps,
 * - per-symbol and total notional exposure ceilings fed by position state,
 * - a daily realized-loss kill switch,
 * - a circuit breaker that, once tripped, refuses every mutating request
 *   until a deliberate reset() — a misbehaving strategy cannot simply retry
 *   its way past a violation.
 *
 * The gateway is drop-in wherever a TradingPolicy is accepted (it extends it),
 * so HttpClient enforcement (pre-signing, pre-send) applies automatically.
 * Account state is fed by the caller:
 *
 *   risk.recordOrderPlaced({ symbol, notional });
 *   risk.recordOrderClosed(orderId);
 *   risk.recordRealizedPnl(pnl);          // from user stream events
 *   risk.recordPosition({ symbol, notional });
 */
export class RiskGateway extends TradingPolicy {
  private readonly openOrders = new Map<string, { symbol: string; notional?: number }>();
  private readonly orderTimestamps: number[] = [];
  private readonly symbolExposure = new Map<string, number>();
  private realizedPnlToday = 0;
  private dayStart = Date.now();
  private tripped = false;
  private tripReason?: string;
  private trippedAt?: number;
  private readonly breakerEnabled: boolean;

  constructor(private readonly riskOptions: RiskGatewayOptions = {}) {
    super(riskOptions);
    this.breakerEnabled = riskOptions.breaker?.enabled !== false;
  }

  /** Full pre-trade gate: static policy rules + stateful risk rules + breaker. */
  check(method: HttpMethod, path: string, params: Record<string, unknown> = {}): void {
    if (method === 'GET') return; // reads cannot trip risk rules

    if (this.tripped) {
      throw new PolicyViolationError(
        'circuitBreaker',
        `risk circuit breaker is tripped (${this.tripReason ?? 'unknown'}); call risk.reset() after review`,
        method,
        path,
        { trippedAt: this.trippedAt, reason: this.tripReason },
      );
    }

    const deny = (rule: PolicyRule, message: string, details?: Record<string, unknown>): never => {
      // Individual refusals do NOT trip the breaker: the request never left
      // the process, so no harm was done and the client stays usable. The
      // breaker is reserved for kill-switch conditions (maxDailyLoss) and
      // manual trips from external risk monitors.
      throw new PolicyViolationError(rule, message, method, path, details);
    };

    // Static, request-local rules first (dry run, allowlists, per-order caps).
    super.check(method, path, params);

    this.checkLeverage(path, params, deny);
    this.checkOrderRate(path, deny);
    this.checkExposure(path, params, deny);
  }

  /** An order was accepted by the exchange — track it against the rate + open-order limits. */
  recordOrderPlaced(order: { clientOrderId?: string; orderId?: number | string; symbol: string; notional?: number }): void {
    const key = String(order.clientOrderId ?? order.orderId ?? `order-${this.orderTimestamps.length}`);
    this.openOrders.set(key, { symbol: order.symbol.toUpperCase(), notional: order.notional });
    this.orderTimestamps.push(Date.now());
    this.pruneOrderTimestamps();
  }

  /** An order left the book (filled, canceled, expired). */
  recordOrderClosed(identifier: { clientOrderId?: string; orderId?: number | string }): void {
    this.openOrders.delete(String(identifier.clientOrderId ?? identifier.orderId));
  }

  /** Current position exposure, e.g. from account.positionRisk(). */
  recordPosition(position: { symbol: string; notional: number }): void {
    const key = position.symbol.toUpperCase();
    if (position.notional === 0) this.symbolExposure.delete(key);
    else this.symbolExposure.set(key, position.notional);
  }

  /** Realized PnL in quote units; negative amounts accumulate toward maxDailyLoss. */
  recordRealizedPnl(pnlDelta: number): void {
    this.rollDayIfNeeded();
    this.realizedPnlToday += pnlDelta;
    const maxLoss = this.riskOptions.maxDailyLoss;
    if (maxLoss !== undefined && this.realizedPnlToday <= -Math.abs(maxLoss) && !this.tripped) {
      this.trip(
        'maxDailyLoss',
        `daily realized loss ${this.realizedPnlToday.toFixed(2)} reached the ${maxLoss} limit`,
      );
    }
  }

  /** Manually trip the breaker (e.g. from an external risk monitor). */
  trip(reason: string, message: string): void {
    if (this.tripped) return;
    this.tripped = true;
    this.tripReason = `${reason}: ${message}`;
    this.trippedAt = Date.now();
  }

  /** Re-arm the gateway after a trip. Clears the day's loss accounting. */
  reset(): void {
    this.tripped = false;
    this.tripReason = undefined;
    this.trippedAt = undefined;
    this.realizedPnlToday = 0;
    this.dayStart = Date.now();
  }

  status(): RiskGatewayStatus {
    this.rollDayIfNeeded();
    this.pruneOrderTimestamps();
    return {
      openOrders: this.openOrders.size,
      ordersThisMinute: this.orderTimestamps.length,
      totalNotionalExposure: this.totalExposure(),
      symbolNotionalExposure: Object.fromEntries(this.symbolExposure),
      realizedPnlToday: this.realizedPnlToday,
      breaker: { tripped: this.tripped, reason: this.tripReason, trippedAt: this.trippedAt },
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private checkLeverage(
    path: string,
    params: Record<string, unknown>,
    deny: (rule: PolicyRule, message: string, details?: Record<string, unknown>) => never,
  ): void {
    const max = this.riskOptions.maxLeverage;
    if (max === undefined) return;
    const lower = path.toLowerCase();
    if (!LEVERAGE_FRAGMENTS.some((f) =>lower.includes(f))) return;
    const leverage = toNumber(params.leverage);
    if (leverage !== undefined && leverage > max) {
      deny('maxLeverage', `leverage ${leverage} exceeds the cap of ${max}`, { leverage, maxLeverage: max });
    }
  }

  private checkOrderRate(
    path: string,
    deny: (rule: PolicyRule, message: string, details?: Record<string, unknown>) => never,
  ): void {
    if (!isOrderPlacingPath(path)) return;
    this.pruneOrderTimestamps();

    const maxPerMinute = this.riskOptions.maxOrdersPerMinute;
    if (maxPerMinute !== undefined && this.orderTimestamps.length >= maxPerMinute) {
      deny('maxOrderRate', `${this.orderTimestamps.length} orders in the last minute exceeds the cap of ${maxPerMinute}`, {
        ordersThisMinute: this.orderTimestamps.length,
        maxOrdersPerMinute: maxPerMinute,
      });
    }

    const maxOpen = this.riskOptions.maxOpenOrders;
    if (maxOpen !== undefined && this.openOrders.size >= maxOpen && this.isPlacingOrder(path)) {
      deny('maxOpenOrders', `${this.openOrders.size} open orders already at the cap of ${maxOpen}`, {
        openOrders: this.openOrders.size,
        maxOpenOrders: maxOpen,
      });
    }
  }

  private checkExposure(
    path: string,
    params: Record<string, unknown>,
    deny: (rule: PolicyRule, message: string, details?: Record<string, unknown>) => never,
  ): void {
    if (!this.isPlacingOrder(path)) return;
    const symbol = typeof params.symbol === 'string' ? params.symbol.toUpperCase() : undefined;
    if (!symbol) return;

    const quantity = toNumber(params.quantity);
    const price = toNumber(params.price);
    const quoteOrderQty = toNumber(params.quoteOrderQty);
    const notional = quoteOrderQty ?? (quantity !== undefined && price !== undefined ? quantity * price : undefined);
    if (notional === undefined) return; // unverifiable orders are handled by the static policy caps

    const perSymbol = this.riskOptions.maxSymbolNotional?.[symbol];
    if (perSymbol !== undefined) {
      const current = this.symbolExposure.get(symbol) ?? 0;
      if (Math.abs(current) + notional > perSymbol) {
        deny('maxPositionNotional', `symbol ${symbol} exposure would reach ${current + notional}, above the ${perSymbol} cap`, {
          symbol,
          currentExposure: current,
          orderNotional: notional,
          maxSymbolNotional: perSymbol,
        });
      }
    }

    const total = this.riskOptions.maxTotalNotional;
    if (total !== undefined) {
      const current = this.totalExposure();
      if (current + notional > total) {
        deny('maxPositionNotional', `total exposure would reach ${current + notional}, above the ${total} cap`, {
          totalExposure: current,
          orderNotional: notional,
          maxTotalNotional: total,
        });
      }
    }
  }

  private isPlacingOrder(path: string): boolean {
    const lower = path.toLowerCase();
    return (
      (ORDER_PATH_FRAGMENTS.some((f) => lower.includes(f)) && !lower.includes('cancel') && !lower.includes('/order/test')) ||
      lower.includes('/batchorders')
    );
  }

  private totalExposure(): number {
    let total = 0;
    for (const notional of this.symbolExposure.values()) total += Math.abs(notional);
    return total;
  }

  private pruneOrderTimestamps(): void {
    const cutoff = Date.now() - MINUTE_MS;
    while (this.orderTimestamps.length > 0 && this.orderTimestamps[0]! < cutoff) {
      this.orderTimestamps.shift();
    }
  }

  private rollDayIfNeeded(): void {
    const now = Date.now();
    if (now - this.dayStart >= 24 * 60 * 60 * 1000) {
      this.dayStart = now;
      this.realizedPnlToday = 0;
    }
  }
}
