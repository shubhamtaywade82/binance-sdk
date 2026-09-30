import { z } from 'zod';

export const WsKlinePayloadSchema = z.object({
  e: z.literal('kline'),
  E: z.number(),
  s: z.string(),
  k: z.object({
    t: z.number(),
    T: z.number(),
    s: z.string(),
    i: z.string(),
    o: z.string().transform(Number),
    c: z.string().transform(Number),
    h: z.string().transform(Number),
    l: z.string().transform(Number),
    v: z.string().transform(Number),
    n: z.number(),
    x: z.boolean(),
    q: z.string().transform(Number),
    V: z.string().transform(Number),
    Q: z.string().transform(Number),
  }),
});
export type WsKlinePayload = z.infer<typeof WsKlinePayloadSchema>;

export const WsAggTradePayloadSchema = z.object({
  e: z.literal('aggTrade'),
  E: z.number(),
  s: z.string(),
  a: z.number(),
  p: z.string().transform(Number),
  q: z.string().transform(Number),
  f: z.number(),
  l: z.number(),
  T: z.number(),
  m: z.boolean(),
});
export type WsAggTradePayload = z.infer<typeof WsAggTradePayloadSchema>;

export const WsTradePayloadSchema = z.object({
  e: z.literal('trade'),
  E: z.number(),
  s: z.string(),
  t: z.number(),
  p: z.string().transform(Number),
  q: z.string().transform(Number),
  T: z.number(),
  m: z.boolean(),
});
export type WsTradePayload = z.infer<typeof WsTradePayloadSchema>;

export const WsDepthUpdatePayloadSchema = z.object({
  e: z.literal('depthUpdate'),
  E: z.number(),
  s: z.string(),
  U: z.number(),
  u: z.number(),
  T: z.number().optional(),
  pu: z.number().optional(),
  b: z.array(z.tuple([z.string(), z.string()])),
  a: z.array(z.tuple([z.string(), z.string()])),
});
export type WsDepthUpdatePayload = z.infer<typeof WsDepthUpdatePayloadSchema>;

export const WsTicker24hrPayloadSchema = z.object({
  e: z.literal('24hrTicker'),
  E: z.number(),
  s: z.string(),
  p: z.string().transform(Number),
  P: z.string().transform(Number),
  c: z.string().transform(Number),
  o: z.string().transform(Number),
  h: z.string().transform(Number),
  l: z.string().transform(Number),
  v: z.string().transform(Number),
  q: z.string().transform(Number),
});
export type WsTicker24hrPayload = z.infer<typeof WsTicker24hrPayloadSchema>;

export const WsBookTickerPayloadSchema = z.object({
  u: z.number(),
  s: z.string(),
  b: z.string().transform(Number),
  B: z.string().transform(Number),
  a: z.string().transform(Number),
  A: z.string().transform(Number),
});
export type WsBookTickerPayload = z.infer<typeof WsBookTickerPayloadSchema>;

export const WsMarkPricePayloadSchema = z.object({
  e: z.literal('markPriceUpdate'),
  E: z.number(),
  s: z.string(),
  p: z.string().transform(Number),
  i: z.string().transform(Number),
  P: z.string().transform(Number),
  r: z.string().transform(Number),
  T: z.number(),
});
export type WsMarkPricePayload = z.infer<typeof WsMarkPricePayloadSchema>;

export const WsMiniTickerPayloadSchema = z.object({
  e: z.literal('24hrMiniTicker'),
  E: z.number(),
  s: z.string(),
  c: z.string().transform(Number),
  o: z.string().transform(Number),
  h: z.string().transform(Number),
  l: z.string().transform(Number),
  v: z.string().transform(Number),
  q: z.string().transform(Number),
});
export type WsMiniTickerPayload = z.infer<typeof WsMiniTickerPayloadSchema>;

