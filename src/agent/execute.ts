/**
 * Agentic futures trading — risk-gated execution.
 *
 * All orders flow through an {@link ExecutionGateway} (live or paper) so
 * every placement is idempotent (`intentId`) and transport-failure
 * reconciled. The live protective package for each entry is:
 *
 *   1. hard stop  — STOP_MARKET, `closePosition`, mark price
 *   2. TP1        — reduce-only LIMIT, 40% of the position at +1R
 *   3. TP2        — reduce-only LIMIT, 30% of the position at +2R
 *   4. runner     — TRAILING_STOP_MARKET, `closePosition`, armed at +2.5R
 *
 * The paper backend simulates MARKET/LIMIT only, so on paper the entry
 * fills at the live mark while protective legs are reported as
 * `PAPER_UNSIMULATED` — the session loop drives those exits itself from
 * the `EntryResult` levels.
 *
 * Market entries carry no price, so before anything is sent a *trusted
 * pre-trade validation* runs: the top of book is fetched, the expected
 * notional is computed against a conservative reference and asserted
 * against the client's `maxNotionalPerOrder` cap (see
 * {@link TradingPolicy.assertOrderNotional}). The reference is registered on
 * the policy — never added to the order parameters — so the transport-time
 * gate verifies the same notional against the same reference.
 */
import type { BinanceClient } from '../client/BinanceClient.js';
import type { ExecutionGateway } from '../execution/Gateway.js';
import { DEFAULT_PROFILE, type AgentProfile } from './config.js';
import type { Dir, Signal } from './signals.js';

/** Outcome of one protective leg. `FAILED:` prefixes carry the reason. */
export type LegStatus = 'PLACED' | 'PAPER_UNSIMULATED' | `FAILED: ${string}`;

/** Everything a session loop needs to manage an open position. */
export interface EntryResult {
  symbol: string;
  side: Dir;
  /** Step-formatted position size (exchange-ready string). */
  quantity: string;
  /** Actual average fill price when known, else the signal's entry hint. */
  entryPrice: number;
  stopPrice: number;
  /** +1R level — 40% take-profit. */
  tp1Price: number;
  /** +2R level — 30% take-profit. */
  tp2Price: number;
  /** +2.5R — trailing-stop activation for the runner. */
  trailActivation: number;
  clientOrderId: string;
  legs: { stopLoss: LegStatus; tp1: LegStatus; tp2: LegStatus; trail: LegStatus };
}

export interface ExecutionEngineOptions {
  /** Route every order through the paper simulator (promotion-ladder stage 1). */
  paper?: boolean;
  /** Paper starting balance (quote currency). Default 10,000. */
  paperBalance?: number;
}

/**
 * Build the execution gateway for an agent session: one call surface for
 * live and paper, with independent ledgers and the RiskGateway attached
 * to the live backend (when the client was built with `safety`).
 */
export function createAgentGateway(
  client: BinanceClient,
  options: ExecutionEngineOptions = {},
): ExecutionGateway {
  return options.paper
    ? client.createExecutionGateway({
        paper: { initialBalance: options.paperBalance ?? 10_000 },
        defaultBackend: 'paper',
      })
    : client.createExecutionGateway({ defaultBackend: 'live' });
}

// ---------------------------------------------------------------------------
// Symbol rules (tick / step formatting)

/** The exchange filters that matter for order formatting. */
export interface TickRules {
  tickSize: number;
  tickDecimals: number;
  stepSize: number;
  stepDecimals: number;
}

function decimalsOf(step: string): number {
  const dot = step.indexOf('.');
  return dot === -1 ? 0 : step.length - dot - 1;
}

/**
 * Price/quantity formatter cache over `exchangeInfo`. One fetch covers the
 * whole session; per-symbol rules are parsed from PRICE_FILTER / LOT_SIZE.
 */
export class SymbolRulesCache {
  private readonly cache = new Map<string, TickRules>();

  constructor(private readonly client: BinanceClient) {}

  async load(symbol: string): Promise<TickRules> {
    const key = symbol.toUpperCase();
    const hit = this.cache.get(key);
    if (hit) return hit;

    const info = await this.client.futures.market.exchangeInfo();
    const entry = info.symbols.find((s) => s.symbol === key);
    const filters = (entry as { filters?: Array<Record<string, string>> } | undefined)?.filters ?? [];
    const price = filters.find((f) => f.filterType === 'PRICE_FILTER');
    const lot = filters.find((f) => f.filterType === 'LOT_SIZE');
    if (!price?.tickSize || !lot?.stepSize) {
      throw new Error(`no PRICE_FILTER/LOT_SIZE rules for ${key}`);
    }
    const rules: TickRules = {
      tickSize: Number(price.tickSize),
      tickDecimals: decimalsOf(price.tickSize),
      stepSize: Number(lot.stepSize),
      stepDecimals: decimalsOf(lot.stepSize),
    };
    this.cache.set(key, rules);
    return rules;
  }
}

