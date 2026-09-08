import { FuturesMarket } from '../resources/FuturesMarket.js';
import {
  InstantFillModel,
  NoFeeModel,
  type ExecutionModel,
  type FeeModel,
} from './execution.js';

export type PaperPositionSide = 'LONG' | 'SHORT' | 'NONE';

export { InstantFillModel, SlippageExecutionModel, NoFeeModel, TakerMakerFeeModel } from './execution.js';
export type {
  ExecutionModel,
  FeeModel,
  PaperFill,
  PaperOrderRequest,
  SlippageExecutionModelOptions,
  TakerMakerFeeModelOptions,
} from './execution.js';

export interface PaperPosition {
  symbol: string;
  side: PaperPositionSide;
  entryPrice: number;
  quantity: number;
  leverage: number;
  /** Margin currently allocated to this position, released proportionally as it is reduced. */
  margin: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface PaperOrder {
  orderId: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price: number;
  status: 'FILLED';
  filledQuantity: number;
  avgFillPrice: number;
  /** Realized PnL booked by this order, if it reduced or closed a position. */
  realizedPnl: number;
  /** Quote-unit fee booked by the fee model (0 with the default NoFeeModel). */
  fee?: number;
  /** Execution model that produced the fill (audit trail). */
  executionModel?: string;
  createdAt: number;
}

export interface PaperAccount {
  /** Wallet balance: starts at initialBalance and moves with realized PnL. */
  balance: number;
  /** Wallet balance minus margin currently locked in open positions. */
  availableBalance: number;
  /** balance + unrealized PnL. */
  totalWalletBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  /** Cumulative quote-unit fees booked by the fee model. */
  totalFees: number;
  positions: Record<string, PaperPosition>;
  orders: PaperOrder[];
}

export interface PaperTradingOptions {
  initialBalance?: number;
  /** Injectable so tests and offline callers can supply their own price source. */
  market?: FuturesMarket;
  /** Execution semantics. Default: {@link InstantFillModel} (legacy behavior). */
  executionModel?: ExecutionModel;
  /** Fee schedule. Default: {@link NoFeeModel} (legacy behavior). */
  feeModel?: FeeModel;
}

function emptyPosition(symbol: string): PaperPosition {
  return {
    symbol,
    side: 'NONE',
    entryPrice: 0,
    quantity: 0,
    leverage: 1,
    margin: 0,
    unrealizedPnl: 0,
    openedAt: 0,
  };
}

/**
 * In-memory simulator for USD-M futures fills. Prices come from the live public
 * market endpoints; nothing is ever sent to the exchange.
 *
 * Accounting model: `balance` moves only on realized PnL and fees. Opening a
 * position locks `notional / leverage` of margin out of `availableBalance`;
 * reducing it releases that margin pro-rata and books the realized PnL.
 *
 * Execution semantics are pluggable: the default is the legacy instant-fill
 * (MARKET at the current mark, LIMIT at the stated price, no fees), while
 * {@link SlippageExecutionModel} and {@link TakerMakerFeeModel} add adverse
 * execution noise and fee accounting for execution-quality research. There is
 * still no order book, queue-position or funding simulation.
 */
export class PaperTradingEngine {
  private readonly account: PaperAccount;
  private readonly market: FuturesMarket;
  private readonly executionModel: ExecutionModel;
  private readonly feeModel: FeeModel;
  private orderIdCounter = 1_000_000;

  constructor(options: PaperTradingOptions = {}) {
    this.market = options.market ?? new FuturesMarket();
    this.executionModel = options.executionModel ?? new InstantFillModel();
    this.feeModel = options.feeModel ?? new NoFeeModel();
    const initialBalance = options.initialBalance ?? 10_000;
    this.account = {
      balance: initialBalance,
      availableBalance: initialBalance,
      totalWalletBalance: initialBalance,
      realizedPnl: 0,
      unrealizedPnl: 0,
      totalFees: 0,
      positions: {},
      orders: [],
    };
  }

