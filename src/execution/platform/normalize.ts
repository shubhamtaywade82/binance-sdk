import { Decimal } from '../../core/decimal.js';
import { parseUserDataEvent } from '../../types/userdata.types.js';
import { parseSpotUserDataEvent } from '../../types/spot.types.js';
import type { OrderShape } from '../adapter.js';
import type { ExecutionFill } from '../types.js';
import type { OrderRecord, OrderUpdate, PositionUpdate } from './types.js';

/**
 * Pure normalization for the execution platform: raw user-data frames and
 * REST order views become decimal-string {@link OrderUpdate}s and
 * {@link PositionUpdate}s, which the trackers fold. Product field-name
 * differences (USDⓈ-M `ORDER_TRADE_UPDATE.o` vs Spot `executionReport`, spot
 * `Z` cumulative quote vs none on futures) end here — nothing downstream
 * knows which product an update came from.
 *
 * Normalization always reads the *raw frame* strings, never the
 * schema-transformed numbers: Binance transmits exact decimals precisely
 * because binary floats cannot represent them, so coercing through `Number`
 * and back would corrupt values like `123.456` at exactly the fields money
 * math depends on. Zod runs as a validation-only pass (see
 * {@link createUserEventParser}); the raw string survives to `Decimal`.
 */

/** Parse one raw user-data frame — validates, then returns the frame untouched. */
export type UserEventParser = (raw: unknown) => unknown;

/** Raw `ORDER_TRADE_UPDATE` frame → OrderUpdate. */
export function orderUpdateFromOrderTradeUpdate(raw: Record<string, unknown>): OrderUpdate | null {
  const o = raw.o;
  if (o === null || typeof o !== 'object') return null;
  const order = o as Record<string, unknown>;
  const clientOrderId = order.c;
  if (typeof clientOrderId !== 'string' || clientOrderId === '') return null;
  const lastQty = decOf(order.l);
  return {
    clientOrderId,
    exchangeOrderId: numOr(order.i),
    symbol: str(order.s),
    side: str(order.S),
    // `ot` is the original order type (matches REST `type`); `o` is the
    // current type, which differs only for trailing/protective variants.
    type: str(order.ot) || str(order.o),
    status: str(order.X),
    originalQuantity: decOf(order.q),
    executedQuantity: decOf(order.z) ?? '0',
    // ORDER_TRADE_UPDATE carries no cumulative quote; the fold estimates it.
    cumulativeQuoteQuantity: null,
    averagePrice: nonZero(decOf(order.ap)),
    lastFill:
      lastQty !== null && !Decimal.from(lastQty).isZero()
        ? {
            price: decOf(order.L) ?? '0',
            quantity: lastQty,
            commission: nonZero(decOf(order.n)) ?? undefined,
            commissionAsset: str(order.N) || undefined,
            tradeId: numOr(order.t),
          }
        : null,
    positionSide: str(order.ps) || undefined,
    reduceOnly: typeof order.R === 'boolean' ? order.R : undefined,
    timeInForce: str(order.f) || undefined,
    updateTime: numOr(order.T) ?? Date.now(),
    source: 'user-stream',
    raw,
  };
}

/** Raw Spot `executionReport` frame → OrderUpdate. */
export function orderUpdateFromSpotExecutionReport(
  raw: Record<string, unknown>,
): OrderUpdate | null {
  const clientOrderId = raw.c;
  if (typeof clientOrderId !== 'string' || clientOrderId === '') return null;
  const executedQty = decOf(raw.z);
  const cumQuote = decOf(raw.Z);
  const lastQty = decOf(raw.l);
  return {
    clientOrderId,
    exchangeOrderId: numOr(raw.i),
    symbol: str(raw.s),
    side: str(raw.S),
    type: str(raw.o),
    status: str(raw.X),
    originalQuantity: decOf(raw.q),
    executedQuantity: executedQty ?? '0',
    // Spot reports cumulative quote natively (`Z`).
    cumulativeQuoteQuantity: nonZero(cumQuote),
    // Spot has no `ap`; compute Z/z exactly like the spot execution adapter.
    averagePrice:
      nonZero(decOf(raw.ap)) ??
      (executedQty !== null && cumQuote !== null && !Decimal.from(executedQty).isZero()
        ? Decimal.from(cumQuote).div(executedQty).toString()
        : null),
    lastFill:
      lastQty !== null && !Decimal.from(lastQty).isZero()
        ? {
            price: decOf(raw.L) ?? '0',
            quantity: lastQty,
            commission: nonZero(decOf(raw.n)) ?? undefined,
            commissionAsset: str(raw.N) || undefined,
            tradeId: numOr(raw.t),
          }
        : null,
    positionSide: undefined,
    reduceOnly: undefined,
    timeInForce: str(raw.f) || undefined,
    updateTime: numOr(raw.T) ?? Date.now(),
    source: 'user-stream',
    raw,
  };
}

/** Raw `ACCOUNT_UPDATE` frame → PositionUpdate list (`a.P` entries). */
export function positionUpdatesFromAccountUpdate(raw: Record<string, unknown>): PositionUpdate[] {
  const a = raw.a;
  if (a === null || typeof a !== 'object') return [];
  const entries = (a as Record<string, unknown>).P;
  if (!Array.isArray(entries)) return [];
  const updateTime = numOr(raw.T) ?? Date.now();
  const updates: PositionUpdate[] = [];
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.s !== 'string' || p.s === '') continue;
    updates.push({
      symbol: p.s,
      positionSide: str(p.ps) || 'BOTH',
      positionAmount: decOf(p.pa) ?? '0',
      entryPrice: decOf(p.ep) ?? '0',
      unrealizedPnl: nonZero(decOf(p.up)),
      marginType: str(p.mt) || null,
      isolatedWallet: decOf(p.iw),
      updateTime,
      raw: p,
    });
  }
  return updates;
}

