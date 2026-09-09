import { Decimal } from '../core/decimal.js';
import type { CreateOrderParams } from '../types/trading.types.js';
import type { FuturesTrading } from '../resources/FuturesTrading.js';
import type { SpotTrading } from '../resources/SpotTrading.js';
import type { ExecutionFill } from './types.js';

/**
 * Product adapter for {@link ExecutionManager}.
 *
 * The manager owns the *policy* of reliable execution — idempotency keys,
 * in-flight dedup, the reconciliation matrix, the ledger, risk feed-through.
 * Everything product-specific (which REST calls to make, which response fields
 * mean what, which user-stream event carries fills) lives behind this
 * interface, so USDⓈ-M, Spot and the paper simulator share one identical
 * execution semantics:
 *
 * ```ts
 * const execution = await client.spot.execution.placeOrder({ ... });
 * // same Execution envelope as client.futures.execution / paper
 * ```
 */

/** Normalized order shape: every price/quantity an exact decimal string. */
export interface OrderShape {
  orderId?: number;
  clientOrderId: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  executedQty: string;
  cumQuote: string;
  avgPrice: string;
  updateTime: number;
  fills: ExecutionFill[];
}

/** Normalized user-stream execution report (fills/status progression). */
export interface ExecutionReportShape {
  clientOrderId: string;
  orderId?: number;
  status: string;
  /** Last fill price / quantity, when this report carries a trade. */
  lastPrice?: string;
  lastQty?: string;
  commission?: string;
  commissionAsset?: string;
  /** Cumulative executed quantity, when the stream reports it. */
  executedQty?: string;
  /** Cumulative quote volume, when the stream reports it. */
  cumQuote?: string;
  /** Average fill price, when the stream reports it. */
  avgPrice?: string;
  tradeId?: number;
  /**
   * Order context the report carries, when its source knows it (the paper
   * adapter always does). Consumers that translate reports into user-stream
   * frames (the v3 paper session) need it; the execution manager ignores it.
   */
  symbol?: string;
  /** Order side ('BUY' | 'SELL'), when known. */
  side?: string;
  /** Original order type ('MARKET' | 'LIMIT' | …), when known. */
  orderType?: string;
  /** Requested quantity, when known. */
  originalQty?: string;
}

/** Key that identifies an order for get/cancel reconciliation. */
export interface OrderKey {
  orderId?: number;
  origClientOrderId?: string;
}

/** Minimal user-stream surface both the spot and futures WS classes satisfy. */
export interface UserStreamLike {
  on(event: 'userData', listener: (event: unknown) => void): unknown;
  off(event: 'userData', listener: (event: unknown) => void): unknown;
}

export interface ExecutionAdapter {
  /** Product label used in events and errors. */
  readonly product: string;
  /** Submit an order; resolves with the raw exchange (or simulator) response. */
  createOrder(submission: CreateOrderParams): Promise<Record<string, unknown>>;
  /** Fetch an order by key; rejects with BinanceApiError -2013 when absent. */
  fetchOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>>;
  /** Cancel an order by key. */
  cancelOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>>;
  /** Normalize a create/fetch/cancel response into decimal-string form. */
  toOrderShape(raw: Record<string, unknown>): OrderShape;
  /** Attach (or detach) the product's user data stream. */
  setUserStream(ws: UserStreamLike | null): void;
  /** Register a listener for normalized execution reports. */
  onReport(handler: (report: ExecutionReportShape) => void): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  if (value === undefined || value === null) return '0';
  return String(value);
}

function numOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rawFills(raw: Record<string, unknown>): ExecutionFill[] {
  const fills = raw.fills;
  if (!Array.isArray(fills)) return [];
  const result: ExecutionFill[] = [];
  for (const fill of fills) {
    if (!fill || typeof fill !== 'object') continue;
    const record = fill as Record<string, unknown>;
    if (record.price === undefined || record.qty === undefined) continue;
    result.push({
      price: Decimal.from(record.price as string | number).toString(),
      quantity: Decimal.from(record.qty as string | number).toString(),
      commission:
        record.commission !== undefined
          ? Decimal.from(record.commission as string | number).toString()
          : undefined,
      commissionAsset:
        typeof record.commissionAsset === 'string' ? record.commissionAsset : undefined,
    });
  }
  return result;
}

