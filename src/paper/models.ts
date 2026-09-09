/**
 * Pluggable paper-execution semantics.
 *
 * The legacy PaperTradingEngine filled every order instantly at the live mark
 * with zero fees — optimistic to the point of misleading: any strategy
 * validated against it overstates fills, ignores slippage on size, and never
 * sees taker fees. These models let the engine approximate reality in layers:
 *
 *   InstantFillModel  — legacy behaviour (default)
 *   SlippageModel     — fills walk through liquidity at a fixed bps penalty
 *   PartialFillModel  — random/varying fill ratios with remainder resting
 *   OrderBookModel    — VWAP fills against real local-book liquidity
 *   LatencyModel      — delays fills by a fixed/jittered window
 *   CompositeModel    — chains any of the above
 *
 * Fee accounting is separate (FeeModel) so it composes with any execution model.
 */

export interface ExecutionContext {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  /** Requested quantity (base units). */
  quantity: number;
  /** Limit price for LIMIT orders. */
  limitPrice?: number;
  /** Current mark/last price observed at submission. */
  marketPrice: number;
}

export interface ExecutionQuote {
  /** Effective per-unit fill price. */
  fillPrice: number;
  /** Quantity actually filled in this event (≤ requested). */
  filledQuantity: number;
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'REJECTED';
  reason?: string;
}

export interface ExecutionModel {
  quote(ctx: ExecutionContext): ExecutionQuote | Promise<ExecutionQuote>;
}

/** Legacy semantics: everything fills, instantly, at the mark (or limit). */
export class InstantFillModel implements ExecutionModel {
  quote(ctx: ExecutionContext): ExecutionQuote {
    const fillPrice = ctx.type === 'MARKET' ? ctx.marketPrice : (ctx.limitPrice as number);
    return { fillPrice, filledQuantity: ctx.quantity, status: 'FILLED' };
  }
}

/**
 * Market-impact approximation: fills execute `bps` worse than the reference
 * price (BUY pays up, SELL hits down). 10 bps = 0.1%.
 */
export class SlippageModel implements ExecutionModel {
  constructor(private readonly bps: number, private readonly inner: ExecutionModel = new InstantFillModel()) {}

  async quote(ctx: ExecutionContext): Promise<ExecutionQuote> {
    const base = await this.inner.quote(ctx);
    const slipFactor = 1 + (ctx.side === 'BUY' ? 1 : -1) * (this.bps / 10_000);
    return { ...base, fillPrice: base.fillPrice * slipFactor };
  }
}

/**
 * Partial fills: each order fills `ratio(ctx)` of its quantity; the unfilled
 * remainder is reported as PARTIALLY_FILLED (callers decide to re-submit).
 * `ratio` defaults to uniform random in [0.6, 1.0].
 */
export class PartialFillModel implements ExecutionModel {
  constructor(
    private readonly ratio: (ctx: ExecutionContext) => number = () => 0.6 + Math.random() * 0.4,
    private readonly inner: ExecutionModel = new InstantFillModel(),
  ) {}

  async quote(ctx: ExecutionContext): Promise<ExecutionQuote> {
    const base = await this.inner.quote(ctx);
    const ratio = Math.min(1, Math.max(0, this.ratio(ctx)));
    const filledQuantity = base.filledQuantity * ratio;
    return {
      ...base,
      filledQuantity,
      status: filledQuantity >= ctx.quantity ? 'FILLED' : 'PARTIALLY_FILLED',
      reason: filledQuantity < ctx.quantity ? 'liquidity exhausted at fill price' : undefined,
    };
  }
}

/** Book snapshot the OrderBookModel consumes (e.g. from state/OrderBook). */
export interface BookView {
  bids: Array<{ price: string | number; quantity: string | number }>;
  asks: Array<{ price: string | number; quantity: string | number }>;
}

/**
 * Fills walk real book liquidity: a BUY consumes ask levels (cheapest first)
 * until the quantity is satisfied; the fill price is the size-weighted VWAP
 * of consumed levels. Books are injected so the model works offline (replay,
 * tests) or against the live local OrderBook.
 */
export class OrderBookModel implements ExecutionModel {
  constructor(private readonly getBook: (symbol: string) => BookView | null) {}