/** REST order view (create ack / query / cancel result) → OrderUpdate. */
export function orderUpdateFromOrderShape(shape: OrderShape): OrderUpdate {
  const executedQty = Decimal.from(shape.executedQty);
  const cumQuote = Decimal.from(shape.cumQuote);
  return {
    clientOrderId: shape.clientOrderId,
    exchangeOrderId: shape.orderId,
    symbol: shape.symbol,
    side: shape.side,
    type: shape.type,
    status: shape.status,
    originalQuantity: null, // REST order views carry no original-quantity field
    executedQuantity: shape.executedQty,
    cumulativeQuoteQuantity:
      nonZero(shape.cumQuote) ?? estimateQuote(executedQty, cumQuote, shape.avgPrice),
    averagePrice: nonZero(decOf(shape.avgPrice)),
    lastFill: null,
    positionSide: undefined,
    reduceOnly: undefined,
    timeInForce: undefined,
    updateTime: shape.updateTime,
    source: 'rest',
    raw: shape as unknown as Record<string, unknown>,
  };
}

/**
 * Fold one observation into an order record (in place — the tracker owns the
 * record and hands out copies). Terminal records are never mutated; the
 * tracker guards that before calling.
 */
export function foldOrderUpdate(record: OrderRecord, update: OrderUpdate): void {
  record.status = update.status;
  if (update.exchangeOrderId !== undefined) record.exchangeOrderId = update.exchangeOrderId;
  if (!record.side && update.side) record.side = update.side;
  if (!record.type && update.type) record.type = update.type;
  if (record.positionSide === undefined && update.positionSide) {
    record.positionSide = update.positionSide;
  }
  if (record.reduceOnly === undefined && update.reduceOnly !== undefined) {
    record.reduceOnly = update.reduceOnly;
  }
  if (record.timeInForce === undefined && update.timeInForce) {
    record.timeInForce = update.timeInForce;
  }
  if (update.originalQuantity !== null) record.originalQuantity = update.originalQuantity;
  record.executedQuantity = update.executedQuantity;
  if (update.averagePrice !== null) record.averagePrice = update.averagePrice;
  if (update.cumulativeQuoteQuantity !== null) {
    record.cumulativeQuoteQuantity = update.cumulativeQuoteQuantity;
  } else if (record.cumulativeQuoteQuantity === null) {
    // USDⓈ-M streams report no cumulative quote: estimate z × ap, the same
    // approximation the execution ledger makes.
    const qty = Decimal.from(update.executedQuantity);
    const avg = update.averagePrice ?? record.averagePrice;
    if (avg !== null && !qty.isZero()) {
      record.cumulativeQuoteQuantity = qty.mul(avg).toString();
    }
  }
  if (update.lastFill) appendFill(record.fills, update.lastFill);
  if (update.updateTime > record.updatedAt) record.updatedAt = update.updateTime;
}

/** Seed a fresh record from its first observation. */
export function orderRecordFromUpdate(update: OrderUpdate): OrderRecord {
  const record: OrderRecord = {
    clientOrderId: update.clientOrderId,
    symbol: update.symbol,
    side: update.side,
    type: update.type,
    status: update.status,
    originalQuantity: update.originalQuantity,
    executedQuantity: update.executedQuantity,
    cumulativeQuoteQuantity: update.cumulativeQuoteQuantity,
    averagePrice: update.averagePrice,
    fills: [],
    positionSide: update.positionSide,
    reduceOnly: update.reduceOnly,
    timeInForce: update.timeInForce,
    firstSeenAt: update.updateTime,
    updatedAt: update.updateTime,
  };
  foldOrderUpdate(record, update);
  return record;
}

/**
 * Build the per-product frame parser for a user-data session. The typed Zod
 * schemas run as a *validation* pass — a frame that parses is known-good
 * Binance shape; the raw frame (decimal strings intact) is returned untouched
 * so normalization keeps exact decimals. Frames with unknown-but-valid `e`
 * types (new Binance events, e.g. `TRADE_LITE`) pass through unvalidated;
 * shapeless frames throw and the session surfaces them as errors.
 */
export function createUserEventParser(product: 'usdm' | 'spot'): UserEventParser {
  if (product === 'spot') {
    return (raw: unknown): unknown => {
      try {
        parseSpotUserDataEvent(raw);
      } catch {
        return passthrough(raw);
      }
      return raw;
    };
  }
  return (raw: unknown): unknown => {
    try {
      parseUserDataEvent(raw);
    } catch {
      return passthrough(raw);
    }
    return raw;
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function passthrough(raw: unknown): unknown {
  if (typeof raw === 'object' && raw !== null && typeof (raw as { e?: unknown }).e === 'string') {
    return raw;
  }
  throw new Error('Unrecognized user-data frame');
}

function appendFill(fills: ExecutionFill[], fill: ExecutionFill): void {
  if (fill.tradeId !== undefined && fills.some((f) => f.tradeId === fill.tradeId)) return;
  fills.push(fill);
}

function estimateQuote(executedQty: Decimal, cumQuote: Decimal, avgPrice: string): string | null {
  if (!cumQuote.isZero()) return cumQuote.toString();
  if (!executedQty.isZero() && avgPrice && !Decimal.from(avgPrice).isZero()) {
    return executedQty.mul(avgPrice).toString();
  }
  return null;
}

/** Normalize any decimal-carrying value (string preferred, number tolerated). */
function decOf(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    try {
      return Decimal.from(value).toString();
    } catch {
      return null;
    }
  }
  return null;
}

function nonZero(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  try {
    return Decimal.from(value).isZero() ? null : value;
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numOr(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