/** Round a price to the symbol's tick and format it as an exchange-ready string. */
export function formatPrice(price: number, rules: TickRules): string {
  const ticks = Math.round(price / rules.tickSize);
  return (ticks * rules.tickSize).toFixed(rules.tickDecimals);
}

/** Floor a quantity to the symbol's step and format it as an exchange-ready string. */
export function formatQty(qty: number, rules: TickRules): string {
  const steps = Math.floor(qty / rules.stepSize + 1e-9);
  return (steps * rules.stepSize).toFixed(rules.stepDecimals);
}

// ---------------------------------------------------------------------------
// Entry

export interface ExecuteEntryOptions {
  profile?: AgentProfile;
  /** Stable decision key; makes the entry intent idempotent across retries. */
  decisionKey?: string;
}

/**
 * Size and enter a position, then attach the full protective package.
 *
 * Sizing uses `ops.sizePosition` with an explicit `riskAmount` (equity x
 * risk%) so the paper backend never needs the live signed balance. The
 * quantity comes back step-formatted by the exchange's own filters.
 *
 * Fails closed: returns `null` on any veto / sizing refusal, and if the
 * hard stop cannot be placed on the live backend the fresh position is
 * flattened immediately and the error propagates — an unprotected
 * position is never left standing.
 */
export async function executeEntry(
  client: BinanceClient,
  gateway: ExecutionGateway,
  rules: SymbolRulesCache,
  symbol: string,
  sig: Signal,
  equity: number,
  options: ExecuteEntryOptions = {},
): Promise<EntryResult | null> {
  const profile = options.profile ?? DEFAULT_PROFILE;
  if (sig.vetoes.length > 0) return null; // hard veto

  const riskPct = sig.score >= 85
    ? profile.riskPerTradePctHighConviction
    : profile.riskPerTradePct;
  const side = sig.direction === 'LONG' ? 'BUY' : 'SELL';
  const exitSide = side === 'BUY' ? 'SELL' : 'BUY';
  const stamp = options.decisionKey ?? `${Date.now()}`;

  const sizing = await client.futures.ops.sizePosition({
    symbol,
    side,
    stopPrice: sig.stopHint,
    riskAmount: (equity * riskPct) / 100,
    leverage: profile.maxLeverage,
    marketOrder: true,
  });
  if (!sizing.ok || Number(sizing.quantityStr) <= 0) return null;

  const qty = sizing.quantityStr;
  const nQty = Number(qty);
  const paper = gateway.backend === 'paper';

  // ---- trusted pre-trade validation (price-less MARKET entries) ----------
  // An order whose notional cannot be verified is not a safe order, and a
  // MARKET order carries no price — so the notional is verified against a
  // reference fetched from the exchange right now, before submission. The
  // reference is kept on the policy as validation metadata; the order params
  // sent to the exchange stay clean (no synthetic `price` on a MARKET order).
  const policy = client.policy;
  if (policy) {
    const book = await client.futures.market.bookTicker(symbol);
    // Conservative: the worse of the two sides bounds the notional from above.
    const reference = Math.max(book.bidPrice, book.askPrice);
    policy.assertOrderNotional({ symbol, quantity: qty }, reference);
  }

  const entry = await gateway.placeOrder({
    symbol, side, type: 'MARKET', quantity: qty,
    intentId: `entry-${symbol}-${stamp}`,
  });
  const filled = Number(entry.executedQuantity) > 0
    && entry.averagePrice !== null
    && Number(entry.averagePrice) > 0;
  const entryPrice = filled ? Number(entry.averagePrice) : sizing.entryPrice;

  const r = await rules.load(symbol);
  const risk = Math.abs(entryPrice - sig.stopHint);
  if (!(risk > 0)) {
    // Degenerate geometry — flatten what we just opened, fail closed.
    await emergencyFlatten(client, gateway, [symbol]);
    throw new Error(`zero-risk geometry on ${symbol}: entry ${entryPrice}, stop ${sig.stopHint}`);
  }
  const long = sig.direction === 'LONG';
  const tp1Price = long ? entryPrice + risk : entryPrice - risk;
  const tp2Price = long ? entryPrice + 2 * risk : entryPrice - 2 * risk;
  const trailActivation = long ? entryPrice + 2.5 * risk : entryPrice - 2.5 * risk;

  // ---- protective package -------------------------------------------------
  let stopLoss: LegStatus = 'PLACED';
  if (paper) {
    stopLoss = 'PAPER_UNSIMULATED';
  } else {
    try {
      await gateway.placeOrder({
        symbol, side: exitSide, type: 'STOP_MARKET',
        stopPrice: formatPrice(sig.stopHint, r),
        closePosition: true, workingType: 'MARK_PRICE',
        intentId: `sl-${symbol}-${stamp}`,
      });
    } catch (err) {
      await emergencyFlatten(client, gateway, [symbol]);
      throw new Error(
        `hard stop rejected for ${symbol}; position flattened. cause: ${String(err)}`,
      );
    }
  }

  const ladderLeg = async (
    label: 'tp1' | 'tp2', price: number, fraction: number,
  ): Promise<LegStatus> => {
    if (paper) return 'PAPER_UNSIMULATED';
    const legQty = formatQty(nQty * fraction, r);
    if (Number(legQty) <= 0) return 'FAILED: ladder quantity rounds to zero';
    try {
      await gateway.placeOrder({
        symbol, side: exitSide, type: 'LIMIT',
        quantity: legQty, price: formatPrice(price, r),
        timeInForce: 'GTC', reduceOnly: true,
        intentId: `${label}-${symbol}-${stamp}`,
      });
      return 'PLACED';
    } catch (err) {
      return `FAILED: ${String(err)}`;
    }
  };

  const tp1 = await ladderLeg('tp1', tp1Price, 0.4);
  const tp2 = await ladderLeg('tp2', tp2Price, 0.3);

  let trail: LegStatus = 'PLACED';
  if (paper) {
    trail = 'PAPER_UNSIMULATED';
  } else {
    try {
      await gateway.placeOrder({
        symbol, side: exitSide, type: 'TRAILING_STOP_MARKET',
        activationPrice: formatPrice(trailActivation, r),
        callbackRate: profile.trailCallbackPct,
        closePosition: true, workingType: 'MARK_PRICE',
        intentId: `trail-${symbol}-${stamp}`,
      });
    } catch (err) {
      trail = `FAILED: ${String(err)}`;
    }
  }

  return {
    symbol,
    side: sig.direction,
    quantity: qty,
    entryPrice,
    stopPrice: sig.stopHint,
    tp1Price,
    tp2Price,
    trailActivation,
    clientOrderId: entry.clientOrderId,
    legs: { stopLoss, tp1, tp2, trail },
  };
}

