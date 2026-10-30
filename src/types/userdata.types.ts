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
        /** Breakeven price (added to the event contract by Binance; optional for older frames). */
        bep: z.string().transform(Number).optional(),
        cr: z.string().transform(Number),
        up: z.string().transform(Number),
        mt: z.string(),
        iw: z.string().transform(Number).optional(),
        ps: z.string(),
      }),
    ),
  }),
  /** Symbol associated with FUNDING_FEE balance events, when present. */
  S: z.string().optional(),
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
    /** modifyId — only pushed for AMENDMENT events when the modify request carried one (2026-07-21). */
    M: z.union([z.number(), z.string()]).optional(),
    /** Whether price protection is enabled on this order. */
    pP: z.boolean().optional(),
    /** Self-Trade Prevention (STP) mode (2026-03-11). */
    V: z.union([z.number(), z.string()]).optional(),
    /** Price match mode. */
    pm: z.union([z.number(), z.string()]).optional(),
    /** GTD order auto-cancel time (epoch ms). Large values may arrive as strings (lossless parse). */
    gtd: z.union([z.number(), z.string()]).optional(),
    /** Expiry reason code (0 = none). */
    er: z.union([z.number(), z.string()]).optional(),
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
 * `ACCOUNT_CONFIG_UPDATE` — leverage change (`ac`) or multi-assets mode
 * change (`ai`). Binance pushes exactly one of the two payloads.
 */
export const UserDataAccountConfigUpdateSchema = z
  .object({
    e: z.literal('ACCOUNT_CONFIG_UPDATE'),
    E: z.number(),
    T: z.number().optional(),
    ac: z
      .object({
        s: z.string(),
        l: z.union([z.number(), z.string()]),
      })
      .optional(),
    ai: z
      .object({
        j: z.boolean(),
      })
      .optional(),
  })
  .refine((frame) => frame.ac !== undefined || frame.ai !== undefined, {
    message: 'ACCOUNT_CONFIG_UPDATE must carry ac (leverage) or ai (multi-assets mode)',
  });
export type UserDataAccountConfigUpdate = z.infer<typeof UserDataAccountConfigUpdateSchema>;

/** `listenKeyExpired` — pushed when the stream's listen key has expired. */
export const ListenKeyExpiredSchema = z.object({
  e: z.literal('listenKeyExpired'),
  E: z.number(),
  listenKey: z.string(),
});
export type ListenKeyExpired = z.infer<typeof ListenKeyExpiredSchema>;

/**
 * Unknown-but-typed event passthrough: a frame whose `e` is a string this SDK
 * does not model (e.g. `ALGO_UPDATE`, `STRATEGY_UPDATE`, `GRID_UPDATE`,
 * `CONDITIONAL_ORDER_TRIGGER_REJECT`, `TRADE_LITE`, or any future event)
 * validates as an unknown event instead of throwing, so a new upstream event
 * can never crash the stream processor. The full raw frame is preserved.
 */
export const UserDataUnknownEventSchema = z
  .object({
    e: z.string().min(1),
    E: z.number().optional(),
  })
  .passthrough();
export type UserDataUnknownEvent = z.infer<typeof UserDataUnknownEventSchema>;

export type UserDataEvent =
  | UserDataAccountUpdate
  | UserDataOrderTradeUpdate
  | UserDataMarginCall
  | UserDataAccountConfigUpdate
  | ListenKeyExpired
  | UserDataUnknownEvent;

/**
 * Parse one user-data frame. Known event types validate against their strict
 * schema; any other frame with a string `e` is returned as a {@link
 * UserDataUnknownEvent} (safe unknown-event policy — see v3.5.1 release
 * notes). Frames without an `e` field are not user-data events and still
 * throw, so callers can surface genuine protocol errors.
 */
export function parseUserDataEvent(raw: unknown): UserDataEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid user-data payload');
  }
  const eventType = (raw as { e?: string }).e;
  if (eventType === 'ACCOUNT_UPDATE') return UserDataAccountUpdateSchema.parse(raw);
  if (eventType === 'ORDER_TRADE_UPDATE') return UserDataOrderTradeUpdateSchema.parse(raw);
  if (eventType === 'MARGIN_CALL') return UserDataMarginCallSchema.parse(raw);
  if (eventType === 'ACCOUNT_CONFIG_UPDATE') return UserDataAccountConfigUpdateSchema.parse(raw);
  if (eventType === 'listenKeyExpired') return ListenKeyExpiredSchema.parse(raw);
  if (typeof eventType === 'string' && eventType !== '') {
    return UserDataUnknownEventSchema.parse(raw);
  }
  throw new Error('Invalid user-data payload: missing event type');
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