function reportFrom(
  raw: Record<string, unknown>,
  fields: {
    clientOrderId: string;
    orderId: string;
    status: string;
    lastPrice: string;
    lastQty: string;
    commission: string;
    commissionAsset: string;
    executedQty: string;
    cumQuote?: string;
    avgPrice: string;
    tradeId: string;
  },
): ExecutionReportShape | null {
  const clientOrderId = raw[fields.clientOrderId];
  if (clientOrderId === undefined || clientOrderId === null || clientOrderId === '') return null;
  const report: ExecutionReportShape = {
    clientOrderId: String(clientOrderId),
    status: String(raw[fields.status] ?? ''),
  };
  if (raw[fields.orderId] !== undefined) report.orderId = numOr(raw[fields.orderId], 0);
  if (raw[fields.lastPrice] !== undefined) report.lastPrice = String(raw[fields.lastPrice]);
  if (raw[fields.lastQty] !== undefined) report.lastQty = String(raw[fields.lastQty]);
  if (raw[fields.commission] !== undefined) report.commission = String(raw[fields.commission]);
  if (raw[fields.commissionAsset] !== undefined)
    report.commissionAsset = String(raw[fields.commissionAsset]);
  if (raw[fields.executedQty] !== undefined) report.executedQty = String(raw[fields.executedQty]);
  if (raw[fields.avgPrice] !== undefined && String(raw[fields.avgPrice]) !== '')
    report.avgPrice = String(raw[fields.avgPrice]);
  if (fields.cumQuote && raw[fields.cumQuote] !== undefined)
    report.cumQuote = String(raw[fields.cumQuote]);
  if (raw[fields.tradeId] !== undefined) report.tradeId = numOr(raw[fields.tradeId], 0);
  return report;
}

/** The userData listener signature both adapters share. */
type UserDataListener = (event: unknown) => void;

// ---------------------------------------------------------------------------
// USDⓈ-M futures adapter
// ---------------------------------------------------------------------------

/**
 * Binance USDⓈ-M (fapi) execution adapter: order field names (`cumQuote`,
 * `avgPrice`), `ORDER_TRADE_UPDATE` report shape, and -2011/-2013 semantics.
 */
export class FuturesExecutionAdapter implements ExecutionAdapter {
  readonly product = 'usdm';
  private reportHandler: ((report: ExecutionReportShape) => void) | null = null;
  private userDataListener: UserDataListener | null = null;
  private userStream: UserStreamLike | null = null;

  constructor(private readonly trading: FuturesTrading) {}

  async createOrder(submission: CreateOrderParams): Promise<Record<string, unknown>> {
    return (await this.trading.createOrder(submission)) as unknown as Record<string, unknown>;
  }

  async fetchOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>> {
    return (await this.trading.getOrder(symbol, {
      orderId: key.orderId,
      origClientOrderId: key.origClientOrderId,
    })) as unknown as Record<string, unknown>;
  }

  async cancelOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>> {
    return (await this.trading.cancelOrder(symbol, {
      orderId: key.orderId,
      origClientOrderId: key.origClientOrderId,
    })) as unknown as Record<string, unknown>;
  }

  toOrderShape(raw: Record<string, unknown>): OrderShape {
    return {
      orderId: raw.orderId !== undefined ? numOr(raw.orderId, 0) : undefined,
      clientOrderId: String(raw.clientOrderId ?? ''),
      symbol: String(raw.symbol ?? ''),
      side: String(raw.side ?? ''),
      type: String(raw.type ?? ''),
      status: String(raw.status ?? ''),
      executedQty: str(raw.executedQty),
      cumQuote: str(raw.cumQuote),
      avgPrice: str(raw.avgPrice),
      updateTime: raw.updateTime !== undefined ? numOr(raw.updateTime, Date.now()) : Date.now(),
      fills: rawFills(raw),
    };
  }

  setUserStream(ws: UserStreamLike | null): void {
    if (this.userStream && this.userDataListener) {
      this.userStream.off('userData', this.userDataListener);
    }
    this.userStream = ws;
    if (ws && this.userDataListener) {
      ws.on('userData', this.userDataListener);
    }
  }

  onReport(handler: (report: ExecutionReportShape) => void): void {
    this.reportHandler = handler;
    this.userDataListener = (event: unknown): void => {
      if (
        event === null ||
        typeof event !== 'object' ||
        (event as { e?: string }).e !== 'ORDER_TRADE_UPDATE'
      ) {
        return;
      }
      const order = (event as { o?: Record<string, unknown> }).o;
      if (!order || typeof order !== 'object') return;
      const report = reportFrom(order, {
        clientOrderId: 'c',
        orderId: 'i',
        status: 'X',
        lastPrice: 'L',
        lastQty: 'l',
        commission: 'n',
        commissionAsset: 'N',
        executedQty: 'z',
        avgPrice: 'ap',
        tradeId: 't',
      });
      if (report) this.reportHandler?.(report);
    };
    // Late registration (manager attaches after construction): wire now.
    if (this.userStream && this.userDataListener) {
      this.userStream.on('userData', this.userDataListener);
    }
  }
}

