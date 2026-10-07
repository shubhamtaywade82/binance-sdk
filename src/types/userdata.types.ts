import { z } from 'zod';

export const ListenKeySchema = z.object({
  listenKey: z.string(),
});
export type ListenKey = z.infer<typeof ListenKeySchema>;

export const UserDataAccountUpdateSchema = z.object({
  e: z.literal('ACCOUNT_UPDATE'),
  E: z.number(),
  T: z.number(),
  a: z.object({
    m: z.string().transform(Number),
    B: z.array(
      z.object({
        a: z.string(),
        wb: z.string().transform(Number),
        cw: z.string().transform(Number),
        bc: z.string().transform(Number),
      }),
    ),
    P: z.array(
      z.object({
        s: z.string(),
        pa: z.string().transform(Number),
        ep: z.string().transform(Number),
        cr: z.string().transform(Number),
        up: z.string().transform(Number),
        mt: z.string(),
        iw: z.string().transform(Number).optional(),
        ps: z.string(),
      }),
    ),
  }),
});
export type UserDataAccountUpdate = z.infer<typeof UserDataAccountUpdateSchema>;

/**
 * Verified price-match enum for `ORDER_TRADE_UPDATE.o.pm` (per the
 * Binance Portfolio Margin Public Definitions and COIN-M Public Definitions).
 *
 * The audit's October 7 digest confirmed the canonical enum values after a
 * prior spec listed only OPPONENT / TOP / QUEUE — the verified set includes
 * `OPPONENT_5/10/20` and `QUEUE_5/10/20` for best-N offset matching, and
 * `NONE` as the default. A `string & {}` fallback is included so future
 * protocol additions don't break deserialization (the SDK's
 * `parseUserDataEvent` will still route them through to consumers).
 */
export const PriceMatchModeSchema = z.enum([
  'NONE',
  'OPPONENT',
  'OPPONENT_5',
  'OPPONENT_10',
  'OPPONENT_20',
  'TOP',
  'QUEUE',
  'QUEUE_5',
  'QUEUE_10',
  'QUEUE_20',
]);
/** Strict enum of canonical Binance price-match modes. */
export type PriceMatchMode = z.infer<typeof PriceMatchModeSchema>;
/** Permissive schema used on inbound frames — accepts any string but
 *  surfaces the strict enum to TypeScript consumers via the inferred type. */
export const PriceMatchModeLooseSchema = z.union([
  PriceMatchModeSchema,
  z.string(),
]);

export const UserDataOrderTradeUpdateSchema = z.object({
  e: z.literal('ORDER_TRADE_UPDATE'),
  E: z.number(),
  T: z.number(),
  o: z.object({
    s: z.string(),
    c: z.string(),
    i: z.number(),
    S: z.string(),
    o: z.string(),
    f: z.string(),
    q: z.string().transform(Number),
    p: z.string().transform(Number),
    ap: z.string().transform(Number),
    sp: z.string().transform(Number),
    x: z.string(),
    X: z.string(),
    l: z.string().transform(Number),
    z: z.string().transform(Number),
    L: z.string().transform(Number),
    n: z.string().transform(Number),
    N: z.string(),
    T: z.number(),
    t: z.number(),
    b: z.string().transform(Number),
    a: z.string().transform(Number),
    m: z.boolean(),
    R: z.boolean(),
    wt: z.string(),
    ot: z.string(),
    ps: z.string(),
    cp: z.boolean().optional(),
    AP: z.string().transform(Number).optional(),
    cr: z.string().transform(Number).optional(),
    rp: z.string().transform(Number).optional(),
    /**
     * Price-match mode for the order (Binance Portfolio Margin and COIN-M
     * Public Definitions). Optional because Binance omits the field on
     * orders placed without price-match semantics. The audit's October 7
     * digest verified the canonical enum and confirmed Binance uses the
     * `pm` field — not a `priceMatch` camelCase variant — on the wire.
     */
    pm: PriceMatchModeLooseSchema.optional(),
  }),
});
export type UserDataOrderTradeUpdate = z.infer<typeof UserDataOrderTradeUpdateSchema>;

export const UserDataMarginCallSchema = z.object({
  e: z.literal('MARGIN_CALL'),
  E: z.number(),
  cw: z.string().transform(Number),
  p: z.array(
    z.object({
      s: z.string(),
      ps: z.string(),
      pa: z.string().transform(Number),
      mt: z.string(),
      iw: z.string().transform(Number),
      mp: z.string().transform(Number),
      up: z.string().transform(Number),
      mm: z.string().transform(Number),
    }),
  ),
});
export type UserDataMarginCall = z.infer<typeof UserDataMarginCallSchema>;

/**
 * Portfolio Margin Pro account update — pushed by Binance's PM Pro stream
 * gateway (separate from the Classic PM stream at `wss://fstream.binance.com/pm-classic`).
 *
 * Per the official schema (Portfolio Margin Pro WebSocket Stream Schemas), the
 * payload carries unified USDⓈ-M Futures + COIN-M Futures + Spot Cross Margin
 * risk telemetry as **exact decimal strings** — sub-satoshi precision is
 * preserved (the audit's October 7 digest explicitly recommends keeping
 * decimal strings, not `Number(...)` transforms, on new event schemas to
 * avoid IEEE 754 precision loss on collateral equity / margin values).
 */
