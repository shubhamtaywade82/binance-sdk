/**
 * USDⓈ-M private (user-data) stream URL construction.
 *
 * Binance's 2026-03 WebSocket routing migration (see "Important WebSocket
 * Change Notice — Base URL Split", developers.binance.com) split the USDⓈ-M
 * futures gateway into three routed bases:
 *
 *   - `wss://fstream.binance.com/public`  — high-frequency public data
 *   - `wss://fstream.binance.com/market`  — regular market data
 *   - `wss://fstream.binance.com/private` — user data (listenKey streams)
 *
 * For user data the migration notice documents the listen key and the event
 * subscription as **query parameters** on the `/ws` route of the private base:
 *
 *   wss://fstream.binance.com/private/ws?listenKey=<listenKey>&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE
 *
 * The legacy `/ws` and `/stream` paths (including the pre-migration
 * `/public/ws/<listenKey>` form this SDK used before v3.5.1) were
 * decommissioned on 2026-04-23: unmigrated connections only receive data
 * from `/public`, so a user-data stream on the legacy path silently carries no
 * events at all. The event names are joined with `/` — that separator is part
 * of the documented contract, so it must not be percent-encoded.
 *
 * The user-data-streams page also shows the listen key as a path segment
 * (`…/private/ws/<listenKey>`). The two pages conflict; the migration notice
 * (updated 2026-04-02) is the routing authority and its query form is the
 * default here. The path form remains selectable as an escape hatch for
 * consumers whose gateway rejects the query form, via
 * {@link PrivateUrlStyle} = `'path'`.
 *
 * Security: the listen key never appears in logs or events — {@link
 * redactPrivateUrl} strips it from query parameters and path segments alike.
 */

/** How the listen key is attached to the private base URL. */
export type PrivateUrlStyle = 'query' | 'path';

/** Known USDⓈ-M user-data event names (see user-data-streams docs). */
export const USER_DATA_EVENTS = [
  'ACCOUNT_UPDATE',
  'ORDER_TRADE_UPDATE',
  'MARGIN_CALL',
  'ACCOUNT_CONFIG_UPDATE',
  'listenKeyExpired',
] as const;

export type UserDataEventName = (typeof USER_DATA_EVENTS)[number];

/** Event names must be plain protocol tokens — no separators, no whitespace. */
const EVENT_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** True when `name` is one of the event types this SDK models natively. */
export function isKnownUserDataEvent(name: string): name is UserDataEventName {
  return (USER_DATA_EVENTS as readonly string[]).includes(name);
}

export interface PrivateStreamUrlOptions {
  /** Private base URL, e.g. `wss://fstream.binance.com/private`. */
  baseUrl: string;
  /** The listenKey. `null`/empty aborts URL construction (caller must not connect). */
  listenKey: string | null | undefined;
  /**
   * Event names to subscribe on connect. Empty/omitted means "no `events`
   * parameter" — the stream then delivers every event type for the listenKey,
   * which is the pre-migration behavior this SDK preserves by default.
   * Multiple names are joined with `/` per the documented contract.
   */
  events?: readonly string[];
  /** Key placement. Default `'query'` (the migration-notice form). */
  style?: PrivateUrlStyle;
}

/**
 * Build the USDⓈ-M private user-data stream URL. Returns `null` when there is
 * no listen key — the caller must not connect in that state.
 *
 * The builder tolerates legacy bases that already end in `/ws` (the pre-v3.5.1
 * `endpoints.wsUser` value `…/public/ws`): the key is then attached to the
 * given base as-is instead of appending a second `/ws` segment.
 */
export function buildPrivateStreamUrl(options: PrivateStreamUrlOptions): string | null {
  const { baseUrl, listenKey, events, style = 'query' } = options;
  if (typeof listenKey !== 'string' || listenKey === '') return null;

  // Strip trailing slashes and any trailing `/ws` segment (case-insensitive).
  // Plain string ops avoid the `+$` quantifier on a regex applied to
  // uncontrolled `baseUrl` input, which CodeQL's js/polynomial-redos rule
  // flags as a potential ReDoS vector. The loop is O(n) in the trailing-slash
  // count and never rescans earlier characters.
  let base = baseUrl;
  while (base.endsWith('/')) base = base.slice(0, -1);
  if (base.length >= 3 && base.toLowerCase().endsWith('/ws')) {
    base = base.slice(0, -3);
  }
  const eventNames = (events ?? []).filter((name) => {
    if (!EVENT_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid user-data event name: ${JSON.stringify(name)}`);
    }
    return true;
  });
  const eventsQuery =
    eventNames.length > 0 ? `&events=${eventNames.join('/')}` : '';

  if (style === 'path') {
    // Escape hatch; used by products whose gateway expects the key in the path.
    return `${base}/ws/${encodeURIComponent(listenKey)}${eventsQuery}`;
  }
  return `${base}/ws?listenKey=${encodeURIComponent(listenKey)}${eventsQuery}`;
}

/**
 * Redact listen keys (query parameter or path segment) from a URL before it
 * can reach a log line or an observability event. Also strips signature and
 * apiKey query values, which must never be logged either.
 */
export function redactPrivateUrl(url: string): string {
  return url
    .replace(/([?&]listenKey=)[^&]*/gi, '$1<redacted>')
    .replace(/([?&]signature=)[^&]*/gi, '$1<redacted>')
    .replace(/([?&]apiKey=)[^&]*/gi, '$1<redacted>')
    .replace(/\/(ws|stream)\/([0-9a-zA-Z_-]{16,})(\/|$)/i, '/$1/<redacted>$3');
}

/** A short, non-reversible-looking fingerprint safe for logs and events. */
export function fingerprintKey(key: string): string {
  if (key.length <= 8) return `<${key.length} chars>`;
  return `${key.slice(0, 4)}…${key.slice(-4)} (${key.length})`;
}