  /** Current mark price for any tradeable symbol. */
  async getMarketPrice(symbol: string): Promise<number> {
    // `price` is already numeric — TickerPriceSchema transforms it on parse.
    return (await this.market.tickerPrice(symbol.toUpperCase())).price;
  }

  private positionFor(symbol: string): PaperPosition {
    const existing = this.account.positions[symbol];
    if (existing) return existing;
    const created = emptyPosition(symbol);
    this.account.positions[symbol] = created;
    return created;
  }

  async placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    quantity: number;
    price?: number;
    leverage?: number;
  }): Promise<PaperOrder> {
    const symbol = params.symbol.toUpperCase();
    const { side, type, quantity } = params;
    const leverage = params.leverage ?? 1;

    if (!(quantity > 0)) throw new Error('Quantity must be positive');
    if (leverage < 1 || leverage > 125) throw new Error('Leverage must be 1-125');
    if (type === 'LIMIT' && !(params.price! > 0)) throw new Error('Price required for LIMIT orders');

    const marketPrice = await this.getMarketPrice(symbol);

    // Execution and fee models decide the fill; the legacy default is
    // instant-fill at the mark/limit with no fee, byte-for-byte identical to
    // the pre-model engine.
    const request = {
      symbol,
      side,
      type,
      quantity,
      limitPrice: params.price,
      leverage,
    };
    const rawFill = this.executionModel.fill(request, { marketPrice });
    const fee = this.feeModel.computeFee(rawFill, request);
    const fillPrice = rawFill.avgPrice;

    const position = this.positionFor(symbol);
    const opposing =
      (side === 'SELL' && position.side === 'LONG') || (side === 'BUY' && position.side === 'SHORT');

    // Only the quantity that opens or extends exposure consumes new margin.
    const openingQty = opposing ? Math.max(0, quantity - position.quantity) : quantity;
    const requiredMargin = (openingQty * fillPrice) / leverage + fee;
    if (requiredMargin > this.account.availableBalance + 1e-9) {
      throw new Error(
        `Insufficient balance. Required: ${requiredMargin.toFixed(2)}, ` +
          `Available: ${this.account.availableBalance.toFixed(2)}`,
      );
    }

    const realizedPnl = this.applyFill(position, side, quantity, fillPrice, leverage);
    if (fee > 0) {
      this.account.balance -= fee;
      this.account.availableBalance -= fee;
      this.account.totalFees += fee;
    }
    this.markToMarket(symbol, marketPrice);
    this.recomputeTotals();

    const order: PaperOrder = {
      orderId: ++this.orderIdCounter,
      symbol,
      side,
      type,
      quantity,
      price: fillPrice,
      status: 'FILLED',
      filledQuantity: quantity,
      avgFillPrice: fillPrice,
      realizedPnl,
      fee,
      executionModel: rawFill.model,
      createdAt: Date.now(),
    };
    this.account.orders.push(order);
    return order;
  }

  /**
   * Apply a fill to a position, returning the realized PnL it booked.
   * Handles extend, partial reduce, full close, and a flip through zero.
   */
  private applyFill(
    position: PaperPosition,
    side: 'BUY' | 'SELL',
    quantity: number,
    fillPrice: number,
    leverage: number,
  ): number {
    const incoming: PaperPositionSide = side === 'BUY' ? 'LONG' : 'SHORT';

    if (position.side === 'NONE' || position.quantity === 0) {
      this.openExposure(position, incoming, quantity, fillPrice, leverage);
      return 0;
    }

    if (position.side === incoming) {
      this.openExposure(position, incoming, quantity, fillPrice, leverage);
      return 0;
    }

    // Opposing fill: reduce first, then flip any remainder onto the other side.
    const closeQty = Math.min(quantity, position.quantity);
    const realized = this.reduceExposure(position, closeQty, fillPrice);
    const remainder = quantity - closeQty;
    if (remainder > 0) this.openExposure(position, incoming, remainder, fillPrice, leverage);
    return realized;
  }

  private openExposure(
    position: PaperPosition,
    side: PaperPositionSide,
    quantity: number,
    fillPrice: number,
    leverage: number,
  ): void {
    const previousQty = position.quantity;
    const totalQty = previousQty + quantity;
    position.entryPrice =
      totalQty > 0 ? (position.entryPrice * previousQty + fillPrice * quantity) / totalQty : fillPrice;
    position.quantity = totalQty;
    position.side = side;
    position.leverage = leverage;
    if (previousQty === 0) position.openedAt = Date.now();

    const margin = (quantity * fillPrice) / leverage;
    position.margin += margin;
    this.account.availableBalance -= margin;
  }

  /** Reduce a position, releasing margin pro-rata and booking realized PnL. */
  private reduceExposure(position: PaperPosition, closeQty: number, fillPrice: number): number {
    const direction = position.side === 'LONG' ? 1 : -1;
    const realized = (fillPrice - position.entryPrice) * closeQty * direction;

    const releasedMargin = position.quantity > 0 ? position.margin * (closeQty / position.quantity) : 0;
    position.margin -= releasedMargin;
    position.quantity -= closeQty;

    this.account.balance += realized;
    this.account.realizedPnl += realized;
    this.account.availableBalance += releasedMargin + realized;

    if (position.quantity <= 1e-12) {
      position.quantity = 0;
      position.side = 'NONE';
      position.entryPrice = 0;
      position.unrealizedPnl = 0;
      // Guard against float drift leaving a sliver of margin locked forever.
      this.account.availableBalance += position.margin;
      position.margin = 0;
    }
    return realized;
  }

  private markToMarket(symbol: string, price: number): void {
    const position = this.account.positions[symbol];
    if (!position || position.side === 'NONE' || position.quantity === 0) {
      if (position) position.unrealizedPnl = 0;
      return;
    }
    const direction = position.side === 'LONG' ? 1 : -1;
    position.unrealizedPnl = (price - position.entryPrice) * position.quantity * direction;
  }

  private recomputeTotals(): void {
    this.account.unrealizedPnl = Object.values(this.account.positions).reduce(
      (sum, p) => sum + p.unrealizedPnl,
      0,
    );
    this.account.totalWalletBalance = this.account.balance + this.account.unrealizedPnl;
  }

  /** Refresh unrealized PnL for every open position against live prices. */
  async updatePositions(): Promise<void> {
    const open = Object.values(this.account.positions).filter((p) => p.side !== 'NONE');
    await Promise.all(
      open.map(async (position) => {
        try {
          this.markToMarket(position.symbol, await this.getMarketPrice(position.symbol));
        } catch {
          // Leave the last known mark in place if the price feed is unavailable.
        }
      }),
    );
    this.recomputeTotals();
  }

  getAccountInfo(): PaperAccount {
    return {
      ...this.account,
      positions: this.getAllPositions(),
      orders: [...this.account.orders],
    };
  }

  getPosition(symbol: string): PaperPosition | undefined {
    const position = this.account.positions[symbol.toUpperCase()];
    return position ? { ...position } : undefined;
  }

  getAllPositions(): Record<string, PaperPosition> {
    return Object.fromEntries(
      Object.entries(this.account.positions).map(([symbol, p]) => [symbol, { ...p }]),
    );
  }

  /** Open positions only — the zero-size entries left behind by closed trades are filtered out. */
  getOpenPositions(): PaperPosition[] {
    return Object.values(this.account.positions)
      .filter((p) => p.side !== 'NONE')
      .map((p) => ({ ...p }));
  }

  getOrderHistory(symbol?: string): PaperOrder[] {
    const orders = symbol
      ? this.account.orders.filter((o) => o.symbol === symbol.toUpperCase())
      : this.account.orders;
    return [...orders];
  }
}
