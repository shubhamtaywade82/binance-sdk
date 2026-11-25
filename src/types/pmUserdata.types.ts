import { z } from 'zod';
import {
  DecimalStringSchema,
  UserDataUnknownEventSchema,
  type UserDataUnknownEvent,
} from './userdata.types.js';

/**
 * Portfolio Margin / Portfolio Margin Pro user-data event schemas.
 *
 * These events ride the PM user-data streams:
 *   - Portfolio Margin:     `wss://fstream.binance.com/pm/ws/<listenKey>` (listenKey via `POST /papi/v1/listenKey`)
 *   - Portfolio Margin Pro: `wss://fstream.binance.com/pm-classic/ws/<listenKey>` (listenKey via `POST /fapi/v1/listenKey`)
 *
 * Verification trail (all checked 2026-11-25):
 *   - `PM_PRO_ACCOUNT_UPDATE` — Binance change log 2026-04-17: "Add new event
 *     `PM_PRO_ACCOUNT_UPDATE`, which pushes account asset status every 5
 *     seconds." Field set per the community-typed schema (sieblyio/binance
 *     ws-events-raw.ts): `u` is the unified margin maintenance ratio (uniMMR)
 *     and `eq` the account equity; the remaining fields (`ae`, `im`, `mm`,
 *     `avb`, `vmw`) are raw protocol fields whose exact semantics are not yet
 *     documented, so they stay optional and pass through untouched.
 *   - `riskLevelChange` — the PM-Pro "Risk Level Change" event, pushed when
 *     the account's position risk (uniMMR) degrades. Risk levels verified
 *     from the PM-Pro user-data-streams page: NORMAL, MARGIN_CALL,
 *     REDUCE_ONLY, FORCE_LIQUIDATION (the classic PM page lists MARGIN_CALL,
 *     REDUCE_ONLY, FORCE_LIQUIDATION). This is the event the upstream audit
 *     refers to as the "uniMMR drop" notification; no event named
 *     `uniMMRDrop` exists in the current docs or change log.
 *   - `openOrderLoss` — breaking change per the change log 2026-11-17,
 *     effective 2026-11-23: the per-asset array `O: [{a, o}]` is replaced by
 *     a single string field `o` holding the aggregated account-level open
 *     order loss in USD. Checked every 5 seconds and pushed when the absolute
 *     value changes by more than 5% versus the last pushed value. The legacy
 *     `O` shape stays accepted for pre-migration frames.
 *   - `ALGO_UPDATE` — on Portfolio Margin the algo order payload rides the
 *     `ao` object, and per the change log 2026-08-07/2026-08-21 `ao.ia`
 *     (BOOLEAN) is the trailing-stop activation flag, `false` then `true`
 *     while the algo status stays `NEW`.
 *
 * Every schema in this module validates without dropping fields
 * (`.passthrough()`), so a strict parse is safe as a validation pass on the
 * raw frame.
 */

export const PM_RISK_LEVELS = ['NORMAL', 'MARGIN_CALL', 'REDUCE_ONLY', 'FORCE_LIQUIDATION'] as const;
export type PmRiskLevel = (typeof PM_RISK_LEVELS)[number] | (string & {});

/**
 * `PM_PRO_ACCOUNT_UPDATE` — pushed every 5 seconds with the account asset
 * status on the Portfolio Margin Pro stream. Decimal fields stay strings.
 */
export const PmProAccountUpdateSchema = z
  .object({
    e: z.literal('PM_PRO_ACCOUNT_UPDATE'),
    E: z.number(),
    /** Unified margin maintenance ratio (uniMMR). */
    u: DecimalStringSchema,
    /** Account equity. */
    eq: DecimalStringSchema,
    ae: DecimalStringSchema.optional(),
    im: DecimalStringSchema.optional(),
    mm: DecimalStringSchema.optional(),
    avb: DecimalStringSchema.optional(),
    vmw: DecimalStringSchema.optional(),
  })
  .passthrough();
export type PmProAccountUpdate = z.infer<typeof PmProAccountUpdateSchema>;

