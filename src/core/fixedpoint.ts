/**
 * Zero-dependency, exact fixed-point decimal arithmetic on `bigint`.
 *
 * Binance rejects an order that does not sit exactly on a PRICE_FILTER tick or
 * LOT_SIZE step (-1013 FILTER_FAILURE / -1111 precision). Binary floats cannot
 * represent those boundaries: `0.3 / 0.1 === 2.9999999999999996` and
 * `0.1 * 3 === 0.30000000000000004`. Every value here is an exact
 * `units * 10^-scale` pair. Rounding happens only inside the explicit
 * quantizers below, and each one states its direction.
 */

export interface FixedDecimal {
  /** Signed integer mantissa: value = units / 10^scale. */
  readonly units: bigint;
  /** Decimal places, 0..{@link MAX_FIXED_SCALE}. */
  readonly scale: number;
}

/** Hard cap on decimal places. Exchange prices/quantities never need more. */
export const MAX_FIXED_SCALE = 40;

const MAX_TEXT_LENGTH = 128;
const MAX_POW10_EXPONENT = 400;
// Optional sign, integer digits, optional fraction, optional exponent (1–3 digits).
const DECIMAL_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d{1,3}))?$/i;

export function pow10(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_POW10_EXPONENT) {
    throw new RangeError(`pow10: exponent out of range: ${exponent}`);
  }
  return 10n ** BigInt(exponent);
}

function describeInput(text: string): string {
  return JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text);
}

/**
 * Parse a decimal into an exact {@link FixedDecimal}.
 *
 * Numbers are converted through their shortest round-trip string (`String(n)`),
 * so `0.1` parses as exactly `1 * 10^-1`, not as its binary approximation.
 * Non-finite numbers, malformed strings, and inputs beyond
 * {@link MAX_FIXED_SCALE} decimal places throw a RangeError. Callers must
 * reject, not guess.
 */
export function parseFixed(input: string | number | bigint): FixedDecimal {
  if (typeof input === 'bigint') return { units: input, scale: 0 };

  let text: string;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new RangeError(`parseFixed: non-finite number ${input}`);
    text = String(input);
  } else {
    text = input.trim();
  }
  if (text.length === 0 || text.length > MAX_TEXT_LENGTH) {
    throw new RangeError(`parseFixed: empty or oversized input ${describeInput(text)}`);
  }

  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new RangeError(`parseFixed: not a decimal string ${describeInput(text)}`);
  const [, sign = '', intPart = '', fracPart = '', expPart] = match;
  if (intPart.length + fracPart.length === 0) {
    throw new RangeError(`parseFixed: no digits in ${describeInput(text)}`);
  }

  const exponent = expPart === undefined ? 0 : Number(expPart);
  let units = BigInt(`${intPart}${fracPart}` || '0');
  let scale = fracPart.length - exponent;
  if (scale < 0) {
    units *= pow10(-scale);
    scale = 0;
  }
  if (scale > MAX_FIXED_SCALE) {
    // Redundant trailing zeros are not precision; drop them before rejecting.
    while (scale > MAX_FIXED_SCALE && units % 10n === 0n) {
      units /= 10n;
      scale -= 1;
    }
    if (scale > MAX_FIXED_SCALE) {
      throw new RangeError(`parseFixed: more than ${MAX_FIXED_SCALE} decimal places ${describeInput(text)}`);
    }
  }
  return { units: sign === '-' ? -units : units, scale };
}

/** Strip redundant trailing zeros so that equal values share one representation. */
export function normalizeFixed(value: FixedDecimal): FixedDecimal {
  let { units, scale } = value;
  while (scale > 0 && units % 10n === 0n) {
    units /= 10n;
    scale -= 1;
  }
  return { units, scale };
}

function alignUnits(value: FixedDecimal, scale: number): bigint {
  return value.units * pow10(scale - value.scale);
}

