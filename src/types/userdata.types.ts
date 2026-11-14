import { z } from 'zod';
import { parseFixed } from '../core/fixedpoint.js';

/**
 * Exact decimal string as Binance sends it (e.g. "0.00100000"). Prices, quantities,
 * balances, and PnL stay strings end to end. They are never parsed to a binary
 * float, so no rounding drift can reach a tick/step check.
 */
export type DecimalString = string;

/** Rejects anything `parseFixed` cannot represent exactly. */
export const DecimalStringSchema = z.string().refine(
  (value) => {
    try {
      parseFixed(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'expected an exact decimal string' },
);

/**
 * Optional decimal fields. An empty string means "no value" and is normalized to
 * "0". The previous `Number("")` conversion also produced 0, so this keeps the
 * semantics without accepting arbitrary text.
 */
const OptionalDecimalSchema = z
  .union([z.literal(''), DecimalStringSchema])
  .transform((value) => (value === '' ? '0' : value));

export const ListenKeySchema = z.object({
  listenKey: z.string(),
});
export type ListenKey = z.infer<typeof ListenKeySchema>;

export const UserDataAccountUpdateSchema = z.object({
  e: z.literal('ACCOUNT_UPDATE'),
  E: z.number(),
  T: z.number(),
  a: z.object({
    /**
     * Event reason type (e.g. ORDER, FUNDING_FEE). This is a string, not a number.
     * The previous `transform(Number)` turned every real reason into NaN.
     */
    m: z.string(),
    B: z.array(
      z.object({
        a: z.string(),
        wb: DecimalStringSchema,
        cw: DecimalStringSchema,
        bc: DecimalStringSchema,
      }),
    ),
    P: z.array(
      z.object({
        s: z.string(),
        pa: DecimalStringSchema,
        ep: DecimalStringSchema,
        /** Breakeven price (added to the event contract by Binance; optional for older frames). */
        bep: OptionalDecimalSchema.optional(),
        cr: DecimalStringSchema,
        up: DecimalStringSchema,
        mt: z.string(),
        iw: OptionalDecimalSchema.optional(),
        ps: z.string(),
      }),
    ),
  }),
  /** Symbol associated with FUNDING_FEE balance events, when present. */
  S: z.string().optional(),
});
export type UserDataAccountUpdate = z.infer<typeof UserDataAccountUpdateSchema>;

/**
 * Price-match modes (`pm`). Verified against Binance's common-definition enum
 * (`priceMatch`). `(string & {})` keeps unknown future values parseable.
 */
export const PRICE_MATCH_MODES = [
  'NONE',
  'OPPONENT',
  'OPPONENT_5',
  'OPPONENT_10',
  'OPPONENT_20',
  'QUEUE',
  'QUEUE_5',
  'QUEUE_10',
  'QUEUE_20',
] as const;
export type PriceMatchMode = (typeof PRICE_MATCH_MODES)[number] | (string & {});

/**
 * Time-in-force (`o.f`). Verified against Binance's common-definition enum, which
 * includes RPI (retail price improvement, post-only, matched only with APP/Web orders).
 */
export const ORDER_TIME_IN_FORCE = ['GTC', 'IOC', 'FOK', 'GTX', 'GTD', 'RPI'] as const;
export type OrderTimeInForce = (typeof ORDER_TIME_IN_FORCE)[number] | (string & {});

/**
 * Order expiry reason (`o.er`), codes 0–9. Verified against the Binance
 * ORDER_TRADE_UPDATE "Expiry Reason" list. Names are SDK labels that describe
 * each code; Binance sends only the numeric code. Codes outside this table
 * are reported as `UNKNOWN` by {@link formatOrderExpiryReason}.
 */
export const ORDER_EXPIRY_REASONS = {
  0: { name: 'NONE', description: 'None, the default value' },
  1: {
    name: 'STP_CANCEL',
    description: 'Order expired to prevent the user from trading against themselves (STP)',
  },
  2: {
    name: 'IOC_UNFILLED_CANCEL',
    description: 'IOC order could not be filled completely; remaining quantity canceled',
  },
  3: {
    name: 'IOC_STP_CANCEL',
    description: 'IOC order could not be filled completely to prevent self-trade; unfilled balance canceled',
  },
  4: {
    name: 'REDUCE_ONLY_KNOCKOUT',
    description: 'Canceled: knocked out by another higher-priority reduce-only (market) order, or the fill would flip the position',
  },
  5: { name: 'LIQUIDATION_CANCEL', description: 'Order expired when the account was liquidated' },
  6: { name: 'GTE_UNSATISFIED', description: 'Order expired as the GTE condition was not satisfied' },
  7: { name: 'SYMBOL_DELISTED', description: 'Order canceled because the symbol was delisted' },
  8: {
    name: 'STOP_INITIAL_EXPIRED',
    description: 'The initial order expired after the stop order was triggered',
  },
  9: {
    name: 'MARKET_LIQUIDITY_EXHAUSTED',
    description: 'Market order could not be filled completely; remaining quantity canceled',
  },
} as const;

export type OrderExpiryReasonCode = keyof typeof ORDER_EXPIRY_REASONS;

/**
 * Diagnostic label for an expiry code, e.g. `"4 REDUCE_ONLY_KNOCKOUT: Canceled: …"`.
 * Unknown codes return `"UNKNOWN(<code>)"` so that new upstream codes stay visible
 * in logs instead of being dropped.
 */
export function formatOrderExpiryReason(code: number): string {
  if (Object.prototype.hasOwnProperty.call(ORDER_EXPIRY_REASONS, code)) {
    const entry = ORDER_EXPIRY_REASONS[code as OrderExpiryReasonCode];
    return `${code} ${entry.name}: ${entry.description}`;
  }
  return `UNKNOWN(${code})`;
}

/**
 * Execution type (`o.x`). Verified: NEW, CANCELED, CALCULATED (liquidation
 * execution), EXPIRED, TRADE, AMENDMENT (order modified). `(string & {})` keeps
 * unknown future values parseable.
 */
export const ORDER_EXECUTION_TYPES = ['NEW', 'CANCELED', 'CALCULATED', 'EXPIRED', 'TRADE', 'AMENDMENT'] as const;
export type OrderExecutionType = (typeof ORDER_EXECUTION_TYPES)[number] | (string & {});

/**
 * Origin of an order, derived from its client order id prefix. Only the two
 * prefixes documented by Binance are recognized. Other exchange-generated ids
 * are reported as `OTHER`, not guessed.
 */
export type ClientOrderOrigin = 'LIQUIDATION' | 'ADL' | 'OTHER';

export function classifyClientOrderOrigin(clientOrderId: string): ClientOrderOrigin {
  if (clientOrderId.startsWith('autoclose-')) return 'LIQUIDATION';
  if (clientOrderId.startsWith('adl_autoclose')) return 'ADL';
  return 'OTHER';
}

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
    f: z.string().transform((value) => value as OrderTimeInForce),
    q: DecimalStringSchema,
    p: DecimalStringSchema,
    ap: DecimalStringSchema,
    sp: DecimalStringSchema,
    x: z.string().transform((value) => value as OrderExecutionType),
    X: z.string(),
    l: DecimalStringSchema,
    z: DecimalStringSchema,
    L: DecimalStringSchema,
    n: DecimalStringSchema,
    N: z.string(),
    T: z.number(),
    t: z.number(),
    b: DecimalStringSchema,
    a: DecimalStringSchema,
    m: z.boolean(),
    R: z.boolean(),
    wt: z.string(),
    ot: z.string(),
    ps: z.string(),
    cp: z.boolean().optional(),
    AP: OptionalDecimalSchema.optional(),
    cr: OptionalDecimalSchema.optional(),
    rp: OptionalDecimalSchema.optional(),
    /** modifyId — only pushed for AMENDMENT events when the modify request carried one (2026-07-21). */
    M: z.union([z.number(), z.string()]).optional(),
    /** Whether price protection is enabled on this order. */
    pP: z.boolean().optional(),
    /** Self-Trade Prevention (STP) mode (2026-03-11). */
    V: z.union([z.number(), z.string()]).optional(),
    /** Price match mode (see {@link PriceMatchMode}). */
    pm: z
      .string()
      .transform((value) => value as PriceMatchMode)
      .optional(),
    /** GTD order auto-cancel time (epoch ms). Large values may arrive as strings (lossless parse). */
    gtd: z.union([z.number(), z.string()]).optional(),
    /**
     * Expiry reason code (0–9, see {@link ORDER_EXPIRY_REASONS}). Normalized to a
     * number; a non-numeric value fails the frame instead of being guessed.
     */
    er: z
      .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)])
      .optional(),
  }),
});
export type UserDataOrderTradeUpdate = z.infer<typeof UserDataOrderTradeUpdateSchema>;

