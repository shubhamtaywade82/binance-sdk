/**
 * Exact decimal arithmetic for exchange-critical values.
 *
 * Binance transmits every price, quantity, fee and notional as a decimal
 * *string*. Converting those to IEEE-754 doubles before doing arithmetic
 * reintroduces representation error exactly where the exchange later
 * rejects the value (-1111 tick/step, -4164 min notional). This module keeps
 * values as scaled BigInt integers so the arithmetic is exact, and converts
 * to `number` only at the boundary where analysis (not the wire) consumes it.
 *
 * Representation: value = sign * digits * 10^-scale  (digits >= 0, scale >= 0)
 */

export interface ExactDecimal {
  readonly sign: 1 | -1;
  readonly digits: bigint;
  readonly scale: number;
}

const ZERO: ExactDecimal = { sign: 1, digits: 0n, scale: 0 };

/** "12.3400" -> {sign:1, digits:1234n, scale:2}; "-0.5" -> {sign:-1, digits:5n, scale:1}. */
export function parseExact(value: string | number | ExactDecimal): ExactDecimal {
  if (typeof value === 'object') return value;
  const text = typeof value === 'number' ? numberToExactString(value) : value.trim();
  if (text === '') throw new Error('Cannot parse decimal from empty string');
  if (text === '0' || text === '-0') return ZERO;

  const match = text.match(/^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match || (match[2] === '' && (match[3] === undefined || match[3] === ''))) {
    throw new Error(`Cannot parse decimal from "${value}"`);
  }

  const negative = match[1] === '-';
  const intPart = match[2] ?? '';
  const fracPart = match[3] ?? '';
  const exp = match[4] !== undefined ? Number.parseInt(match[4], 10) : 0;
  if (!Number.isFinite(exp)) throw new Error(`Cannot parse decimal from "${value}"`);

  let digitsStr = `${intPart}${fracPart}` || '0';
  let scale = fracPart.length - exp;
  if (scale < 0) {
    digitsStr += '0'.repeat(-scale);
    scale = 0;
  }

  const trimmed = digitsStr.replace(/^0+/, '') || '0';
  const digits = BigInt(trimmed);
  if (digits === 0n) return ZERO;
  return normalizeScale({ sign: negative ? -1 : 1, digits, scale });
}

/**
 * Shortest round-trip decimal string of a JS number. Number#toString is
 * already the shortest string that round-trips, so parsing it back is as
 * exact as the number's own decimal intent.
 */