// ---------------------------------------------------------------------------
// Spot adapter
// ---------------------------------------------------------------------------

/**
 * Binance spot (api/v3) execution adapter: `cummulativeQuoteQty` field name,
 * `executionReport` user-stream shape (fills report `Z` cumulative quote), and
 * the same -2011/-2013 error semantics.
 */
export class SpotExecutionAdapter implements ExecutionAdapter {
  readonly product = 'spot';
  private reportHandler: ((report: ExecutionReportShape) => void) | null = null;
  private userDataListener: UserDataListener | null = null;
  private userStream: UserStreamLike | null = null;

  constructor(private readonly trading: SpotTrading) {}

  async createOrder(submission: CreateOrderParams): Promise<Record<string, unknown>> {
    return (await this.trading.createOrder(
      submission as unknown as Record<string, unknown>,
    )) as unknown as Record<string, unknown>;
  }

  async fetchOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>> {
    return (await this.trading.getOrder(symbol, {
      orderId: key.orderId,
      origClientOrderId: key.origClientOrderId,
    })) as unknown as Record<string, unknown>;
  }

  async cancelOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>> {
    return (await this.trading.cancelOrder(symbol, {
      orderId: key.orderId,
      origClientOrderId: key.origClientOrderId,
    })) as unknown as Record<string, unknown>;
  }

  toOrderShape(raw: Record<string, unknown>): OrderShape {
    // Spot orders carry cummulativeQuoteQty (not cumQuote) and may omit
    // avgPrice entirely (computed as quote/qty when filled).
    const executedQty = str(raw.executedQty);
    const cumQuote = raw.cummulativeQuoteQty !== undefined ? str(raw.cummulativeQuoteQty) : str(raw.cumQuote);
    let avgPrice = str(raw.avgPrice);
    if (raw.avgPrice === undefined) {
      const qty = Decimal.from(executedQty);
      if (!qty.isZero() && raw.cummulativeQuoteQty !== undefined) {
        avgPrice = Decimal.from(cumQuote).div(qty).toString();
      }
    }
    return {
      orderId: raw.orderId !== undefined ? numOr(raw.orderId, 0) : undefined,
      clientOrderId: String(raw.clientOrderId ?? ''),
      symbol: String(raw.symbol ?? ''),
      side: String(raw.side ?? ''),
      type: String(raw.type ?? ''),
      status: String(raw.status ?? ''),
      executedQty,
      cumQuote,
      avgPrice,
      updateTime:
        raw.transactTime !== undefined
          ? numOr(raw.transactTime, Date.now())
          : raw.workingTime !== undefined
            ? numOr(raw.workingTime, Date.now())
            : raw.updateTime !== undefined
              ? numOr(raw.updateTime, Date.now())
              : Date.now(),
      fills: rawFills(raw),
    };
  }

  setUserStream(ws: UserStreamLike | null): void {
    if (this.userStream && this.userDataListener) {
      this.userStream.off('userData', this.userDataListener);
    }
    this.userStream = ws;
    if (ws && this.userDataListener) {
      ws.on('userData', this.userDataListener);
    }
  }

  onReport(handler: (report: ExecutionReportShape) => void): void {
    this.reportHandler = handler;
    this.userDataListener = (event: unknown): void => {
      if (
        event === null ||
        typeof event !== 'object' ||
        (event as { e?: string }).e !== 'executionReport'
      ) {
        return;
      }
      const report = reportFrom(event as Record<string, unknown>, {
        clientOrderId: 'c',
        orderId: 'i',
        status: 'X',
        lastPrice: 'L',
        lastQty: 'l',
        commission: 'n',
        commissionAsset: 'N',
        executedQty: 'z',
        cumQuote: 'Z',
        avgPrice: 'ap',
        tradeId: 't',
      });
      if (report) this.reportHandler?.(report);
    };
    if (this.userStream && this.userDataListener) {
      this.userStream.on('userData', this.userDataListener);
    }
  }
}

/** Structural test: does this object already implement the adapter interface? */
export function isExecutionAdapter(candidate: unknown): candidate is ExecutionAdapter {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'toOrderShape' in candidate &&
    'fetchOrder' in candidate &&
    'createOrder' in candidate
  );
}