export const UserDataMarginCallSchema = z.object({
  e: z.literal('MARGIN_CALL'),
  E: z.number(),
  cw: DecimalStringSchema,
  p: z.array(
    z.object({
      s: z.string(),
      ps: z.string(),
      pa: DecimalStringSchema,
      mt: z.string(),
      iw: DecimalStringSchema,
      mp: DecimalStringSchema,
      up: DecimalStringSchema,
      mm: DecimalStringSchema,
    }),
  ),
});
export type UserDataMarginCall = z.infer<typeof UserDataMarginCallSchema>;

/**
 * `ACCOUNT_CONFIG_UPDATE` — leverage change (`ac`) or multi-assets mode
 * change (`ai`). Binance pushes exactly one of the two payloads. Leverage is an
 * integer multiplier, not a price, so it stays numeric.
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
 * The event object delivered for event name `T`. Modelled names resolve to
 * their strict type. Any other name resolves to {@link UserDataUnknownEvent}.
 */
export type UserDataEventOf<T extends string> = Extract<UserDataEvent, { e: T }> extends never
  ? UserDataUnknownEvent
  : Extract<UserDataEvent, { e: T }>;

/** Typed handler for {@link UserDataEventOf}. */
export type UserDataEventHandler<T extends string> = (event: UserDataEventOf<T>) => void;

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