export function numberToExactString(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Cannot represent ${value} exactly`);
  return String(value);
}

/** "123.45" <- {sign:1, digits:12345n, scale:2}; no trailing zeros stripped. */
export function toExactString(value: ExactDecimal): string {
  if (value.digits === 0n) return '0';
  const negative = value.sign === -1 ? '-' : '';
  const digitsStr = value.digits.toString().padStart(value.scale + 1, '0');
  if (value.scale === 0) return `${negative}${digitsStr}`;
  return `${negative}${digitsStr.slice(0, -value.scale)}.${digitsStr.slice(-value.scale)}`;
}

export function toNumber(value: ExactDecimal): number {
  return Number(toExactString(value));
}

/** Normalize to a common scale so digit integers are directly comparable. */
function align(a: ExactDecimal, b: ExactDecimal): { aDigits: bigint; bDigits: bigint; scale: number } {
  const scale = Math.max(a.scale, b.scale);
  return {
    aDigits: a.digits * 10n ** BigInt(scale - a.scale),
    bDigits: b.digits * 10n ** BigInt(scale - b.scale),
    scale,
  };
}

export function addExact(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const { aDigits, bDigits, scale } = align(a, b);
  const sum = aDigits * BigInt(a.sign) + bDigits * BigInt(b.sign);
  return fromScaledBigInt(sum, scale);
}

export function subExact(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  return addExact(a, { sign: (b.sign * -1) as 1 | -1, digits: b.digits, scale: b.scale });
}

export function mulExact(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const product = a.digits * b.digits * BigInt(a.sign * b.sign);
  return normalizeScale({
    sign: product < 0n ? -1 : 1,
    digits: product < 0n ? -product : product,
    scale: a.scale + b.scale,
  });
}

/** Exact division truncated toward zero at `scale` decimal places (default 20). */
export function divExact(a: ExactDecimal, b: ExactDecimal, scale = 20): ExactDecimal {
  if (b.digits === 0n) throw new Error('Division by zero');
  const target = BigInt(scale);
  // (a.digits * 10^-a.scale) / (b.digits * 10^-b.scale) at result scale `scale`:
  // digits = a.digits * 10^(scale + b.scale) / (b.digits * 10^a.scale)
  const numerator = a.digits * 10n ** (target + BigInt(b.scale)) * BigInt(a.sign * b.sign);
  const denominator = b.digits * 10n ** BigInt(a.scale);
  const quotient = numerator / denominator; // BigInt division truncates toward zero
  return normalizeScale({
    sign: quotient < 0n ? -1 : 1,
    digits: quotient < 0n ? -quotient : quotient,
    scale,
  });
}

export function cmpExact(a: ExactDecimal, b: ExactDecimal): -1 | 0 | 1 {
  const { aDigits, bDigits } = align(a, b);
  const left = aDigits * BigInt(a.sign);
  const right = bDigits * BigInt(b.sign);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function absExact(a: ExactDecimal): ExactDecimal {
  return { sign: 1, digits: a.digits, scale: a.scale };
}

function fromScaledBigInt(scaled: bigint, scale: number): ExactDecimal {
  return normalizeScale({
    sign: scaled < 0n ? -1 : 1,
    digits: scaled < 0n ? -scaled : scaled,
    scale,
  });
}

/** Strip trailing zeros from the fractional part (1.500 -> 1.5). */
function normalizeScale(value: ExactDecimal): ExactDecimal {
  if (value.digits === 0n) return ZERO;
  let { digits, scale } = value;
  while (scale > 0 && digits % 10n === 0n) {
    digits /= 10n;
    scale -= 1;
  }
  return { sign: value.sign, digits, scale };
}

function floorStepInternal(value: ExactDecimal, step: ExactDecimal): ExactDecimal {
  if (step.digits === 0n) return value;

  const scale = Math.max(value.scale, step.scale);
  const valueDigits = value.digits * 10n ** BigInt(scale - value.scale) * BigInt(value.sign);
  const stepDigits = step.digits * 10n ** BigInt(scale - step.scale);

  let quotient = valueDigits / stepDigits; // truncation toward zero
  if (value.sign === -1 && valueDigits % stepDigits !== 0n) quotient -= 1n; // floor for negatives
  return fromScaledBigInt(quotient * stepDigits, scale);
}

/**
 * Quantize onto a step boundary, rounding DOWN (floor). Used for quantities:
 * rounding up would silently take on more size/risk than the caller asked for.
 * Returns an exact decimal-string, e.g. floorToStepExact("0.0037", "0.001") = "0.003".
 */
export function floorToStepExact(
  value: string | number | ExactDecimal,
  step: string | number | ExactDecimal,
): string {
  return toExactString(floorStepInternal(parseExact(value), parseExact(step)));
}

/** Quantize onto a step boundary, rounding to NEAREST (ties away from zero). Used for prices. */
export function roundToStepExact(
  value: string | number | ExactDecimal,
  step: string | number | ExactDecimal,
): string {
  const v = parseExact(value);
  const s = parseExact(step);
  if (s.digits === 0n) return toExactString(v);

  const floored = floorStepInternal(v, s);
  const magnitudeFloored = floorStepInternal(absExact(v), s);
  const remainder = subExact(absExact(v), magnitudeFloored);
  const remainderScale = Math.max(remainder.scale, s.scale) + 1;
  const half = divExact(s, parseExact(2), remainderScale);
  const roundUp = cmpExact(remainder, half) >= 0;

  const result = roundUp
    ? addExact(floored, mulExact(s, parseExact(v.sign === -1 ? -1 : 1)))
    : floored;
  return toExactString(result);
}

/** Fixed-precision decimal string, rounding half away from zero: formatExact(0.1, 2) = "0.10". */
export function formatExact(value: string | number | ExactDecimal, decimals: number): string {
  const v = parseExact(value);
  const shift = BigInt(decimals - v.scale);
  let scaled: bigint;
  if (shift >= 0) {
    scaled = v.digits * 10n ** shift * BigInt(v.sign);
  } else {
    const divisor = 10n ** -shift;
    const quotient = v.digits / divisor;
    const remainder = v.digits % divisor;
    const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient; // half up on magnitude
    scaled = rounded * BigInt(v.sign);
  }

  const negative = scaled < 0n;
  const absScaled = negative ? -scaled : scaled;
  const sign = negative ? '-' : '';
  const digitsStr = absScaled.toString().padStart(decimals + 1, '0');
  if (decimals === 0) return `${sign}${digitsStr}`;
  return `${sign}${digitsStr.slice(0, -decimals)}.${digitsStr.slice(-decimals)}`;
}

/** Exact price * quantity, e.g. mulStrings("60000.1", "0.003") = "180.0003". */
export function mulStrings(a: string | number, b: string | number): string {
  return toExactString(mulExact(parseExact(a), parseExact(b)));
}

/** String convenience wrapper around cmpExact: exactCompare("0.1", "0.10") === 0. */
export function exactCompare(a: string | number, b: string | number): -1 | 0 | 1 {
  return cmpExact(parseExact(a), parseExact(b));
}

/** True when the two decimal strings represent the same value ("0.10" == "0.1"). */
export function exactEquals(a: string | number, b: string | number): boolean {
  return exactCompare(a, b) === 0;
}
