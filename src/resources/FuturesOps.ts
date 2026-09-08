import type { FuturesAccount } from './FuturesAccount.js';
import type { FuturesData } from './FuturesData.js';
import type { FuturesMarket } from './FuturesMarket.js';
import type { FuturesTrading } from './FuturesTrading.js';
import type { PositionRisk } from '../types/account.types.js';
import {
  floorToStep,
  formatToDecimals,
  roundToStep,
  symbolRulesFrom,
  type SymbolRules,
} from '../types/filters.types.js';
import {
  absExact,
  divExact,
  floorToStepExact,
  formatExact,
  mulExact,
  parseExact,
  roundToStepExact,
  subExact,
  toNumber,
} from '../util/decimal.js';

export interface SizePositionParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  stopPrice: number;
  entryPrice?: number;
  riskAmount?: number;
  riskPct?: number;
  leverage?: number;
  marketOrder?: boolean;
}

export interface PositionSizing {
  ok: boolean;
  reasons: string[];
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  stopPrice: number;
  riskPerUnit: number;
  riskAmount: number;
  rawQuantity: number;
  quantity: number;
  /** Pass this to createOrder — a string avoids float round-tripping. */
  quantityStr: string;
  notional: number;
  minNotional: number;
  leverage: number;
  requiredMargin: number;
  availableBalance?: number;
  rules: SymbolRules;
}

export interface ClosePositionParams {
  symbol: string;
  positionSide?: 'BOTH' | 'LONG' | 'SHORT';
  /** Fraction of the position to close, 0 < portion <= 1. Defaults to the whole position. */
  portion?: number;
  dryRun?: boolean;
}

export interface BracketOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number | string;
  entryPrice?: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  positionSide?: 'BOTH' | 'LONG' | 'SHORT';
  workingType?: 'MARK_PRICE' | 'CONTRACT_PRICE';
}

const RULES_TTL_MS = 60_000;

/**
 * Composite operations layered over the single-endpoint resources.
 *
 * Everything here fans out over `FuturesMarket` / `FuturesData` / `FuturesAccount` /
 * `FuturesTrading` directly. It deliberately does not call the LLM tool handlers,
 * which return formatted JSON strings — composing at this layer keeps typed values
 * typed and avoids a parse/stringify round-trip per step.
 */
export class FuturesOps {
  private rulesCache = new Map<string, { rules: SymbolRules; at: number }>();

  constructor(
    private readonly market: FuturesMarket,
    private readonly data: FuturesData,
    private readonly account: FuturesAccount,
    private readonly trading: FuturesTrading,
  ) {}

  /** Typed tick/step/notional rules for a symbol, cached briefly (exchangeInfo is a large payload). */
  async symbolRules(symbol: string, options?: { refresh?: boolean }): Promise<SymbolRules> {
    const key = symbol.toUpperCase();
    const cached = this.rulesCache.get(key);
    if (!options?.refresh && cached && Date.now() - cached.at < RULES_TTL_MS) return cached.rules;

    const details = await this.market.instrumentDetails(key);
    const rules = symbolRulesFrom(details);
    this.rulesCache.set(key, { rules, at: Date.now() });
    return rules;
  }

  /**
   * Round a price to the symbol's tick and a quantity to its step, ready to send.
   *
   * Quantization is computed with exact decimal arithmetic (BigInt-scaled),
   * never through IEEE-754 floats: the string returned is exactly the value
   * Binance will accept, with no accumulated representation error.
   */
  async quantize(
    symbol: string,
    values: { price?: number; quantity?: number; marketOrder?: boolean },
  ): Promise<{ price?: string; quantity?: string; rules: SymbolRules }> {
    const rules = await this.symbolRules(symbol);
    const step = values.marketOrder ? rules.marketStepSize : rules.stepSize;
    const stepDp = values.marketOrder ? rules.marketStepDecimals : rules.stepDecimals;
    return {
      price:
        values.price === undefined
          ? undefined
          : formatExact(roundToStepExact(values.price, rules.tickSize), rules.tickDecimals),
      quantity:
        values.quantity === undefined
          ? undefined
          : formatExact(floorToStepExact(values.quantity, step), stepDp),
      rules,
    };
  }

