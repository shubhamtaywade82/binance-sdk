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
    /** Price-match mode the order was placed with (e.g. `OPPONENT`, `QUEUE`); `NONE` when unused. */
    pm: z.string().optional(),
    pP: z.boolean().optional(),
    si: z.number().optional(),
    ss: z.number().optional(),
    V: z.string().optional(),
    gtd: z.number().optional(),
    er: z.string().optional(),
    M: z.string().optional(),
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

/** `TRADE_LITE` — lightweight fill notification (decimal strings are kept exact). */
export const UserDataTradeLiteSchema = z.object({
  e: z.literal('TRADE_LITE'),
  E: z.number(),
  T: z.number().optional(),
  s: z.string().optional(),
  q: z.string().optional(),
  p: z.string().optional(),
  m: z.boolean().optional(),
  c: z.string().optional(),
  S: z.string().optional(),
  L: z.string().optional(),
  l: z.string().optional(),
  t: z.number().optional(),
  i: z.number().optional(),
});
export type UserDataTradeLite = z.infer<typeof UserDataTradeLiteSchema>;

/** `ALGO_UPDATE` — conditional/algo order lifecycle (replaces the legacy conditional-order events). */
export const UserDataAlgoUpdateSchema = z.object({
  e: z.literal('ALGO_UPDATE'),
  E: z.number(),
  T: z.number().optional(),
  o: z.looseObject({
    caid: z.string().optional(),
    aid: z.number().optional(),
    at: z.string().optional(),
    o: z.string().optional(),
    s: z.string().optional(),
    S: z.string().optional(),
    ps: z.string().optional(),
    f: z.string().optional(),
    q: z.string().optional(),
    X: z.string().optional(),
    ai: z.string().optional(),
    ap: z.string().optional(),
    aq: z.string().optional(),
    act: z.string().optional(),
    tp: z.string().optional(),
    p: z.string().optional(),
    V: z.string().optional(),
    wt: z.string().optional(),
    pm: z.string().optional(),
    cp: z.boolean().optional(),
    pP: z.boolean().optional(),
    R: z.boolean().optional(),
    tt: z.number().optional(),
    gtd: z.number().optional(),
    rm: z.string().optional(),
    ia: z.boolean().optional(),
  }),
});
export type UserDataAlgoUpdate = z.infer<typeof UserDataAlgoUpdateSchema>;

/** `ACCOUNT_CONFIG_UPDATE` — leverage (`ac`) or multi-assets-mode (`ai`) change. */
export const UserDataAccountConfigUpdateSchema = z.object({
  e: z.literal('ACCOUNT_CONFIG_UPDATE'),
  E: z.number(),
  T: z.number().optional(),
  ac: z.object({ s: z.string().optional(), l: z.number().optional() }).optional(),
  ai: z.object({ j: z.boolean().optional() }).optional(),
});
export type UserDataAccountConfigUpdate = z.infer<typeof UserDataAccountConfigUpdateSchema>;

/** `listenKeyExpired` — the listenKey is no longer valid; the stream must be re-established. */
export const UserDataListenKeyExpiredSchema = z.object({
  e: z.literal('listenKeyExpired'),
  E: z.number(),
  listenKey: z.string().optional(),
});
export type UserDataListenKeyExpired = z.infer<typeof UserDataListenKeyExpiredSchema>;

/**
 * An event type this SDK has no schema for (e.g. `GRID_UPDATE`, `STRATEGY_UPDATE`,
 * `CONDITIONAL_ORDER_TRIGGER_REJECT`, or one Binance adds later). Delivered as
 * received — unvalidated — instead of being dropped as an error. Narrow on `e`
 * against the typed union first; this member is the fallback.
 */
export interface UserDataUnknownEvent {
  e: string;
  [field: string]: unknown;
}

export type UserDataKnownEvent =
  | UserDataAccountUpdate
  | UserDataOrderTradeUpdate
  | UserDataMarginCall
  | UserDataTradeLite
  | UserDataAlgoUpdate
  | UserDataAccountConfigUpdate
  | UserDataListenKeyExpired;

export type UserDataEvent = UserDataKnownEvent | UserDataUnknownEvent;

/** Event-type → payload map for the typed events (drives `FuturesUserWS.onUserEvent`). */
export type UserDataEventMap = { [E in UserDataKnownEvent as E['e']]: E };

export function parseUserDataEvent(raw: unknown): UserDataEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid user-data payload');
  }
  const eventType = (raw as { e?: string }).e;
  if (eventType === 'ACCOUNT_UPDATE') return UserDataAccountUpdateSchema.parse(raw);
  if (eventType === 'ORDER_TRADE_UPDATE') return UserDataOrderTradeUpdateSchema.parse(raw);
  if (eventType === 'MARGIN_CALL') return UserDataMarginCallSchema.parse(raw);
  if (eventType === 'TRADE_LITE') return UserDataTradeLiteSchema.parse(raw);
  if (eventType === 'ALGO_UPDATE') return UserDataAlgoUpdateSchema.parse(raw);
  if (eventType === 'ACCOUNT_CONFIG_UPDATE') return UserDataAccountConfigUpdateSchema.parse(raw);
  if (eventType === 'listenKeyExpired') return UserDataListenKeyExpiredSchema.parse(raw);
  if (typeof eventType === 'string' && eventType.length > 0) return raw as UserDataUnknownEvent;
  throw new Error(`Invalid user-data payload: missing event type`);
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
