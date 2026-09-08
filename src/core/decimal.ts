/**
 * Decimal-safe financial arithmetic.
 *
 * Binance transmits every price, quantity and fee as a decimal *string* precisely
 * because binary floating point cannot represent values like `0.1` exactly. The
 * legacy SDK code converted these to `number` and did money math in IEEE-754
 * doubles, which accumulates rounding error across the exact places it matters
 * most: average fill prices, notional checks, fees and PnL.
 *
 * This module provides a small, dependency-free fixed-point decimal backed by
 * `BigInt` with a 18-digit internal scale — far finer than any Binance tick —
 * so add/sub/mul are exact for all realistic operands. Division rounds
 * half-even to the configured scale.
 */

const SCALE = 18n;
const SCALE_FACTOR = 10n ** SCALE;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export type DecimalInput = Decimal | string | number | bigint;

export class Decimal {
  /** Scaled BigInt value (value * 10^18). */
  private readonly scaled: bigint;

  private constructor(scaled: bigint) {
    this.scaled = scaled;
  }

  static readonly ZERO = new Decimal(0n);
  static readonly ONE = new Decimal(SCALE_FACTOR);

  static from(value: DecimalInput): Decimal {
    if (value instanceof Decimal) return value;
    if (typeof value === 'bigint') {
      return new Decimal(value * SCALE_FACTOR);
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Decimal.from: non-finite number: ${value}`);
      if (Number.isInteger(value)) {
        return new Decimal(BigInt(value) * SCALE_FACTOR);
      }
      return Decimal.parse(value.toExponential(20));
    }
    return Decimal.parse(value);
  }

  private static parse(text: string): Decimal {
    const trimmed = text.trim();
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) {
      throw new Error(`Decimal.from: invalid decimal string: ${text}`);
    }
    let negative = false;
    let body = trimmed;
    if (body.startsWith('+')) body = body.slice(1);
    else if (body.startsWith('-')) {
      negative = true;
      body = body.slice(1);
    }

    let exponent = 0;
    const expIndex = body.search(/[eE]/);
    if (expIndex >= 0) {
      exponent = Number.parseInt(body.slice(expIndex + 1), 10);
      body = body.slice(0, expIndex);
    }

    const dotIndex = body.indexOf('.');
    const intPart = dotIndex >= 0 ? body.slice(0, dotIndex) : body;
    const fracPart = dotIndex >= 0 ? body.slice(dotIndex + 1) : '';

    let digits = (intPart || '0') + fracPart;
    let pointIndex = intPart.length;
    // Apply exponent by moving the decimal point.
    pointIndex += exponent;

    // Normalize so the fraction has exactly SCALE digits.
    while (digits.length < pointIndex + Number(SCALE)) digits += '0';
    if (pointIndex < 0) {
      digits = '0'.repeat(-pointIndex) + digits;
      pointIndex = 0;
    }
    const keep = pointIndex + Number(SCALE);
    if (digits.length > keep) {
      // Truncate excess precision beyond SCALE (18) digits.
      digits = digits.slice(0, keep);
    }
    const scaled = (negative ? -1n : 1n) * BigInt(digits === '' ? '0' : digits);
    return new Decimal(scaled);
  }

  add(other: DecimalInput): Decimal {
    return new Decimal(this.scaled + Decimal.from(other).scaled);
  }

  sub(other: DecimalInput): Decimal {
    return new Decimal(this.scaled - Decimal.from(other).scaled);
  }

  /** Exact multiplication at 18-digit scale. */
  mul(other: DecimalInput): Decimal {
    return new Decimal((this.scaled * Decimal.from(other).scaled) / SCALE_FACTOR);
  }

  /** Division, rounded half-even at 18 digits. */
  div(other: DecimalInput): Decimal {
    const divisor = Decimal.from(other);
    if (divisor.scaled === 0n) throw new Error('Decimal.div: division by zero');
    const numerator = this.scaled * SCALE_FACTOR;
    const quotient = numerator / divisor.scaled;
    const remainder = numerator % divisor.scaled;
    const halfRemainderAbs = (remainder < 0n ? -remainder : remainder) * 2n;
    const absDivisor = divisor.scaled < 0n ? -divisor.scaled : divisor.scaled;
    if (halfRemainderAbs > absDivisor) {
      const correction = (this.scaled < 0n) !== (divisor.scaled < 0n) ? -1n : 1n;
      return new Decimal(quotient + correction);
    }
    return new Decimal(quotient);
  }

  neg(): Decimal {
    return new Decimal(-this.scaled);
  }

  abs(): Decimal {
    return new Decimal(this.scaled < 0n ? -this.scaled : this.scaled);
  }

  cmp(other: DecimalInput): -1 | 0 | 1 {
    const o = Decimal.from(other).scaled;
    if (this.scaled < o) return -1;
    if (this.scaled > o) return 1;
    return 0;
  }

  eq(other: DecimalInput): boolean {
    return this.cmp(other) === 0;
  }

  gt(other: DecimalInput): boolean {
    return this.cmp(other) > 0;
  }

  gte(other: DecimalInput): boolean {
    return this.cmp(other) >= 0;
  }

  lt(other: DecimalInput): boolean {
    return this.cmp(other) < 0;
  }

  lte(other: DecimalInput): boolean {
    return this.cmp(other) <= 0;
  }

  isZero(): boolean {
    return this.scaled === 0n;
  }

  isNegative(): boolean {
    return this.scaled < 0n;
  }

  isPositive(): boolean {
    return this.scaled > 0n;
  }

  static min(a: DecimalInput, b: DecimalInput): Decimal {
    const da = Decimal.from(a);
    return da.lte(b) ? da : Decimal.from(b);
  }

  static max(a: DecimalInput, b: DecimalInput): Decimal {
    const da = Decimal.from(a);
    return da.gte(b) ? da : Decimal.from(b);
  }

  /** Round half-even to `dp` decimal places; default 18 = no-op. */
  round(dp = 18): Decimal {
    if (dp >= 18) return this;
    if (dp < 0) throw new Error('Decimal.round: negative decimal places');
    const drop = SCALE - BigInt(dp);
    const divisor = 10n ** drop;
    const quotient = this.scaled / divisor;
    const remainder = this.scaled % divisor;
    const half = divisor / 2n;
    const absRemainder = remainder < 0n ? -remainder : remainder;
    if (absRemainder * 2n > half * 2n || (absRemainder * 2n === half * 2n && quotient % 2n !== 0n)) {
      const sign = this.scaled < 0n ? -1n : 1n;
      return new Decimal((quotient + sign) * divisor);
    }
    return new Decimal(quotient * divisor);
  }

  toString(): string {
    const negative = this.scaled < 0n;
    const digits = (negative ? -this.scaled : this.scaled)
      .toString()
      .padStart(Number(SCALE) + 1, '0');
    const intPart = digits.slice(0, digits.length - Number(SCALE));
    let fracPart = digits.slice(digits.length - Number(SCALE));
    fracPart = fracPart.replace(/0+$/, '');
    const body = fracPart ? `${intPart}.${fracPart}` : intPart;
    return negative ? `-${body}` : body;
  }

  /** Fixed decimal places, e.g. `toFixed(2)` → `"123.40"`. */
  toFixed(dp: number): string {
    const rounded = this.round(dp);
    const negative = rounded.scaled < 0n;
    const digits = (negative ? -rounded.scaled : rounded.scaled)
      .toString()
      .padStart(Number(SCALE) + 1, '0');
    const intPart = digits.slice(0, digits.length - Number(SCALE));
    let fracPart = digits.slice(digits.length - Number(SCALE));
    if (dp === 0) return negative ? `-${intPart}` : intPart;
    fracPart = fracPart.slice(0, dp).padEnd(dp, '0');
    const body = `${intPart}.${fracPart}`;
    return negative ? `-${body}` : body;
  }

  /**
   * Lossy conversion for display/interop. Values beyond ±2^53 still convert
   * (to the nearest representable double) because Binance quantities/prices fit
   * comfortably inside the safe range; use `toString()` when exactness matters.
   */
  toNumber(): number {
    return Number(this.toString());
  }

  toJSON(): string {
    return this.toString();
  }
}

/** Convenience: `dec('1.5')` etc. */
export const dec = Decimal.from;

/** Sum a list of decimal inputs. Returns Decimal.ZERO for an empty list. */
export function sum(values: readonly DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.add(v), Decimal.ZERO);
}

/**
 * Volume-weighted average price: `sum(price_i * qty_i) / sum(qty_i)`.
 * Returns null when total quantity is zero.
 */
export function vwap(
  fills: readonly { price: DecimalInput; quantity: DecimalInput }[],
): Decimal | null {
  let totalNotional = Decimal.ZERO;
  let totalQty = Decimal.ZERO;
  for (const fill of fills) {
    totalNotional = totalNotional.add(Decimal.from(fill.price).mul(fill.quantity));
    totalQty = totalQty.add(fill.quantity);
  }
  if (totalQty.isZero()) return null;
  return totalNotional.div(totalQty);
}