  /**
   * Risk-based position sizing. Converts "risk N quote units between entry and stop"
   * into a quantity that satisfies the symbol's step size, lot bounds and min notional,
   * and reports every constraint it could not satisfy instead of silently adjusting risk.
   *
   * The risk arithmetic (risk-per-unit, raw quantity, notional, required
   * margin) is computed with exact decimal arithmetic and converted to number
   * only for the report fields; `quantityStr` is the exact quantized string
   * to hand straight to createOrder.
   */
  async sizePosition(params: SizePositionParams): Promise<PositionSizing> {
    const symbol = params.symbol.toUpperCase();
    const reasons: string[] = [];

    if ((params.riskAmount === undefined) === (params.riskPct === undefined)) {
      throw new Error('Provide exactly one of riskAmount or riskPct');
    }

    const rules = await this.symbolRules(symbol);
    const entryPrice = params.entryPrice ?? (await this.data.premiumIndex(symbol)).markPrice;

    let availableBalance: number | undefined;
    let riskAmount = params.riskAmount ?? 0;
    if (params.riskPct !== undefined) {
      const balances = await this.account.balanceV3();
      availableBalance = balances.find((b) => b.asset === rules.quoteAsset)?.availableBalance ?? 0;
      riskAmount = availableBalance * (params.riskPct / 100);
    }

    // Exact risk-per-unit: |entry - stop| with no float cancellation noise.
    const riskPerUnitExact = subExact(parseExact(entryPrice), parseExact(params.stopPrice));
    const riskPerUnit = Math.abs(toNumber(riskPerUnitExact));
    const stopOnCorrectSide =
      params.side === 'BUY' ? params.stopPrice < entryPrice : params.stopPrice > entryPrice;
    if (!stopOnCorrectSide) {
      reasons.push(
        `stopPrice ${params.stopPrice} is on the wrong side of entry ${entryPrice} for a ${params.side}`,
      );
    }
    if (riskPerUnit <= 0) reasons.push('stopPrice equals entryPrice, risk per unit is zero');

    const step = params.marketOrder ? rules.marketStepSize : rules.stepSize;
    const stepDp = params.marketOrder ? rules.marketStepDecimals : rules.stepDecimals;
    const minQty = params.marketOrder ? rules.marketMinQty : rules.minQty;
    const maxQty = params.marketOrder ? rules.marketMaxQty : rules.maxQty;

    // Exact: risk / riskPerUnit, then quantize down onto the step.
    const rawQuantityExact =
      riskPerUnit > 0
        ? divExact(parseExact(riskAmount), absExact(riskPerUnitExact))
        : parseExact(0);
    const rawQuantity = toNumber(rawQuantityExact);
    let quantityExact = parseExact(floorToStepExact(rawQuantityExact, step));
    let quantity = toNumber(quantityExact);

    if (quantity > maxQty) {
      reasons.push(`quantity ${quantity} exceeds maxQty ${maxQty}, clamped`);
      quantityExact = parseExact(floorToStepExact(maxQty, step));
      quantity = toNumber(quantityExact);
    }
    if (quantity < minQty) {
      reasons.push(`quantity ${quantity} is below minQty ${minQty} for this symbol`);
    }

    const notionalExact = mulExact(quantityExact, parseExact(entryPrice));
    const notional = toNumber(notionalExact);
    if (rules.minNotional > 0 && notional < rules.minNotional) {
      reasons.push(
        `notional ${notional.toFixed(2)} is below the ${rules.minNotional} minimum; ` +
          `raising risk or widening the stop is required (this tool will not increase risk for you)`,
      );
    }
    if (rules.status !== 'TRADING') reasons.push(`symbol status is ${rules.status}, not TRADING`);

    const leverage = params.leverage ?? 1;
    const requiredMargin = toNumber(divExact(notionalExact, parseExact(leverage)));
    if (availableBalance !== undefined && requiredMargin > availableBalance) {
      reasons.push(
        `required margin ${requiredMargin.toFixed(2)} exceeds available balance ${availableBalance.toFixed(2)}`,
      );
    }

    return {
      ok: reasons.length === 0 && quantity > 0,
      reasons,
      symbol,
      side: params.side,
      entryPrice,
      stopPrice: params.stopPrice,
      riskPerUnit,
      riskAmount,
      rawQuantity,
      quantity,
      quantityStr: formatExact(quantityExact, stepDp),
      notional,
      minNotional: rules.minNotional,
      leverage,
      requiredMargin,
      availableBalance,
      rules,
    };
  }

