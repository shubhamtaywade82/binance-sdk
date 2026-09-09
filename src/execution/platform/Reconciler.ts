import type { CoreContext } from '../../core/context.js';
import type { EventBus } from '../../core/events.js';
import type { HttpClient } from '../../client/HttpClient.js';
import type { PaperTradingEngine } from '../../paper/PaperTradingEngine.js';
import type { OrderShape } from '../adapter.js';
import type { PaperExecutionAdapter } from '../paper.js';
import { decimalString } from './PaperSession.js';
import type { OrderTracker } from './OrderTracker.js';
import type { PositionTracker } from './PositionTracker.js';
import type { PositionUpdate } from './types.js';
import type { ReconciliationSummary } from './types.js';

/**
 * v3 execution platform — REST reconciliation pass.
 *
 * The user stream sees the present and the future, never the past: an order
 * placed before `startUserSession()` (by hand, by another bot, by a previous
 * process of this SDK) never appears in it, and after a partition the stream
 * resumes without replaying what was missed. `reconcile()` closes that gap
 * the same way the execution manager does for single intents — by folding an
 * authoritative REST snapshot into the trackers:
 *
 *   - `GET /fapi/v1/openOrders` (USDⓈ-M, one call) / per-symbol Spot
 *     `GET /api/v3/openOrders` → `OrderTracker.applyOrderShape`
 *   - `GET /fapi/v2/positionRisk` (USDⓈ-M) → `PositionTracker.applyUpdate`
 *
 * Paper mode reconciles against the simulator's own book instead — the same
 * fold, the same events, zero network. Every fold emits the identical
 * `order.updated` / `position.updated` events a stream fold emits, so
 * consumers cannot tell which path updated a record.
 */

/** Options for a reconciliation pass. */
export interface ReconcileOptions {
  /**
   * Restrict the pass to these symbols. Required for live Spot (its
   * `openOrders` route needs a symbol); optional for USDⓈ-M (one call covers
   * the whole account, and the position fold filters to these symbols).
   */
  symbols?: string[];
}

/** Everything a reconciliation pass needs, provided by the platform. */
export interface ReconcileTarget {
  product: 'usdm' | 'spot';
  /** Shared transports — the same hosts, weight budgets and mocks as always. */
  core: Pick<CoreContext, 'events' | 'http'>;
  /** Paper wiring; presence switches the pass to the simulator's book. */
  paper?: { engine: PaperTradingEngine; adapter: PaperExecutionAdapter };
  orders: OrderTracker;
  positions: PositionTracker;
}

/**
 * Run one reconciliation pass — see the module doc. Returns how many views
 * were folded; throws only on transport failure (the caller decides whether
 * that is fatal — for a startup gap-fill it usually is not).
 */
export async function reconcileExecutionPlatform(
  target: ReconcileTarget,
  options: ReconcileOptions = {},
): Promise<ReconciliationSummary> {
  const fetchedAt = Date.now();
  let ordersFolded = 0;
  let positionsFolded = 0;

  if (target.paper) {
    // Paper mode: the simulator's book is the authoritative REST view.
    for (const raw of target.paper.adapter.listOrderRecords()) {
      target.orders.applyOrderShape(orderShapeFromUsdmOpenOrder(raw));
      ordersFolded += 1;
    }
    for (const position of Object.values(target.paper.engine.getAllPositions())) {
      if (options.symbols && !options.symbols.includes(position.symbol)) continue;
      target.positions.applyUpdate(paperPositionUpdate(position, fetchedAt));
      positionsFolded += 1;
    }
  } else if (target.product === 'usdm') {
    const fapiRoot: HttpClient = target.core.http('fapiRoot');
    const params: Record<string, unknown> = {};
    if (options.symbols && options.symbols.length === 1) {
      params.symbol = options.symbols[0].toUpperCase();
    }
    const openOrders = (await fapiRoot.get(
      '/fapi/v1/openOrders',
      params,
      'signed',
    )) as Record<string, unknown>[];
    for (const raw of openOrders) {
      target.orders.applyOrderShape(orderShapeFromUsdmOpenOrder(raw));
      ordersFolded += 1;
    }
    const positionRisk = (await fapiRoot.get(
      '/fapi/v2/positionRisk',
      {},
      'signed',
    )) as Record<string, unknown>[];
    for (const raw of positionRisk) {
      const updates = positionUpdatesFromPositionRisk(raw, fetchedAt);
      for (const update of updates) {
        if (options.symbols && !options.symbols.includes(update.symbol)) continue;
        target.positions.applyUpdate(update);
        positionsFolded += 1;
      }
    }
  } else {
    // Spot: openOrders requires a symbol (or symbol list) — Binance removed
    // the symbol-less form. Positions do not exist on spot.
    const symbols = options.symbols?.map((symbol) => symbol.toUpperCase());
    if (!symbols || symbols.length === 0) {
      throw new Error(
        'ExecutionPlatform.reconcile: spot reconciliation requires { symbols: [...] } — ' +
          'the spot openOrders route no longer accepts an account-wide query',
      );
    }
    const spot: HttpClient = target.core.http('spot');
    const openOrders = (await spot.get(
      '/openOrders',
      symbols.length === 1 ? { symbol: symbols[0] } : { symbols: JSON.stringify(symbols) },
      'signed',
    )) as Record<string, unknown>[];
    for (const raw of openOrders) {
      target.orders.applyOrderShape(orderShapeFromSpotOpenOrder(raw));
      ordersFolded += 1;
    }
  }

  const summary: ReconciliationSummary = {
    orders: ordersFolded,
    positions: positionsFolded,
    fetchedAt,
  };
  (target.core.events as EventBus | undefined)?.scoped('execution').emit('reconciled', {
    product: target.product,
    backend: target.paper ? 'paper' : 'live',
    orders: summary.orders,
    positions: summary.positions,
  });
  return summary;
}

