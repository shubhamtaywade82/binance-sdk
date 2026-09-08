import { BinanceApiError } from '../errors/index.js';
import type { PaperTradingEngine } from '../paper/PaperTradingEngine.js';
import type { CreateOrderParams } from '../types/trading.types.js';
import type { ExecutionAdapter, ExecutionReportShape, OrderKey, OrderShape, UserStreamLike } from './adapter.js';
import { isExecutionAdapter } from './adapter.js';

/**
 * Paper execution backend: routes orders through the local
 * {@link PaperTradingEngine} simulator instead of the exchange, behind the
 * exact same {@link ExecutionAdapter} interface the live products use.
 *
 * The point is *identical semantics*: `placeOrder` returns the same
 * `Execution` envelope, `reconcile()` runs the same matrix, fetches of
 * unknown orders fail with the same `-2013` Binance error the exchange would
 * return, and fills stream in as execution reports just like a user-data
 * stream would deliver them. Code written against the paper backend can be
 * switched to live by changing one configuration value.
 *
 * The simulator fills instantly (per its execution model), so:
 *  - `createOrder` resolves with the fill already booked;
 *  - `fetchOrder` replays the stored record (reconciliation succeeds);
 *  - `cancelOrder` mirrors the exchange's `-2011` for orders no longer on
 *    the book, which the ExecutionManager reconciles into a terminal
 *    CANCELED execution — the same path live takes.
 */
export class PaperExecutionAdapter implements ExecutionAdapter {
  readonly product = 'paper';
  /** clientOrderId → raw order record, the simulator's "matching engine" view. */
  private readonly orders = new Map<string, Record<string, unknown>>();
  private reportHandler: ((report: ExecutionReportShape) => void) | null = null;

  constructor(
    private readonly engine: PaperTradingEngine,
    private readonly options: { commissionAsset?: string } = {},
  ) {}

  /** The underlying simulator (account, positions, order history). */
  get simulator(): PaperTradingEngine {
    return this.engine;
  }

  async createOrder(submission: CreateOrderParams): Promise<Record<string, unknown>> {
    const clientOrderId = submission.newClientOrderId;
    if (!clientOrderId) {
      throw new BinanceApiError(
        'Paper execution requires newClientOrderId (the reconciliation key)',
        -1102,
        400,
        {},
      );
    }
    const type = String(submission.type ?? 'MARKET').toUpperCase();
    if (type !== 'MARKET' && type !== 'LIMIT') {
      throw new BinanceApiError(
        `Paper execution supports MARKET and LIMIT orders (got ${type})`,
        -1116,
        400,
        {},
      );
    }
    const quantity = Number(submission.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BinanceApiError('Quantity must be a positive number', -1013, 400, {});
    }
    const price = submission.price !== undefined ? Number(submission.price) : undefined;
    if (type === 'LIMIT' && (!Number.isFinite(price) || (price ?? 0) <= 0)) {
      throw new BinanceApiError('Limit orders require a positive price', -1013, 400, {});
    }

    let paperOrder;
    try {
      paperOrder = await this.engine.placeOrder({
        symbol: String(submission.symbol),
        side: String(submission.side).toUpperCase() as 'BUY' | 'SELL',
        type: type as 'MARKET' | 'LIMIT',
        quantity,
        price,
      });
    } catch (err) {
      // Rejections (insufficient balance, model rejection) surface as exchange
      // rejections so the manager records them identically.
      throw new BinanceApiError((err as Error).message, -2019, 400, {});
    }

    const filledQty = paperOrder.filledQuantity;
    const avgPrice = paperOrder.avgFillPrice;
    const cumQuote = filledQty * avgPrice;
    const raw: Record<string, unknown> = {
      orderId: paperOrder.orderId,
      clientOrderId,
      symbol: paperOrder.symbol,
      side: submission.side,
      type,
      status: paperOrder.status,
      executedQty: String(filledQty),
      cumQuote: String(cumQuote),
      avgPrice: String(avgPrice),
      updateTime: paperOrder.createdAt,
      fills: [
        {
          price: String(avgPrice),
          qty: String(filledQty),
          commission:
            paperOrder.commission !== undefined ? String(paperOrder.commission) : undefined,
          commissionAsset: paperOrder.commission !== undefined ? this.options.commissionAsset ?? 'USDT' : undefined,
        },
      ],
      paper: true,
    };
    this.orders.set(clientOrderId, raw);

    // Deliver the fill as an execution report — the same shape a live
    // user-data stream would emit, so streaming consumers see fills without
    // knowing which backend produced them.
    this.reportHandler?.({
      clientOrderId,
      orderId: paperOrder.orderId,
      status: paperOrder.status,
      lastPrice: String(avgPrice),
      lastQty: String(filledQty),
      commission: paperOrder.commission !== undefined ? String(paperOrder.commission) : '0',
      commissionAsset: this.options.commissionAsset ?? 'USDT',
      executedQty: String(filledQty),
      cumQuote: String(cumQuote),
      avgPrice: String(avgPrice),
    });

    return raw;
  }

  async fetchOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>> {
    const id = key.origClientOrderId ?? '';
    const raw = this.orders.get(id);
    if (!raw || String(raw.symbol) !== symbol.toUpperCase()) {
      // Identical to the exchange: -2013 order does not exist.
      throw new BinanceApiError('Order does not exist', -2013, 400, {});
    }
    return { ...raw };
  }

  async cancelOrder(symbol: string, key: OrderKey): Promise<Record<string, unknown>> {
    const id = key.origClientOrderId ?? '';
    const raw = this.orders.get(id);
    if (!raw || String(raw.symbol) !== symbol.toUpperCase()) {
      throw new BinanceApiError('Unknown order sent', -2011, 400, {});
    }
    // Simulator fills instantly: the order is never resting on a book, so a
    // cancel mirrors the exchange's -2011 for already-terminal orders.
    throw new BinanceApiError('Unknown order sent', -2011, 400, {});
  }

  toOrderShape(raw: Record<string, unknown>): OrderShape {
    return {
      orderId: raw.orderId !== undefined ? Number(raw.orderId) : undefined,
      clientOrderId: String(raw.clientOrderId ?? ''),
      symbol: String(raw.symbol ?? ''),
      side: String(raw.side ?? ''),
      type: String(raw.type ?? ''),
      status: String(raw.status ?? ''),
      executedQty: String(raw.executedQty ?? '0'),
      cumQuote: String(raw.cumQuote ?? '0'),
      avgPrice: String(raw.avgPrice ?? '0'),
      updateTime: raw.updateTime !== undefined ? Number(raw.updateTime) : Date.now(),
      fills: Array.isArray(raw.fills)
        ? (raw.fills as Array<Record<string, unknown>>).map((fill) => ({
            price: String(fill.price ?? '0'),
            quantity: String(fill.qty ?? '0'),
            commission: fill.commission !== undefined ? String(fill.commission) : undefined,
            commissionAsset:
              fill.commissionAsset !== undefined ? String(fill.commissionAsset) : undefined,
          }))
        : [],
    };
  }

  /** Paper has no user-data stream; attach is a no-op. */
  setUserStream(_ws: UserStreamLike | null): void {
    /* no user stream in the simulator */
  }

  onReport(handler: (report: ExecutionReportShape) => void): void {
    this.reportHandler = handler;
  }
}

// Re-exported so callers importing from the paper module get the guard too.
export { isExecutionAdapter };