  /**
   * Flatten an open position with a reduce-only market order.
   *
   * Picks the closing side from the sign of `positionAmt` and, critically, chooses
   * between `reduceOnly` and `positionSide`: Binance rejects `reduceOnly` in hedge
   * mode, and rejects a LONG/SHORT `positionSide` in one-way mode.
   */
  async closePosition(params: ClosePositionParams): Promise<{
    closed: boolean;
    reason?: string;
    position?: PositionRisk;
    order?: unknown;
    request?: Record<string, unknown>;
  }> {
    const symbol = params.symbol.toUpperCase();
    const portion = params.portion ?? 1;
    if (!(portion > 0 && portion <= 1)) throw new Error('portion must be within (0, 1]');

    const positions = await this.account.positionRiskV3(symbol);
    const open = positions.filter(
      (p) =>
        p.positionAmt !== 0 &&
        (params.positionSide === undefined || p.positionSide === params.positionSide),
    );

    if (open.length === 0) return { closed: false, reason: `no open position on ${symbol}` };
    if (open.length > 1) {
      return {
        closed: false,
        reason: `${open.length} positions open on ${symbol} (hedge mode); pass positionSide to pick one`,
      };
    }

    const position = open[0] as PositionRisk;
    const rules = await this.symbolRules(symbol);
    const quantity = floorToStep(
      Math.abs(position.positionAmt) * portion,
      rules.marketStepSize,
      rules.marketStepDecimals,
    );
    if (quantity <= 0) {
      return { closed: false, reason: 'closing quantity rounds to zero at this symbol step size', position };
    }

    const hedgeMode = position.positionSide !== 'BOTH';
    const request: Record<string, unknown> = {
      symbol,
      side: position.positionAmt > 0 ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: formatToDecimals(quantity, rules.marketStepDecimals),
      ...(hedgeMode ? { positionSide: position.positionSide } : { reduceOnly: true }),
    };

    if (params.dryRun) return { closed: false, reason: 'dryRun', position, request };

    const order = await this.trading.createOrder(request as never);
    return { closed: true, position, order, request };
  }

  /**
   * One-call market picture: 24h stats, mark/index and funding, open interest and
   * positioning. Uses allSettled so a single unavailable feed degrades one field
   * instead of failing the whole snapshot.
   */
  async marketSnapshot(
    symbol: string,
    options?: { period?: string },
  ): Promise<Record<string, unknown>> {
    const s = symbol.toUpperCase();
    const period = options?.period ?? '1h';
    const [ticker, premium, openInterest, longShort] = await Promise.allSettled([
      this.market.ticker24hr(s),
      this.data.premiumIndex(s),
      this.data.openInterest(s),
      this.data.globalLongShortAccountRatio(s, period, 1),
    ]);

    const settled = <T>(r: PromiseSettledResult<T>): unknown =>
      r.status === 'fulfilled' ? r.value : { error: String((r as PromiseRejectedResult).reason) };

    return {
      symbol: s,
      asOf: Date.now(),
      ticker24hr: settled(ticker),
      markPrice: settled(premium),
      openInterest: settled(openInterest),
      longShortAccountRatio: settled(longShort),
    };
  }

