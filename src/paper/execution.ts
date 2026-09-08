/**
 * Pluggable execution and fee models for the paper trading engine.
 *
 * The default instant-fill simulator stays exactly that (InstantFillModel +
 * NoFeeModel) so existing behavior is unchanged. Opting into richer models
 * makes the simulator useful for execution-quality research without touching
 * the strategy interface:
 *
 *   new PaperTradingEngine({
 *     executionModel: new SlippageExecutionModel({ marketSlippageBps: 5 }),
 *     feeModel: new TakerMakerFeeModel({ takerFeeBps: 4.5, makerFeeBps: 2 }),
 *   })
 */

export interface PaperOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  /** Limit price for LIMIT orders. */
  limitPrice?: number;
  leverage: number;
}

export interface MarketContext {
  /** Best available execution reference (mark price for futures). */
  marketPrice: number;
}

export interface PaperFill {
  /** Price the simulated fill executed at. */
  avgPrice: number;
  /** Quantity filled (models may fill partially). */
  quantity: number;
  /** Quote-unit fee booked for this fill. */
  fee: number;
  /** Whether the fill crossed the spread (taker) or rested (maker). */
  liquidity: 'taker' | 'maker';
  /** Human-readable model name for audit trails. */
  model: string;
}

export interface ExecutionModel {
  readonly name: string;
  /**
   * Compute the simulated fill for an order. Models must not mutate the
   * engine's account; they only describe what the fill looks like.
   */
  fill(request: PaperOrderRequest, market: MarketContext): Omit<PaperFill, 'fee'>;
}

export interface FeeModel {
  readonly name: string;
  /** Fee in quote units for a computed fill. */
  computeFee(fill: Omit<PaperFill, 'fee'>, request: PaperOrderRequest): number;
}

/**
 * The historical default: MARKET orders fill at the current mark, LIMIT orders
 * fill immediately at their limit price, whatever the market is doing.
 */
export class InstantFillModel implements ExecutionModel {
  readonly name = 'instant';

  fill(request: PaperOrderRequest, market: MarketContext): Omit<PaperFill, 'fee'> {
    const isMarketable =
      request.type === 'MARKET' ||
      (request.side === 'BUY' && (request.limitPrice ?? 0) >= market.marketPrice) ||
      (request.side === 'SELL' && (request.limitPrice ?? Number.POSITIVE_INFINITY) <= market.marketPrice);

    const avgPrice = request.type === 'MARKET' ? market.marketPrice : (request.limitPrice as number);

    return {
      avgPrice,
      quantity: request.quantity,
      liquidity: isMarketable ? 'taker' : 'maker',
      model: this.name,
    };
  }
}

export interface SlippageExecutionModelOptions {
  /** Adverse slippage applied to MARKET fills, in basis points of price. */
  marketSlippageBps: number;
  /**
   * Adverse slippage applied to marketable LIMIT fills, in basis points. The
   * price actually paid is still capped at the limit price — a marketable
   * limit never fills beyond its own limit.
   */
  limitSlippageBps?: number;
}

/**
 * Adds adverse execution noise: MARKET orders fill worse than the mark by
 * `marketSlippageBps`; marketable LIMITs fill at the slipped mark but never
 * beyond their limit. Non-marketable limits keep the instant-fill behavior
 * (they rest and fill at the limit as maker).
 */
export class SlippageExecutionModel implements ExecutionModel {
  readonly name = 'slippage';
  private readonly options: SlippageExecutionModelOptions;

  constructor(options: SlippageExecutionModelOptions) {
    if (!(options.marketSlippageBps >= 0)) throw new Error('marketSlippageBps must be >= 0');
    this.options = options;
  }

  fill(request: PaperOrderRequest, market: MarketContext): Omit<PaperFill, 'fee'> {
    if (request.type === 'MARKET') {
      const direction = request.side === 'BUY' ? 1 : -1;
      const slipped = market.marketPrice * (1 + (direction * this.options.marketSlippageBps) / 10_000);
      return { avgPrice: slipped, quantity: request.quantity, liquidity: 'taker', model: this.name };
    }

    const limit = request.limitPrice as number;
    const marketable =
      request.side === 'BUY' ? limit >= market.marketPrice : limit <= market.marketPrice;
    if (!marketable) {
      return { avgPrice: limit, quantity: request.quantity, liquidity: 'maker', model: this.name };
    }

    const bps = this.options.limitSlippageBps ?? this.options.marketSlippageBps;
    const direction = request.side === 'BUY' ? 1 : -1;
    const slipped = market.marketPrice * (1 + (direction * bps) / 10_000);
    // A marketable limit never executes beyond its own price.
    const capped = request.side === 'BUY' ? Math.min(slipped, limit) : Math.max(slipped, limit);
    return { avgPrice: capped, quantity: request.quantity, liquidity: 'taker', model: this.name };
  }
}

/** The historical default: no fees are booked. */
export class NoFeeModel implements FeeModel {
  readonly name = 'none';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  computeFee(fill: Omit<PaperFill, 'fee'>, request: PaperOrderRequest): number {
    return 0;
  }
}

export interface TakerMakerFeeModelOptions {
  /** Taker fee in basis points of notional (0.01% = 1 bp). */
  takerFeeBps: number;
  /** Maker fee in basis points of notional. */
  makerFeeBps: number;
}

/** Taker/maker fee schedule in basis points of fill notional. */
export class TakerMakerFeeModel implements FeeModel {
  readonly name = 'taker-maker';
  private readonly options: TakerMakerFeeModelOptions;

  constructor(options: TakerMakerFeeModelOptions) {
    this.options = options;
  }

  computeFee(fill: Omit<PaperFill, 'fee'>, request: PaperOrderRequest): number {
    const bps = fill.liquidity === 'taker' ? this.options.takerFeeBps : this.options.makerFeeBps;
    const notional = fill.avgPrice * fill.quantity;
    void request;
    return (notional * bps) / 10_000;
  }
}