// ---------------------------------------------------------------------------
// USDⓈ-M REST normalizers
// ---------------------------------------------------------------------------

/**
 * `GET /fapi/v1/openOrders` row (and the paper adapter's raw records, which
 * mirror it) → decimal-string {@link OrderShape} for the tracker's REST fold.
 */
export function orderShapeFromUsdmOpenOrder(raw: Record<string, unknown>): OrderShape {
  return {
    orderId: toNumber(raw.orderId),
    clientOrderId: String(raw.clientOrderId ?? ''),
    symbol: String(raw.symbol ?? ''),
    side: String(raw.side ?? ''),
    type: String(raw.type ?? ''),
    status: String(raw.status ?? ''),
    executedQty: toDecimalString(raw.executedQty),
    cumQuote: toDecimalString(raw.cumQuote),
    avgPrice: toDecimalString(raw.avgPrice),
    updateTime: toNumber(raw.updateTime) ?? Date.now(),
    fills: [],
  };
}

/**
 * `GET /fapi/v2/positionRisk` row → {@link PositionUpdate}. Binance reports
 * one row per symbol × positionSide, including zero-size rows — folding a
 * zero row is the correct "authoritative flat" semantics.
 */
export function positionUpdatesFromPositionRisk(
  raw: Record<string, unknown>,
  fetchedAt: number,
): PositionUpdate[] {
  const symbol = raw.symbol;
  if (typeof symbol !== 'string' || symbol === '') return [];
  return [
    {
      symbol,
      positionSide: String(raw.positionSide ?? 'BOTH'),
      positionAmount: toDecimalString(raw.positionAmt),
      entryPrice: toDecimalString(raw.entryPrice),
      unrealizedPnl: nonZeroish(toDecimalString(raw.unRealizedProfit)),
      marginType: String(raw.marginType ?? 'cross') || null,
      isolatedWallet: raw.isolatedMargin !== undefined ? toDecimalString(raw.isolatedMargin) : null,
      updateTime: toNumber(raw.updateTime) ?? fetchedAt,
      raw,
    },
  ];
}

// ---------------------------------------------------------------------------
// Spot REST normalizers
// ---------------------------------------------------------------------------

/** `GET /api/v3/openOrders` row → decimal-string {@link OrderShape}. */
export function orderShapeFromSpotOpenOrder(raw: Record<string, unknown>): OrderShape {
  return {
    orderId: toNumber(raw.orderId),
    clientOrderId: String(raw.clientOrderId ?? ''),
    symbol: String(raw.symbol ?? ''),
    side: String(raw.side ?? ''),
    type: String(raw.type ?? ''),
    status: String(raw.status ?? ''),
    executedQty: toDecimalString(raw.executedQty),
    // Spot's field is the (sic) double-m `cummulativeQuoteQty`.
    cumQuote: toDecimalString(raw.cummulativeQuoteQty ?? raw.cumQuote),
    avgPrice: '',
    updateTime: toNumber(raw.updateTime) ?? Date.now(),
    fills: [],
  };
}

// ---------------------------------------------------------------------------
// Paper normalizer
// ---------------------------------------------------------------------------

/** Simulator position → `PositionUpdate` (signed one-way amount, like Binance). */
function paperPositionUpdate(
  position: { symbol: string; side: string; quantity: number; entryPrice: number; unrealizedPnl: number },
  fetchedAt: number,
): PositionUpdate {
  const signedAmount = position.side === 'SHORT' ? -position.quantity : position.quantity;
  return {
    symbol: position.symbol,
    positionSide: 'BOTH',
    positionAmount: decimalString(signedAmount),
    entryPrice: decimalString(position.entryPrice),
    unrealizedPnl: decimalString(position.unrealizedPnl),
    marginType: 'cross',
    isolatedWallet: '0',
    updateTime: fetchedAt,
    raw: position,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function toDecimalString(value: unknown): string {
  if (value === undefined || value === null || value === '') return '0';
  if (typeof value === 'number') return decimalString(value);
  return String(value);
}

function nonZeroish(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '0' || trimmed === '0.0' || trimmed === '-0') return null;
  // Cheap "looks zero" check via Number (display only — record keeps string).
  return Number(trimmed) === 0 ? null : trimmed;
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