export const PortfolioMarginProAccountUpdateSchema = z.object({
  e: z.literal('PM_PRO_ACCOUNT_UPDATE'),
  /** Event time (ms). */
  E: z.number(),
  /** Transaction time (ms) — Binance includes this on PM Pro events. */
  T: z.number(),
  /** uniMMR level (e.g. "1.99999999"). */
  u: z.string(),
  /** Account equity in USD (e.g. "30.23416728"). */
  eq: z.string(),
  /** Actual equity without collateral haircut in USD. */
  ae: z.string(),
  /** Total initial margin in USD. */
  im: z.string(),
  /** Total maintenance margin in USD. */
  mm: z.string(),
  /** Total available balance in USD. */
  avb: z.string(),
  /** Virtual maxWithdraw amount in USD. */
  vmw: z.string(),
});
export type PortfolioMarginProAccountUpdate = z.infer<
  typeof PortfolioMarginProAccountUpdateSchema
>;

/**
 * Decimal-preserving mirror of {@link UserDataAccountUpdateSchema}.
 *
 * The audit's October 7 digest explicitly recommends: "Keeping existing
 * schemas untouched preserves backward compatibility for downstream
 * consumers while allowing new event types to retain sub-satoshi
 * precision." The original `UserDataAccountUpdateSchema` uses
 * `.transform(Number)` on every decimal field — fine for callers
 * that want numeric coercion, but a precision-loss trap for the
 * position accumulator (e.g. `'64500.00'` → `64500` → `'64500'`,
 * losing trailing zeros and IEEE 754 representation). The dispatcher
 * uses this Raw variant to preserve the exact decimal string Binance
 * sent on the wire.
 */
export const UserDataAccountUpdateRawSchema = z.object({
  e: z.literal('ACCOUNT_UPDATE'),
  E: z.number(),
  T: z.number(),
  a: z.object({
    m: z.string(),
    B: z.array(
      z.object({
        a: z.string(),
        wb: z.string(),
        cw: z.string(),
        bc: z.string(),
      }),
    ),
    P: z.array(
      z.object({
        s: z.string(),
        pa: z.string(),
        ep: z.string(),
        cr: z.string(),
        up: z.string(),
        mt: z.string(),
        iw: z.string().optional(),
        ps: z.string(),
      }),
    ),
  }),
});
export type UserDataAccountUpdateRaw = z.infer<typeof UserDataAccountUpdateRawSchema>;

/**
 * Fallback envelope for events Binance emits that the SDK does not yet
 * model explicitly — `GRID_UPDATE`, `STRATEGY_UPDATE`,
 * `CONDITIONAL_ORDER_TRIGGER_REJECT`, future algo / strategy events.
 *
 * The audit's October 7 digest flags that throwing on unrecognized event
 * types is a common production-crash vector in user-data streams: a new
 * upstream event (e.g. the recent `ALGO_UPDATE` replacing legacy
 * `/papi/v1/um/conditional/*` triggers) would terminate a real trading
 * bot's user stream the first time Binance sent it. The dispatcher
 * instead routes unmodeled events to a typed `UserDataUnknownEvent` so
 * callers can listen for `e: '*'` (or the literal event name) and
 * decide whether to log, persist, or act.
 */
export const UserDataUnknownEventSchema = z.object({
  e: z.string(),
  E: z.number(),
}).passthrough();
export type UserDataUnknownEvent = z.infer<typeof UserDataUnknownEventSchema>;

export type UserDataEvent =
  | UserDataAccountUpdate
  | UserDataOrderTradeUpdate
  | UserDataMarginCall
  | PortfolioMarginProAccountUpdate
  | UserDataUnknownEvent;

/**
 * Discriminate a parsed user-data event by its `e` field. The narrow
 * helper keeps TypeScript consumers free of `as` casts when branching
 * on event types after a `parseUserDataEvent(raw)` call.
 */
export function isUserDataEvent<T extends UserDataEvent['e']>(
  event: UserDataEvent,
  type: T,
): event is Extract<UserDataEvent, { e: T }> {
  return event.e === type;
}

/**
 * Parse an inbound user-data payload into the typed {@link UserDataEvent}
 * union. Unrecognized event types — e.g. `GRID_UPDATE`, `STRATEGY_UPDATE`,
 * `CONDITIONAL_ORDER_TRIGGER_REJECT`, the recent `ALGO_UPDATE` that
 * replaced legacy conditional trigger endpoints — surface as a typed
 * {@link UserDataUnknownEvent} rather than throwing, so a new upstream
 * event cannot terminate a real trading bot's user-data stream.
 */
export function parseUserDataEvent(raw: unknown): UserDataEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid user-data payload');
  }
  const eventType = (raw as { e?: string }).e;
  if (eventType === 'ACCOUNT_UPDATE') return UserDataAccountUpdateSchema.parse(raw);
  if (eventType === 'ORDER_TRADE_UPDATE') return UserDataOrderTradeUpdateSchema.parse(raw);
  if (eventType === 'MARGIN_CALL') return UserDataMarginCallSchema.parse(raw);
  if (eventType === 'PM_PRO_ACCOUNT_UPDATE') return PortfolioMarginProAccountUpdateSchema.parse(raw);
  // Unrecognized event type — surface as UserDataUnknownEvent so consumers
  // can attach a wildcard listener and act on future upstream additions
  // rather than having the dispatcher throw and break the stream.
  return UserDataUnknownEventSchema.parse(raw) as UserDataUnknownEvent;
}

export const WsApiResponseSchema = z.object({
  id: z.string(),
  status: z.number(),
  result: z.unknown(),
  error: z
    .object({
      code: z.number(),
      msg: z.string(),
    })
    .optional(),
});
export type WsApiResponse = z.infer<typeof WsApiResponseSchema>;
