/**
 * WebSocket API signing payload. Verified against Binance's request-security page:
 * every request parameter except `signature` is sorted alphabetically by name,
 * formatted as `name=value`, and joined with `&`. Values are UTF-8 with NO
 * percent-encoding.
 *
 * Undefined and null values are omitted. Object values are rejected, because their
 * string form ("[object Object]") is never the wire form.
 */
export function buildSignaturePayload(params: Readonly<Record<string, unknown>>): string {
  return Object.entries(params)
    .filter(([key, value]) => key !== 'signature' && value !== undefined && value !== null)
    .map(([key, value]): [string, string] => {
      if (typeof value === 'object') {
        throw new TypeError(`signature parameter "${key}" must be a primitive value`);
      }
      return [key, String(value)];
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}
