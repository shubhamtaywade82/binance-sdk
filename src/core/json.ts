/**
 * Lossless JSON parsing for Binance payloads.
 *
 * `JSON.parse` coerces every integer to a JS double, silently corrupting values
 * above Number.MAX_SAFE_INTEGER (2^53 - 1). Binance identifiers (orderId,
 * tradeId, updateId, transaction IDs) are the classic casualties: two distinct
 * exchange IDs can compare equal after parsing.
 *
 * `parseJsonLossless` pre-passes the raw text and quotes any integer literal
 * whose magnitude exceeds the safe range, so oversized IDs surface as decimal
 * *strings* instead of silently-corrupted numbers. Values within the safe range
 * keep their original type, which keeps all existing Zod schemas valid.
 */

const MAX_SAFE_BIG = 9007199254740991n; // 2^53 - 1
const MIN_SAFE_BIG = -9007199254740991n;

/**
 * Matches integer JSON literals (object values *and* array elements, since
 * Binance sends klines as arrays) with 16+ digits — the conservative pre-filter;
 * the precise safe-range check is done with BigInt on the candidate afterwards.
 */
const LARGE_INT_PATTERN = /([:,\[]\s*)(-?\d{16,})(\s*[},\]])/g;

export function parseJsonLossless(text: string): unknown {
  const patched = text.replace(LARGE_INT_PATTERN, (match, prefix, digits, tail) => {
    // Compare with BigInt: Number(digits) may itself round, which would make an
    // unsafe literal deceptively "safe" (e.g. 10000000000000001 -> 1e16).
    const numeric = BigInt(digits);
    if (numeric <= MAX_SAFE_BIG && numeric >= MIN_SAFE_BIG) return match;
    return `${prefix}"${digits}"${tail}`;
  });
  return JSON.parse(patched);
}

/** Type-safe wrapper for callers that know the payload shape. */
export function parseJsonLosslessAs<T>(text: string): T {
  return parseJsonLossless(text) as T;
}

/**
 * Deep-walks a parsed payload converting long integer *strings* back into
 * numbers only when they are safe — useful when the caller wants uniform
 * `number` types for fields that are practically always small.
 */
export function normalizeIntStrings<T>(value: T): T {
  if (typeof value === 'string' && /^-?\d{16,}$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric as unknown as T;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeIntStrings(item)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeIntStrings(item);
    }
    return out as unknown as T;
  }
  return value;
}