  /** Balances, open positions and working orders in one call, with the noise filtered out. */
  async accountOverview(): Promise<Record<string, unknown>> {
    const [balances, positions, openOrders] = await Promise.allSettled([
      this.account.balanceV3(),
      this.account.positionRiskV3(),
      this.trading.getOpenOrders(),
    ]);

    const fundedBalances =
      balances.status === 'fulfilled' ? balances.value.filter((b) => b.balance !== 0) : [];
    const openPositions =
      positions.status === 'fulfilled' ? positions.value.filter((p) => p.positionAmt !== 0) : [];

    return {
      asOf: Date.now(),
      balances: balances.status === 'fulfilled' ? fundedBalances : { error: String(balances.reason) },
      positions: positions.status === 'fulfilled' ? openPositions : { error: String(positions.reason) },
      openOrders: openOrders.status === 'fulfilled' ? openOrders.value : { error: String(openOrders.reason) },
      totals:
        positions.status === 'fulfilled'
          ? {
              openPositionCount: openPositions.length,
              unrealizedPnl: openPositions.reduce((sum, p) => sum + p.unRealizedProfit, 0),
              grossNotional: openPositions.reduce((sum, p) => sum + Math.abs(p.notional), 0),
            }
          : undefined,
    };
  }

  /**
   * Entry order plus its protective stop-loss and optional take-profit, with every
   * price quantized to the symbol tick.
   *
   * The protective legs are placed after the entry is accepted. If a protective leg
   * fails, the failure is reported per-leg rather than unwound: the entry may already
   * have filled, so cancelling it is not a safe automatic recovery.
   */
  async placeBracketOrder(params: BracketOrderParams): Promise<Record<string, unknown>> {
    const symbol = params.symbol.toUpperCase();
    const rules = await this.symbolRules(symbol);
    const tick = (p: number): string =>
      formatToDecimals(roundToStep(p, rules.tickSize, rules.tickDecimals), rules.tickDecimals);

    const quantity = formatToDecimals(
      floorToStep(Number(params.quantity), rules.stepSize, rules.stepDecimals),
      rules.stepDecimals,
    );
    if (Number(quantity) <= 0) throw new Error('quantity rounds to zero at this symbol step size');

    const exitSide = params.side === 'BUY' ? 'SELL' : 'BUY';
    const hedgeMode = params.positionSide !== undefined && params.positionSide !== 'BOTH';
    const sideFields = hedgeMode ? { positionSide: params.positionSide } : { reduceOnly: true };
    const workingType = params.workingType ?? 'MARK_PRICE';

    const entry = await this.trading.createOrder({
      symbol,
      side: params.side,
      type: params.entryPrice === undefined ? 'MARKET' : 'LIMIT',
      quantity,
      ...(params.entryPrice === undefined
        ? {}
        : { price: tick(params.entryPrice), timeInForce: 'GTC' as const }),
      ...(hedgeMode ? { positionSide: params.positionSide } : {}),
    });

    const protective = await Promise.allSettled([
      this.trading.createOrder({
        symbol,
        side: exitSide,
        type: 'STOP_MARKET',
        quantity,
        stopPrice: tick(params.stopLossPrice),
        workingType,
        ...sideFields,
      } as never),
      ...(params.takeProfitPrice === undefined
        ? []
        : [
            this.trading.createOrder({
              symbol,
              side: exitSide,
              type: 'TAKE_PROFIT_MARKET',
              quantity,
              stopPrice: tick(params.takeProfitPrice),
              workingType,
              ...sideFields,
            } as never),
          ]),
    ]);

    const [stopLoss, takeProfit] = protective;
    const leg = (r?: PromiseSettledResult<unknown>): unknown =>
      r === undefined
        ? undefined
        : r.status === 'fulfilled'
          ? r.value
          : { error: String((r as PromiseRejectedResult).reason) };

    const failures = protective.filter((r) => r.status === 'rejected').length;
    return {
      symbol,
      quantity,
      entry,
      stopLoss: leg(stopLoss),
      takeProfit: leg(takeProfit),
      protectionComplete: failures === 0,
      ...(failures > 0
        ? {
            warning:
              'Entry was submitted but at least one protective order failed. The position may be ' +
              'unprotected — review and place the missing leg manually.',
          }
        : {}),
    };
  }
}
