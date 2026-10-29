import { DryRunError } from '../errors/DryRunError.js';
import { PolicyViolationError, type PolicyRule } from '../errors/PolicyViolationError.js';
import type { HttpMethod } from './HttpClient.js';

export interface TradingPolicyOptions {
  /**
   * Intercept every mutating request (POST/PUT/DELETE) and throw {@link DryRunError} instead of
   * sending it. Read-only GETs still hit the network, so an agent can research freely but
   * cannot act.
   */
  dryRun?: boolean;
  /** Reject every mutating request outright. Unlike dryRun this is not a rehearsal mode. */
  readOnly?: boolean;
  /**
   * Allowlist of tradeable symbols. Any order-bearing request naming a symbol outside this
   * list is rejected. Case-insensitive. FAIL-CLOSED: an explicitly supplied *empty* array
   * permits NO symbols — omit the option entirely to trade any symbol.
   */
  allowedSymbols?: string[];
  /**
   * Hard cap on a single order's notional value, in quote currency. When set, an order whose
   * notional cannot be determined from its parameters (e.g. a MARKET order with no price) is
   * also rejected — an unverifiable order is not a safe order — *unless* a fresh reference
   * price for that symbol was registered via {@link TradingPolicy.setReferencePrice} or
   * {@link TradingPolicy.assertOrderNotional} (the trusted pre-trade validation path).
   */
  maxNotionalPerOrder?: number;
  /**
   * Max age of a registered reference price used to validate an otherwise price-less order.
   * Default 30 000 ms. A stale reference is discarded and the order falls back to
   * fail-closed rejection — validation must happen on the pre-trade path, just before
   * submission.
   */
  referencePriceTtlMs?: number;
  /** Permit withdrawal requests. Defaults to false: opting into a policy at all denies withdrawals. */
  allowWithdrawals?: boolean;
  /** Permit account-to-account transfers. Defaults to true; set false to pin funds in place. */
  allowTransfers?: boolean;
  /** Extra path fragments to refuse, matched case-insensitively as substrings. */
  blockedPaths?: string[];
}

const WITHDRAW_FRAGMENTS = ['/capital/withdraw/apply'];
const TRANSFER_FRAGMENTS = [
  '/asset/transfer',
  '/margin/transfer',
  '/margin/isolated/transfer',
  '/universaltransfer',
  '/futures/transfer',
];
const MUTATING_METHODS = new Set<HttpMethod>(['POST', 'PUT', 'DELETE']);
const DEFAULT_REFERENCE_PRICE_TTL_MS = 30_000;

interface ReferencePrice {
  price: number;
  at: number;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function includesFragment(path: string, fragments: string[]): boolean {
  const lower = path.toLowerCase();
  return fragments.some((fragment) => lower.includes(fragment.toLowerCase()));
}

/**
 * Client-side guardrails evaluated before a request leaves the process.
 *
 * This exists for autonomous/LLM-driven callers: a misread prompt should not be able to spend
 * the account. It is a defence-in-depth layer, not a substitute for exchange-side API-key
 * restrictions (IP allowlists, disabled withdrawals) — anything that bypasses this HttpClient
 * bypasses the policy too.
 */
export class TradingPolicy {
  /** Uppercase symbol set; an empty set denies every symbol-bearing order. */
  protected allowedSymbols?: Set<string>;
  /** Trusted reference prices (per symbol) for validating price-less orders. */
  private readonly referencePrices = new Map<string, ReferencePrice>();

  constructor(private readonly options: TradingPolicyOptions = {}) {
    // Fail-closed: `allowedSymbols: []` permits no symbols at all. Omit the
    // option to trade any symbol — an explicit empty list is a fence, not a no-op.
    this.allowedSymbols = options.allowedSymbols !== undefined
      ? new Set(options.allowedSymbols.map((s) => s.toUpperCase()))
      : undefined;
  }

  /**
   * Refresh the tradeable-symbol allowlist in place. Mutating an existing policy
   * (instead of rebuilding a client around a new one) preserves every other gate
   * and all accumulated state — daily PnL, failure streak, circuit breaker.
   */
  setAllowedSymbols(symbols: string[]): void {
    this.allowedSymbols = new Set(symbols.map((s) => s.toUpperCase()));
  }

  /**
   * Register a trusted market reference price for a symbol, e.g. from the top of
   * book (`GET /fapi/v1/ticker/bookTicker`) fetched immediately before submission.
   * Used by the notional gates to validate price-less (MARKET) orders. The entry
   * expires after {@link TradingPolicyOptions.referencePriceTtlMs}.
   *
   * Validation metadata lives here, on the policy — it never enters the order
   * parameters sent to the exchange.
   */
  setReferencePrice(symbol: string, price: number, at = Date.now()): void {
    if (!(price > 0) || !Number.isFinite(price)) return;
    this.referencePrices.set(symbol.toUpperCase(), { price, at });
  }

  /** Fresh (non-stale) reference price for a symbol, or undefined when absent/expired. */
  protected freshReferencePrice(symbol: unknown): number | undefined {
    if (typeof symbol !== 'string' || symbol === '') return undefined;
    const key = symbol.toUpperCase();
    const ref = this.referencePrices.get(key);
    if (!ref) return undefined;
    const ttl = this.options.referencePriceTtlMs ?? DEFAULT_REFERENCE_PRICE_TTL_MS;
    if (Date.now() - ref.at > ttl) {
      this.referencePrices.delete(key);
      return undefined;
    }
    return ref.price;
  }