  quote(ctx: ExecutionContext): ExecutionQuote {
    const book = this.getBook(ctx.symbol);
    if (!book || !book.asks.length || !book.bids.length) {
      return {
        fillPrice: ctx.type === 'MARKET' ? ctx.marketPrice : (ctx.limitPrice as number),
        filledQuantity: ctx.quantity,
        status: 'FILLED',
        reason: 'no book available; fell back to mark fill',
      };
    }

    const levels =
      ctx.side === 'BUY'
        ? book.asks.map((l) => ({ price: Number(l.price), quantity: Number(l.quantity) })).sort((a, b) => a.price - b.price)
        : book.bids.map((l) => ({ price: Number(l.price), quantity: Number(l.quantity) })).sort((a, b) => b.price - a.price);

    let remaining = ctx.quantity;
    let notional = 0;
    let filled = 0;
    for (const level of levels) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, level.quantity);
      notional += take * level.price;
      filled += take;
      remaining -= take;
    }

    if (filled === 0) {
      return { fillPrice: ctx.marketPrice, filledQuantity: 0, status: 'REJECTED', reason: 'empty book side' };
    }

    const vwapPrice = notional / filled;
    // LIMIT orders never fill through their limit price.
    if (ctx.type === 'LIMIT' && ctx.limitPrice !== undefined) {
      const crosses =
        ctx.side === 'BUY' ? vwapPrice <= ctx.limitPrice : vwapPrice >= ctx.limitPrice;
      if (!crosses) {
        return {
          fillPrice: ctx.limitPrice,
          filledQuantity: 0,
          status: 'REJECTED',
          reason: 'book does not cross limit price',
        };
      }
    }

    return {
      fillPrice: vwapPrice,
      filledQuantity: filled,
      status: filled >= ctx.quantity ? 'FILLED' : 'PARTIALLY_FILLED',
      reason: filled < ctx.quantity ? 'book liquidity exhausted' : undefined,
    };
  }
}

/** Delays quotes by `delayMs(ctx)` — models round-trip/latency risk. */
export class LatencyModel implements ExecutionModel {
  constructor(
    private readonly delayMs: (ctx: ExecutionContext) => number = () => 250,
    private readonly inner: ExecutionModel = new InstantFillModel(),
  ) {}

  async quote(ctx: ExecutionContext): Promise<ExecutionQuote> {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, this.delayMs(ctx))));
    return this.inner.quote(ctx);
  }
}

/**
 * Compose models as a sequential pipeline (e.g. Slippage → PartialFill): each
 * stage sees the previous stage's fill price as its reference price, so a
 * partial fill quotes against the slipped price, not the raw mark. The
 * filled quantity can only shrink as it flows downstream.
 */
export class CompositeModel implements ExecutionModel {
  constructor(private readonly models: ExecutionModel[]) {}

  async quote(ctx: ExecutionContext): Promise<ExecutionQuote> {
    let current: ExecutionQuote = {
      fillPrice: ctx.type === 'MARKET' ? ctx.marketPrice : (ctx.limitPrice as number),
      filledQuantity: ctx.quantity,
      status: 'FILLED',
    };
    for (const model of this.models) {
      const stageCtx: ExecutionContext = {
        ...ctx,
        marketPrice: current.fillPrice,
        limitPrice: ctx.limitPrice ?? current.fillPrice,
      };
      const stage = await model.quote(stageCtx);
      current = {
        ...stage,
        filledQuantity: Math.min(stage.filledQuantity, ctx.quantity),
      };
    }
    return current;
  }
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export interface FeeQuote {
  /** Commission in quote currency (USDⓈ-M convention). */
  commission: number;
  /** Applies at the taker or maker rate. */
  tier: 'taker' | 'maker';
}

export interface FeeModel {
  compute(quote: ExecutionQuote, ctx: ExecutionContext): FeeQuote;
}

/**
 * Flat bps fee schedule. MARKET orders are takers; LIMIT fills are treated as
 * makers. Binance's regular USDⓈ-M taker/maker default is 5 bps / 2 bps
 * (0.05% / 0.02%) — pass your own schedule to match your VIP tier or BNB
 * discount.
 */
export class TakerMakerFeeModel implements FeeModel {
  constructor(
    private readonly takerBps: number,
    private readonly makerBps: number,
  ) {}

  compute(quote: ExecutionQuote, ctx: ExecutionContext): FeeQuote {
    const tier: 'taker' | 'maker' = ctx.type === 'MARKET' ? 'taker' : 'maker';
    const bps = tier === 'taker' ? this.takerBps : this.makerBps;
    return { commission: quote.fillPrice * quote.filledQuantity * (bps / 10_000), tier };
  }
}

/** Binance regular-tier defaults: 5 bps taker / 2 bps maker. */
export class BinanceUsdmFeeModel extends TakerMakerFeeModel {
  constructor(takerBps = 5, makerBps = 2) {
    super(takerBps, makerBps);
  }
}
