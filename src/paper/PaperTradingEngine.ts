import { FuturesMarket } from '../resources/FuturesMarket.js';
import {
  InstantFillModel,
  type ExecutionContext,
  type ExecutionModel,
  type ExecutionQuote,
  type FeeModel,
} from './models.js';

export type PaperPositionSide = 'LONG' | 'SHORT' | 'NONE';

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
  status: 'FILLED' | 'PARTIALLY_FILLED';
  filledQuantity: number;
  avgFillPrice: number;
  /** Realized PnL booked by this order, if it reduced or closed a position. */
  realizedPnl: number;
  /** Commission charged by the configured FeeModel (quote currency). */
  commission?: number;
  createdAt: number;
}

export interface PaperAccount {
  /** Wallet balance: starts at initialBalance and moves only with realized PnL. */
  balance: number;
  /** Wallet balance minus margin currently locked in open positions. */
  availableBalance: number;
  /** balance + unrealized PnL. */
  totalWalletBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  positions: Record<string, PaperPosition>;
  orders: PaperOrder[];
}

export interface PaperTradingOptions {
  initialBalance?: number;
  /** Injectable so tests and offline callers can supply their own price source. */
  market?: FuturesMarket;
  /**
   * Fill semantics (slippage, partial fills, book walking, latency).
   * Defaults to the legacy instant-fill behaviour.
   */
  executionModel?: ExecutionModel;
  /** Fee schedule; defaults to zero fees (legacy behaviour). */
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
 * Accounting model: `balance` moves only on realized PnL. Opening a position locks
 * `notional / leverage` of margin out of `availableBalance`; reducing it releases
 * that margin pro-rata and books the realized PnL. Fill semantics default to
 * instant fills at the current mark (MARKET) or limit price (LIMIT); configure
 * `executionModel`/`feeModel` for slippage, partial fills, book walking, latency
 * and commission — see `paper/models.ts`.
 */
export class PaperTradingEngine {
  private readonly account: PaperAccount;
  private readonly market: FuturesMarket;
  private readonly executionModel: ExecutionModel;
  private readonly feeModel?: FeeModel;
  private orderIdCounter = 1_000_000;

  constructor(options: PaperTradingOptions = {}) {
    this.market = options.market ?? new FuturesMarket();
    this.executionModel = options.executionModel ?? new InstantFillModel();
    this.feeModel = options.feeModel;
    const initialBalance = options.initialBalance ?? 10_000;
    this.account = {
      balance: initialBalance,
      availableBalance: initialBalance,
      totalWalletBalance: initialBalance,
      realizedPnl: 0,
      unrealizedPnl: 0,
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
    const context: ExecutionContext = {
      symbol,
      side,
      type,
      quantity,
      limitPrice: type === 'LIMIT' ? params.price : undefined,
      marketPrice,
    };
    const quote: ExecutionQuote = await this.executionModel.quote(context);
    if (quote.status === 'REJECTED') {
      throw new Error(`Order rejected by execution model: ${quote.reason ?? 'no fill'}`);
    }
    const filledQuantity = quote.filledQuantity;
    if (!(filledQuantity > 0)) throw new Error('Execution model produced zero fill quantity');
    const fillPrice = quote.fillPrice;

    const position = this.positionFor(symbol);
    const opposing =
      (side === 'SELL' && position.side === 'LONG') || (side === 'BUY' && position.side === 'SHORT');

    // Only the quantity that opens or extends exposure consumes new margin.
    const openingQty = opposing ? Math.max(0, filledQuantity - position.quantity) : filledQuantity;
    const requiredMargin = (openingQty * fillPrice) / leverage;
    if (requiredMargin > this.account.availableBalance + 1e-9) {
      throw new Error(
        `Insufficient balance. Required: ${requiredMargin.toFixed(2)}, ` +
          `Available: ${this.account.availableBalance.toFixed(2)}`,
      );
    }

    let realizedPnl = this.applyFill(position, side, filledQuantity, fillPrice, leverage);
    let commission = 0;
    if (this.feeModel) {
      commission = this.feeModel.compute(quote, context).commission;
      this.account.balance -= commission;
      this.account.realizedPnl -= commission;
      realizedPnl -= commission;
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
      status: quote.status === 'FILLED' ? 'FILLED' : 'PARTIALLY_FILLED',
      filledQuantity,
      avgFillPrice: fillPrice,
      realizedPnl,
      commission: commission > 0 ? commission : undefined,
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
