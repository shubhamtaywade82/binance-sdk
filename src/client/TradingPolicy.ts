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
   * list is rejected. Case-insensitive.
   */
  allowedSymbols?: string[];
  /**
   * Hard cap on a single order's notional value, in quote currency. When set, an order whose
   * notional cannot be determined from its parameters (e.g. a MARKET order with no price) is
   * also rejected — an unverifiable order is not a safe order.
   */
  maxNotionalPerOrder?: number;
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
  private readonly allowedSymbols?: Set<string>;

  constructor(private readonly options: TradingPolicyOptions = {}) {
    if (options.allowedSymbols?.length) {
      this.allowedSymbols = new Set(options.allowedSymbols.map((s) => s.toUpperCase()));
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
    const notional = quoteOrderQty ?? (price !== undefined && quantity !== undefined ? price * quantity : undefined);

    if (notional === undefined) {
      deny(
        'notionalUndeterminable',
        `cannot verify notional against the ${max} cap (no price on this order); supply a price or raise/remove maxNotionalPerOrder`,
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