  /**
   * Trusted pre-trade notional validation for a price-less order.
   *
   * `referencePrice` must come from the exchange itself (book ticker / mark price)
   * fetched immediately before submission. The expected notional is computed and
   * enforced against `maxNotionalPerOrder`, and the reference is registered (with a
   * TTL) so the transport-time gate verifies the *same* notional against the
   * *same* reference when the order is actually sent. A breach throws
   * {@link PolicyViolationError}; nothing is sent to the exchange.
   */
  assertOrderNotional(
    order: { symbol: string; quantity?: number | string; quoteOrderQty?: number | string },
    referencePrice: number,
  ): void {
    if (!(referencePrice > 0) || !Number.isFinite(referencePrice)) {
      throw new PolicyViolationError(
        'notionalUndeterminable',
        `reference price ${referencePrice} for ${order.symbol} is not a usable market price`,
        'POST', 'order', { symbol: order.symbol, referencePrice },
      );
    }
    this.setReferencePrice(order.symbol, referencePrice);

    const max = this.options.maxNotionalPerOrder;
    if (max === undefined) return;

    const quantity = toNumber(order.quantity);
    const quoteOrderQty = toNumber(order.quoteOrderQty);
    const notional =
      quoteOrderQty ?? (quantity !== undefined ? quantity * referencePrice : undefined);
    if (notional === undefined) {
      throw new PolicyViolationError(
        'notionalUndeterminable',
        `cannot verify notional against the ${max} cap: order for ${order.symbol} carries neither quantity nor quoteOrderQty`,
        'POST', 'order', { symbol: order.symbol, maxNotionalPerOrder: max },
      );
    }
    if (notional > max) {
      throw new PolicyViolationError(
        'maxNotionalPerOrder',
        `order notional ${notional} exceeds the ${max} cap (reference price ${referencePrice})`,
        'POST', 'order',
        { notional, referencePrice, maxNotionalPerOrder: max, symbol: order.symbol },
      );
    }
  }

  /** Throws {@link PolicyViolationError} or {@link DryRunError} if the request is not permitted. */
  check(method: HttpMethod, path: string, params: Record<string, unknown> = {}): void {
    if (!MUTATING_METHODS.has(method)) return;

    const deny = (rule: PolicyRule, message: string, details?: Record<string, unknown>): never => {
      throw new PolicyViolationError(rule, message, method, path, details);
    };

    if (this.options.blockedPaths?.length && includesFragment(path, this.options.blockedPaths)) {
      deny('blockedPath', 'endpoint is on the blocked-path list');
    }

    if (this.options.readOnly) {
      deny('readOnly', 'client is in read-only mode; mutating requests are refused');
    }

    if (includesFragment(path, WITHDRAW_FRAGMENTS) && this.options.allowWithdrawals !== true) {
      deny('withdrawalsBlocked', 'withdrawals are disabled; set safety.allowWithdrawals to permit them');
    }

    if (includesFragment(path, TRANSFER_FRAGMENTS) && this.options.allowTransfers === false) {
      deny('transfersBlocked', 'account transfers are disabled by policy');
    }

    this.checkSymbol(path, params, deny);
    this.checkNotional(path, params, deny);

    if (this.options.dryRun) {
      throw new DryRunError(method, path, params);
    }
  }

  private checkSymbol(
    path: string,
    params: Record<string, unknown>,
    deny: (rule: PolicyRule, message: string, details?: Record<string, unknown>) => never,
  ): void {
    if (!this.allowedSymbols) return;
    const symbol = params.symbol;
    if (typeof symbol !== 'string' || symbol === '') return;
    if (!this.allowedSymbols.has(symbol.toUpperCase())) {
      deny('symbolNotAllowed', `symbol ${symbol} is not in the allowed list`, {
        symbol,
        allowed: [...this.allowedSymbols],
      });
    }
  }

  private checkNotional(
    path: string,
    params: Record<string, unknown>,
    deny: (rule: PolicyRule, message: string, details?: Record<string, unknown>) => never,
  ): void {
    const max = this.options.maxNotionalPerOrder;
    if (max === undefined) return;
    if (!path.toLowerCase().includes('order')) return;

    const quantity = toNumber(params.quantity);
    const quoteOrderQty = toNumber(params.quoteOrderQty);
    // Only order-placing requests carry a size; cancels and queries are unaffected.
    if (quantity === undefined && quoteOrderQty === undefined) return;

    const price = toNumber(params.price);
    // Price-less orders fall back to a *fresh* registered reference price (the
    // trusted pre-trade validation path). No price and no reference → fail closed.
    const reference = this.freshReferencePrice(params.symbol);
    const notional = quoteOrderQty
      ?? (price !== undefined && quantity !== undefined ? price * quantity : undefined)
      ?? (reference !== undefined && quantity !== undefined ? reference * quantity : undefined);

    if (notional === undefined) {
      deny(
        'notionalUndeterminable',
        `cannot verify notional against the ${max} cap (no price on this order and no fresh reference price); ` +
          'supply a price, run the pre-trade check (assertOrderNotional) or raise/remove maxNotionalPerOrder',
        { quantity, maxNotionalPerOrder: max },
      );
    }

    if (notional > max) {
      deny('maxNotionalPerOrder', `order notional ${notional} exceeds the ${max} cap`, {
        notional,
        maxNotionalPerOrder: max,
      });
    }
  }
}