/** Exact three-way comparison. */
export function compareFixed(a: FixedDecimal, b: FixedDecimal): -1 | 0 | 1 {
  const scale = Math.max(a.scale, b.scale);
  const x = alignUnits(a, scale);
  const y = alignUnits(b, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Exact product. The scale is the sum of the operand scales; nothing is rounded. */
export function multiplyFixed(a: FixedDecimal, b: FixedDecimal): FixedDecimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** Floor division for a positive divisor (rounds toward negative infinity). */
export function floorDiv(numerator: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new RangeError('floorDiv: divisor must be positive');
  const quotient = numerator / divisor;
  return numerator % divisor !== 0n && numerator < 0n ? quotient - 1n : quotient;
}

/** Ceiling division for a positive divisor (rounds toward positive infinity). */
export function ceilDiv(numerator: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new RangeError('ceilDiv: divisor must be positive');
  const quotient = numerator / divisor;
  return numerator % divisor !== 0n && numerator > 0n ? quotient + 1n : quotient;
}

function requirePositive(step: FixedDecimal): void {
  if (step.units <= 0n) throw new RangeError('quantizer: step must be > 0');
}

/**
 * Round DOWN onto a step boundary (quantities: never take on more than asked).
 * Result scale is max(value.scale, step.scale); the result is always <= value
 * for positive values.
 */
export function quantizeFloor(value: FixedDecimal, step: FixedDecimal): FixedDecimal {
  requirePositive(step);
  const scale = Math.max(value.scale, step.scale);
  const stepUnits = alignUnits(step, scale);
  const steps = floorDiv(alignUnits(value, scale), stepUnits);
  return { units: steps * stepUnits, scale };
}

/**
 * Round to the NEAREST step boundary; ties round away from zero (prices).
 */
export function quantizeRound(value: FixedDecimal, step: FixedDecimal): FixedDecimal {
  requirePositive(step);
  const scale = Math.max(value.scale, step.scale);
  const stepUnits = alignUnits(step, scale);
  const units = alignUnits(value, scale);
  const magnitude = units < 0n ? -units : units;
  const steps = (2n * magnitude + stepUnits) / (2n * stepUnits);
  const rounded = steps * stepUnits;
  return { units: units < 0n ? -rounded : rounded, scale };
}

/**
 * Exact ceiling of `numerator / denominator` for a positive denominator, e.g.
 * `ceilRatio(qty, icebergQty)` gives the iceberg slice count CEIL(qty / icebergQty).
 */
export function ceilRatio(numerator: FixedDecimal, denominator: FixedDecimal): bigint {
  requirePositive(denominator);
  const scale = Math.max(numerator.scale, denominator.scale);
  return ceilDiv(alignUnits(numerator, scale), alignUnits(denominator, scale));
}

/** True when `value` is an exact integer multiple of `step`. */
export function isOnStep(value: FixedDecimal, step: FixedDecimal): boolean {
  requirePositive(step);
  const scale = Math.max(value.scale, step.scale);
  return alignUnits(value, scale) % alignUnits(step, scale) === 0n;
}

/**
 * Render with exactly `decimals` places. Padding is exact. Truncation (when
 * `decimals < value.scale`) drops digits toward zero, so callers should only
 * truncate values that are already on the target step.
 */
export function formatFixed(value: FixedDecimal, decimals: number = value.scale): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_FIXED_SCALE) {
    throw new RangeError(`formatFixed: decimals out of range: ${decimals}`);
  }
  let units = value.units;
  if (decimals > value.scale) units *= pow10(decimals - value.scale);
  else if (decimals < value.scale) units /= pow10(value.scale - decimals);

  const negative = units < 0n;
  const digits = (negative ? -units : units).toString();
  const sign = negative ? '-' : '';
  if (decimals === 0) return `${sign}${digits}`;
  const padded = digits.padStart(decimals + 1, '0');
  return `${sign}${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`;
}

/** Exact comparison of two decimal strings or numbers. */
export function compareDecimals(a: string | number, b: string | number): -1 | 0 | 1 {
  return compareFixed(parseFixed(a), parseFixed(b));
}

/** Exact product of two decimals, rendered with no precision loss. */
export function multiplyDecimals(a: string | number, b: string | number): string {
  const product = normalizeFixed(multiplyFixed(parseFixed(a), parseFixed(b)));
  return formatFixed(product, product.scale);
}

/** Round DOWN `value` onto `step`, rendered at the step's own precision. */
export function floorToStepString(value: string | number, step: string | number): string {
  const normalized = normalizeFixed(parseFixed(step));
  return formatFixed(quantizeFloor(parseFixed(value), normalized), normalized.scale);
}

/** Round `value` to the NEAREST `step`, rendered at the step's own precision. */
export function roundToStepString(value: string | number, step: string | number): string {
  const normalized = normalizeFixed(parseFixed(step));
  return formatFixed(quantizeRound(parseFixed(value), normalized), normalized.scale);
}