export const WsForceOrderPayloadSchema = z.object({
  e: z.literal('forceOrder'),
  E: z.number(),
  o: z.object({
    s: z.string(),
    S: z.string(),
    o: z.string(),
    f: z.string(),
    q: z.string().transform(Number),
    p: z.string().transform(Number),
    ap: z.string().transform(Number),
    X: z.string(),
    l: z.string().transform(Number),
    z: z.string().transform(Number),
    T: z.number(),
  }),
});
export type WsForceOrderPayload = z.infer<typeof WsForceOrderPayloadSchema>;

export const WsCompositeIndexPayloadSchema = z.object({
  e: z.literal('compositeIndex'),
  E: z.number(),
  s: z.string(),
  p: z.string().transform(Number),
  c: z.array(
    z.object({
      b: z.string(),
      q: z.string(),
      w: z.string().transform(Number),
      p: z.string().transform(Number),
    }),
  ),
});
export type WsCompositeIndexPayload = z.infer<typeof WsCompositeIndexPayloadSchema>;

export const WsAssetIndexPayloadSchema = z.object({
  e: z.literal('assetIndex'),
  E: z.number(),
  s: z.string(),
  i: z.string().transform(Number),
  b: z.string().transform(Number),
  a: z.string().transform(Number),
});
export type WsAssetIndexPayload = z.infer<typeof WsAssetIndexPayloadSchema>;

export const WsRollingWindowTickerPayloadSchema = z.object({
  e: z.enum(['1hTicker', '4hTicker', '1dTicker', '7dTicker', '30dTicker']),
  E: z.number(),
  s: z.string(),
  p: z.string().transform(Number),
  P: z.string().transform(Number),
  o: z.string().transform(Number),
  h: z.string().transform(Number),
  l: z.string().transform(Number),
  c: z.string().transform(Number),
  v: z.string().transform(Number),
  q: z.string().transform(Number),
  O: z.number(),
  C: z.number(),
});
export type WsRollingWindowTickerPayload = z.infer<typeof WsRollingWindowTickerPayloadSchema>;

export const WsSpotAvgPricePayloadSchema = z.object({
  e: z.literal('avgPrice'),
  E: z.number(),
  s: z.string(),
  i: z.string(),
  w: z.string().transform(Number),
  T: z.number(),
});
export type WsSpotAvgPricePayload = z.infer<typeof WsSpotAvgPricePayloadSchema>;

/**
 * RPI diff. book depth (`<symbol>@rpiDepth@500ms`). The event-type literal is
 * not pinned (Binance documents it as a plain string).
 */
export const WsRpiDepthUpdatePayloadSchema = z.object({
  e: z.string(),
  E: z.number(),
  T: z.number().optional(),
  s: z.string(),
  U: z.number(),
  u: z.number(),
  pu: z.number().optional(),
  b: z.array(z.tuple([z.string(), z.string()])),
  a: z.array(z.tuple([z.string(), z.string()])),
  ps: z.string().optional(),
});
export type WsRpiDepthUpdatePayload = z.infer<typeof WsRpiDepthUpdatePayloadSchema>;

/** `!contractInfo` — symbol/contract information updates (leverage bracket list in `bks`). */
export const WsContractInfoPayloadSchema = z.object({
  e: z.string(),
  E: z.number(),
  s: z.string(),
  ct: z.string().optional(),
  dt: z.number().optional(),
  ot: z.number().optional(),
  cs: z.string().optional(),
  bks: z
    .array(
      z.looseObject({
        bs: z.number().optional(),
        bnf: z.number().optional(),
        bnc: z.number().optional(),
        mmr: z.number().optional(),
        cf: z.number().optional(),
        mi: z.number().optional(),
        ma: z.number().optional(),
      }),
    )
    .optional(),
  st: z.number().optional(),
});
export type WsContractInfoPayload = z.infer<typeof WsContractInfoPayloadSchema>;

