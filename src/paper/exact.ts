import {
  addFixed,
  compareFixed,
  formatFixed,
  multiplyFixed,
  normalizeFixed,
  parseFixed,
  pow10,
  subtractFixed,
  type FixedDecimal,
} from '../core/fixedpoint.js';

/**
 * Exact paper-trading arithmetic. The existing PaperTradingEngine keeps its float API.
 * These components are the exact replacement, for code that needs settled figures.
 *
 * Rounding policy: only division rounds, and it rounds half away from zero at an
 * explicit scale. Everything else is exact. The exchange's own rounding for
 * commissions and funding is not in the verified spec, so those results are exact
 * and not rounded.
 */

const ZERO: FixedDecimal = { units: 0n, scale: 0 };

/** a / b rounded half away from zero to `scale` decimal places. */
export function divideRounded(a: FixedDecimal, b: FixedDecimal, scale: number): FixedDecimal {
  if (b.units === 0n) throw new RangeError('division by zero');
  let numerator = a.units * pow10(scale + b.scale);
  let denominator = b.units * pow10(a.scale);
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator * sign;
  const quotient = (2n * magnitude + denominator) / (2n * denominator);
  return { units: sign * quotient, scale };
}

/** Commission in quote currency: price × quantity × bps / 10 000, exact (no rounding). */
export function commissionExact(params: { price: string | number; quantity: string | number; bps: string | number }): string {
  const notional = multiplyFixed(parseFixed(params.price), parseFixed(params.quantity));
  const bps = parseFixed(params.bps);
  if (bps.units < 0n) throw new RangeError('bps must be >= 0');
  const commission = normalizeFixed({ units: notional.units * bps.units, scale: notional.scale + bps.scale + 4 });
  return formatFixed(commission, commission.scale);
}

export interface AveragerFill {
  side: 'BUY' | 'SELL';
  price: string | number;
  quantity: string | number;
}

export interface AveragerPosition {
  /** Signed quantity: positive is long, negative is short, zero is flat. */
  quantity: string;
  /** Weighted average entry, or undefined when flat. */
  entryPrice: string | undefined;
  /** Realized PnL to date, in quote currency. */
  realizedPnl: string;
}

/**
 * Deterministic position averager. Adds to a position at a weighted average entry,
 * books realized PnL on reduce, and treats a flip as close-then-open. The average is
 * rounded half away from zero at `entryScale` decimals, so the same fills always
 * give the same figures in any order.
 */
export class DeterministicPositionAverager {
  private quantityFx: FixedDecimal = ZERO;
  private entryFx: FixedDecimal | undefined;
  private realizedFx: FixedDecimal = ZERO;
  private readonly entryScale: number;

  constructor(options: { entryScale?: number } = {}) {
    this.entryScale = options.entryScale ?? 8;
    if (!Number.isInteger(this.entryScale) || this.entryScale < 0 || this.entryScale > 20) {
      throw new RangeError('entryScale must be an integer in [0, 20]');
    }
  }

  apply(fill: AveragerFill): AveragerPosition {
    const price = parseFixed(fill.price);
    const quantity = parseFixed(fill.quantity);
    if (price.units <= 0n || quantity.units <= 0n) {
      throw new RangeError('fill price and quantity must be > 0');
    }
    const signed = fill.side === 'BUY' ? quantity : { units: -quantity.units, scale: quantity.scale };
    const current = this.quantityFx;
    const sameDirection = current.units === 0n || (current.units > 0n) === (signed.units > 0n);

    if (sameDirection) {
      this.open(price, signed);
    } else {
      // Reduce by the smaller of the two sizes, then open any remainder on the other side.
      const closing = absMin(current, signed);
      this.close(price, closing);
      const leftover = addFixed(signed, { units: -closing.units * sign(signed), scale: closing.scale });
      if (leftover.units !== 0n) this.open(price, leftover);
    }
    return this.snapshot();
  }

  snapshot(): AveragerPosition {
    return {
      quantity: formatNormalized(this.quantityFx),
      entryPrice: this.entryFx ? formatNormalized(this.entryFx) : undefined,
      realizedPnl: formatNormalized(this.realizedFx),
    };
  }

  private open(price: FixedDecimal, signed: FixedDecimal): void {
    const prevAbs = absFixed(this.quantityFx);
    const addAbs = absFixed(signed);
    const total = addFixed(prevAbs, addAbs);
    const weighted = addFixed(
      multiplyFixed(this.entryFx ?? ZERO, prevAbs),
      multiplyFixed(price, addAbs),
    );
    this.entryFx = divideRounded(weighted, total, this.entryScale);
    this.quantityFx = addFixed(this.quantityFx, signed);
  }