// ---------------------------------------------------------------------------
// Session-level helpers

/** Set the symbol's leverage (live only; the paper engine takes it per order). */
export async function applyLeverage(
  client: BinanceClient,
  symbol: string,
  leverage: number,
  paper: boolean,
): Promise<void> {
  if (paper) return;
  await client.futures.trading.setLeverage(symbol, leverage);
}

/**
 * Refresh the deadman switch: if the agent stops heartbeating for
 * `profile.deadmanMs`, the exchange cancels every open order on these
 * symbols. Live only — the paper engine has no resting orders.
 */
export async function refreshDeadman(
  client: BinanceClient,
  symbols: string[],
  profile: AgentProfile = DEFAULT_PROFILE,
  paper = false,
): Promise<void> {
  if (paper) return;
  for (const s of symbols) {
    await client.futures.trading.setCountdownCancelAll(s, profile.deadmanMs);
  }
}

/**
 * Equity reference for sizing: the paper wallet balance on paper, the
 * USDT wallet balance live (last entry as a fallback).
 */
export async function currentEquity(
  client: BinanceClient,
  gateway: ExecutionGateway,
): Promise<number> {
  if (gateway.backend === 'paper') {
    return gateway.paperEngine.getAccountInfo().balance;
  }
  const balances = await client.futures.account.balance();
  const usdt = balances.find((b) => b.asset === 'USDT');
  return usdt ? usdt.balance : (balances.at(-1)?.balance ?? 0);
}

/**
 * Flatten every open position on `symbols` and cancel resting orders —
 * the reaction to a tripped circuit breaker or an emergency stop. On the
 * live backend this is `ops.closePosition` (reduce-only market) plus
 * `cancelAllOpenOrders`; on paper the engine's positions are closed with
 * opposing market orders.
 */
export async function emergencyFlatten(
  client: BinanceClient,
  gateway: ExecutionGateway,
  symbols: string[],
): Promise<void> {
  for (const s of symbols) {
    if (gateway.backend === 'paper') {
      const pos = gateway.paperEngine.getPosition(s);
      if (pos && pos.side !== 'NONE' && pos.quantity > 0) {
        await gateway.placeOrder({
          symbol: s,
          side: pos.side === 'LONG' ? 'SELL' : 'BUY',
          type: 'MARKET',
          quantity: pos.quantity,
          intentId: `flatten-${s}-${Date.now()}`,
        });
      }
    } else {
      await client.futures.ops.closePosition({ symbol: s });
      await client.futures.trading.cancelAllOpenOrders(s);
    }
  }
}