/** `tradingSession` — session transition events (`t`/`T` = start/end time, `S` = session). */
export const WsTradingSessionPayloadSchema = z.object({
  e: z.string(),
  E: z.number(),
  t: z.number().optional(),
  T: z.number().optional(),
  S: z.string().optional(),
});
export type WsTradingSessionPayload = z.infer<typeof WsTradingSessionPayloadSchema>;

export type WsStreamPayload =
  | WsKlinePayload
  | WsAggTradePayload
  | WsTradePayload
  | WsDepthUpdatePayload
  | WsTicker24hrPayload
  | WsBookTickerPayload
  | WsMarkPricePayload
  | WsMiniTickerPayload
  | WsForceOrderPayload
  | WsCompositeIndexPayload
  | WsAssetIndexPayload
  | WsRollingWindowTickerPayload
  | WsSpotAvgPricePayload
  | WsRpiDepthUpdatePayload
  | WsContractInfoPayload
  | WsTradingSessionPayload;

/**
 * Parse one combined-stream frame. All-market streams (`!…@arr`, `!bookTicker`)
 * are parsed element-wise when Binance delivers an array (`!markPrice@arr`,
 * `!ticker@arr`, `!miniTicker@arr`, `!assetIndex@arr`, …), so those return an
 * array of typed payloads.
 */
export function parseWsPayload(streamName: string, raw: unknown): WsStreamPayload | WsStreamPayload[] {
  if (Array.isArray(raw)) {
    const elementStream = allMarketElementStream(streamName);
    return raw.map((item) => parseSingleWsPayload(elementStream, item));
  }
  return parseSingleWsPayload(allMarketElementStream(streamName), raw);
}

/** `!markPrice@arr@1s` → `all@markPrice@1s`, `!bookTicker` → `all@bookTicker` (per-element stream key). */
function allMarketElementStream(streamName: string): string {
  if (!streamName.startsWith('!')) return streamName;
  return `all@${streamName.slice(1).replace('@arr', '')}`;
}

function parseSingleWsPayload(streamName: string, raw: unknown): WsStreamPayload {
  if (streamName === 'all@contractInfo') return WsContractInfoPayloadSchema.parse(raw);
  if (streamName === 'tradingSession') return WsTradingSessionPayloadSchema.parse(raw);
  if (streamName.includes('@rpiDepth')) return WsRpiDepthUpdatePayloadSchema.parse(raw);
  if (streamName.includes('@kline_')) return WsKlinePayloadSchema.parse(raw);
  if (streamName.includes('@continuousKline_') || streamName.includes('@indexPriceKline_') || streamName.includes('@markPriceKline_')) {
    return WsKlinePayloadSchema.parse(raw);
  }
  if (streamName.includes('@aggTrade')) return WsAggTradePayloadSchema.parse(raw);
  if (streamName.includes('@trade')) return WsTradePayloadSchema.parse(raw);
  if (streamName.includes('@depth')) return WsDepthUpdatePayloadSchema.parse(raw);
  if (streamName.includes('@bookTicker')) return WsBookTickerPayloadSchema.parse(raw);
  if (streamName.includes('@markPrice')) return WsMarkPricePayloadSchema.parse(raw);
  if (streamName.includes('@miniTicker')) return WsMiniTickerPayloadSchema.parse(raw);
  if (streamName.includes('@forceOrder')) return WsForceOrderPayloadSchema.parse(raw);
  if (streamName.includes('@compositeIndex')) return WsCompositeIndexPayloadSchema.parse(raw);
  if (streamName.includes('@assetIndex')) return WsAssetIndexPayloadSchema.parse(raw);
  if (streamName.includes('@avgPrice')) return WsSpotAvgPricePayloadSchema.parse(raw);
  if (streamName.includes('@ticker_')) return WsRollingWindowTickerPayloadSchema.parse(raw);
  if (streamName.includes('@ticker')) return WsTicker24hrPayloadSchema.parse(raw);
  throw new Error(`Unknown WS stream type: ${streamName}`);
}