/**
 * `riskLevelChange` — risk-guidance push when the position risk ratio
 * (uniMMR) degrades; payload fields beyond `e` pass through unmodeled.
 */
export const RiskLevelChangeSchema = z
  .object({
    e: z.literal('riskLevelChange'),
    E: z.number().optional(),
    /** Risk level (see {@link PM_RISK_LEVELS}); field name per the official schema. */
    riskLevel: z.string().optional(),
  })
  .passthrough();
export type RiskLevelChange = z.infer<typeof RiskLevelChangeSchema>;

/**
 * `openOrderLoss` — account-level spot open order loss in USD. Since
 * 2026-11-23 the payload carries the aggregated loss in the single string
 * field `o`; frames before that date carry the per-asset array `O`.
 */
export const OpenOrderLossSchema = z
  .object({
    e: z.literal('openOrderLoss'),
    E: z.number().optional(),
    /** Aggregated account-level open order loss in USD (2026-11-23 payload shape). */
    o: DecimalStringSchema.optional(),
    /** Legacy per-asset array `[{a, o}]` — replaced by `o` on 2026-11-23. */
    O: z.array(z.object({ a: z.string(), o: DecimalStringSchema })).optional(),
  })
  .passthrough()
  .refine((frame) => frame.o !== undefined || frame.O !== undefined, {
    message: 'openOrderLoss must carry o (aggregated) or O (legacy per-asset array)',
  });
export type OpenOrderLoss = z.infer<typeof OpenOrderLossSchema>;

/**
 * `ALGO_UPDATE` (Portfolio Margin) — algo order update; the order payload
 * rides the `ao` object. Only the verified fields are strict (`ia` is the
 * trailing-stop activation flag); everything else passes through.
 */
export const PmAlgoUpdateSchema = z
  .object({
    e: z.literal('ALGO_UPDATE'),
    E: z.number(),
    ao: z
      .object({
        /**
         * Trailing-stop activation flag: `false` then `true` while the algo
         * status stays `NEW` (fully active since 2026-08-21).
         */
        ia: z.boolean().optional(),
      })
      .passthrough(),
  })
  .passthrough();
export type PmAlgoUpdate = z.infer<typeof PmAlgoUpdateSchema>;

export type PmUserEvent =
  | PmProAccountUpdate
  | RiskLevelChange
  | OpenOrderLoss
  | PmAlgoUpdate
  | UserDataUnknownEvent;

/** Event names this module models with a strict schema. */
export const PM_USER_EVENTS = [
  'PM_PRO_ACCOUNT_UPDATE',
  'riskLevelChange',
  'openOrderLoss',
  'ALGO_UPDATE',
] as const;

export type PmUserEventName = (typeof PM_USER_EVENTS)[number];

/** True when `name` is one of the PM user-data event types this SDK models. */
export function isKnownPmUserEvent(name: string): name is PmUserEventName {
  return (PM_USER_EVENTS as readonly string[]).includes(name);
}

/**
 * Parse one Portfolio Margin user-data frame. The four modeled event types
 * validate against their strict (passthrough) schemas; any other frame with
 * a string `e` is returned as a {@link UserDataUnknownEvent} — fields are
 * preserved, never stripped, so a new upstream event can never lose data or
 * crash the stream processor. Frames without an `e` field throw.
 */
export function parsePmUserEvent(raw: unknown): PmUserEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid Portfolio Margin user-data payload');
  }
  const eventType = (raw as { e?: string }).e;
  if (eventType === 'PM_PRO_ACCOUNT_UPDATE') return PmProAccountUpdateSchema.parse(raw);
  if (eventType === 'riskLevelChange') return RiskLevelChangeSchema.parse(raw);
  if (eventType === 'openOrderLoss') return OpenOrderLossSchema.parse(raw);
  if (eventType === 'ALGO_UPDATE') return PmAlgoUpdateSchema.parse(raw);
  if (typeof eventType === 'string' && eventType !== '') {
    return UserDataUnknownEventSchema.parse(raw);
  }
  throw new Error('Invalid Portfolio Margin user-data payload: missing event type');
}