  private close(price: FixedDecimal, closing: FixedDecimal): void {
    const entry = this.entryFx ?? price;
    const direction = this.quantityFx.units > 0n ? 1n : -1n;
    const priceMove = subtractFixed(price, entry);
    const pnl = multiplyFixed(multiplyFixed(priceMove, closing), { units: direction, scale: 0 });
    this.realizedFx = addFixed(this.realizedFx, pnl);
    this.quantityFx = addFixed(this.quantityFx, { units: -closing.units * direction, scale: closing.scale });
    if (this.quantityFx.units === 0n) this.entryFx = undefined;
  }
}

function sign(value: FixedDecimal): bigint {
  return value.units < 0n ? -1n : 1n;
}

function absFixed(value: FixedDecimal): FixedDecimal {
  return { units: value.units < 0n ? -value.units : value.units, scale: value.scale };
}

function absMin(a: FixedDecimal, b: FixedDecimal): FixedDecimal {
  const absA = absFixed(a);
  const absB = absFixed(b);
  return compareFixed(absA, absB) <= 0 ? absA : absB;
}

function formatNormalized(value: FixedDecimal): string {
  const normalized = normalizeFixed(value);
  return formatFixed(normalized, normalized.scale);
}

/**
 * Funding payment to the account for one settlement. Convention: longs pay when the
 * rate is positive. Payment = −(signedQuantity × markPrice × fundingRate), exact.
 * Verify the sign convention against FUNDING_FEE income on your own account.
 */
export function fundingPaymentExact(params: {
  signedQuantity: string | number;
  markPrice: string | number;
  fundingRate: string | number;
}): string {
  const product = multiplyFixed(
    multiplyFixed(parseFixed(params.signedQuantity), parseFixed(params.markPrice)),
    parseFixed(params.fundingRate),
  );
  const payment = normalizeFixed({ units: -product.units, scale: product.scale });
  return formatFixed(payment, payment.scale);
}

/** Total funding over a series of settlements, held at a fixed signed quantity. */
export function settleFunding(params: {
  signedQuantity: string | number;
  settlements: ReadonlyArray<{ markPrice: string | number; fundingRate: string | number }>;
}): string {
  let total: FixedDecimal = ZERO;
  for (const s of params.settlements) {
    const payment = parseFixed(
      fundingPaymentExact({ signedQuantity: params.signedQuantity, markPrice: s.markPrice, fundingRate: s.fundingRate }),
    );
    total = addFixed(total, payment);
  }
  return formatNormalized(total);
}

/**
 * Iceberg slice matching for the paper broker. Only `visible` is exposed. A slice is
 * refreshed from the hidden remainder when it is consumed. The refresh is modelled as
 * taking the next min(icebergQuantity, remaining). Whether the exchange also drops
 * queue priority on refresh is not in the verified spec, so this model does not
 * claim it.
 */
export class IcebergSliceMatcher {
  private visibleFx: FixedDecimal;
  private remainingFx: FixedDecimal;
  private readonly icebergFx: FixedDecimal;
  refreshes = 0;

  constructor(params: { totalQuantity: string | number; icebergQuantity: string | number }) {
    const total = parseFixed(params.totalQuantity);
    const iceberg = parseFixed(params.icebergQuantity);
    if (iceberg.units <= 0n) throw new RangeError('icebergQuantity must be > 0');
    if (compareFixed(iceberg, total) > 0) throw new RangeError('icebergQuantity must not exceed totalQuantity');
    this.icebergFx = iceberg;
    this.remainingFx = total;
    this.visibleFx = compareFixed(iceberg, total) < 0 ? iceberg : total;
  }

  get visible(): string {
    return formatNormalized(this.visibleFx);
  }

  get remaining(): string {
    return formatNormalized(this.remainingFx);
  }

  get isComplete(): boolean {
    return this.remainingFx.units === 0n;
  }

  /** Match an incoming quantity against the visible slices. Returns how much was filled. */
  fill(quantity: string | number): string {
    let incoming = parseFixed(quantity);
    if (incoming.units <= 0n) throw new RangeError('fill quantity must be > 0');
    let filled: FixedDecimal = ZERO;
    while (incoming.units > 0n && this.remainingFx.units > 0n) {
      const take = compareFixed(incoming, this.visibleFx) < 0 ? incoming : this.visibleFx;
      this.visibleFx = subtractFixed(this.visibleFx, take);
      this.remainingFx = subtractFixed(this.remainingFx, take);
      incoming = subtractFixed(incoming, take);
      filled = addFixed(filled, take);
      if (this.visibleFx.units === 0n && this.remainingFx.units > 0n) {
        this.visibleFx = compareFixed(this.icebergFx, this.remainingFx) < 0 ? this.icebergFx : this.remainingFx;
        this.refreshes += 1;
      }
    }
    return formatNormalized(filled);
  }
}

