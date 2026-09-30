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

/**
 * Aggregate mark-price stream payload. `!markPrice@arr` and `!markPrice@arr@1s`
 * deliver an array of {@link WsMarkPricePayload}-shaped entries rather than a
 * single object — the schema wraps that array so `parseWsPayload` can pick it
 * up for both stream names.
 */
export const WsMarkPriceArrayPayloadSchema = z.array(WsMarkPricePayloadSchema);
export type WsMarkPriceArrayPayload = z.infer<typeof WsMarkPriceArrayPayloadSchema>;

/**
 * Contract-info stream payload. Binance emits this on symbol
 * listing/delisting and on contract parameter changes (leverage bracket,
 * price/quantity precision, lot size filter). The `s` field is absent on
 * platform-wide events.
 *
 * Stream name: `!contractInfo`
 */
export const WsContractInfoPayloadSchema = z.object({
  e: z.literal('contractInfo'),
  E: z.number(),
  s: z.string().optional(),
  pi: z.string().optional(),
  ps: z.string().optional(),
  params: z
    .array(
      z.object({
        symbol: z.string().optional(),
        pair: z.string().optional(),
        contractType: z.string().optional(),
        contractStatus: z.string().optional(),
        contractSize: z.number().optional(),
        marginAsset: z.string().optional(),
        pricePrecision: z.number().optional(),
        quantityPrecision: z.number().optional(),
        baseAsset: z.string().optional(),
        quoteAsset: z.string().optional(),
        onboardDate: z.number().optional(),
      }),
    )
    .optional(),
});
export type WsContractInfoPayload = z.infer<typeof WsContractInfoPayloadSchema>;

/**
 * RPI (Retail Price Improvement) order-book depth diff stream payload.
 * Same shape as the standard diff depth update (`WsDepthUpdatePayload`) but
 * routed under a separate stream name with a 500ms cadence.
 *
 * Stream name: `<symbol>@rpiDepth@500ms`
 */
export const WsRpiDepthPayloadSchema = z.object({
  e: z.literal('rpiDepthUpdate'),
  E: z.number(),
  s: z.string(),
  U: z.number(),
  u: z.number(),
  T: z.number().optional(),
  pu: z.number().optional(),
  b: z.array(z.tuple([z.string(), z.string()])),
  a: z.array(z.tuple([z.string(), z.string()])),
});
export type WsRpiDepthPayload = z.infer<typeof WsRpiDepthPayloadSchema>;

/**
 * Trading-session stream payload. Binance introduced this alongside the
 * `/fapi/v1/tradingSchedule` REST endpoint in December 2025. The stream
 * emits platform-wide session phase transitions (open, close, pre-market,
 * post-market). No symbol prefix.
 *
 * Stream name: `tradingSession`
 */
export const WsTradingSessionPayloadSchema = z.object({
  e: z.literal('tradingSession'),
  E: z.number(),
  phase: z.enum(['OPEN', 'CLOSED', 'PRE_MARKET', 'POST_MARKET', 'HALF_DAY', 'OTHER']),
  openTime: z.number().optional(),
  closeTime: z.number().optional(),
  session: z.string().optional(),
});
export type WsTradingSessionPayload = z.infer<typeof WsTradingSessionPayloadSchema>;

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

export type WsStreamPayload =
  | WsKlinePayload
  | WsAggTradePayload
  | WsTradePayload
  | WsDepthUpdatePayload
  | WsTicker24hrPayload
  | WsBookTickerPayload
  | WsMarkPricePayload
  | WsMarkPriceArrayPayload
  | WsMiniTickerPayload
  | WsForceOrderPayload
  | WsCompositeIndexPayload
  | WsAssetIndexPayload
  | WsContractInfoPayload
  | WsRpiDepthPayload
  | WsTradingSessionPayload
  | WsRollingWindowTickerPayload
  | WsSpotAvgPricePayload;

export function parseWsPayload(streamName: string, raw: unknown): WsStreamPayload {
  if (streamName.includes('@kline_')) return WsKlinePayloadSchema.parse(raw);
  if (streamName.includes('@continuousKline_') || streamName.includes('@indexPriceKline_') || streamName.includes('@markPriceKline_')) {
    return WsKlinePayloadSchema.parse(raw);
  }
  if (streamName.includes('@aggTrade')) return WsAggTradePayloadSchema.parse(raw);
  if (streamName.includes('@trade')) return WsTradePayloadSchema.parse(raw);
  if (streamName.includes('@rpiDepth')) return WsRpiDepthPayloadSchema.parse(raw);
  if (streamName.includes('@depth')) return WsDepthUpdatePayloadSchema.parse(raw);
  if (streamName.includes('@bookTicker')) return WsBookTickerPayloadSchema.parse(raw);
  // Aggregate mark-price array streams (`!markPrice@arr` and `!markPrice@arr@1s`)
  // deliver an array payload; per-symbol `@markPrice` is a single object.
  if (streamName.startsWith('!markPrice@arr')) return WsMarkPriceArrayPayloadSchema.parse(raw);
  if (streamName.includes('@markPrice')) return WsMarkPricePayloadSchema.parse(raw);
  if (streamName.includes('@miniTicker')) return WsMiniTickerPayloadSchema.parse(raw);
  if (streamName.includes('@forceOrder')) return WsForceOrderPayloadSchema.parse(raw);
  if (streamName.includes('@compositeIndex')) return WsCompositeIndexPayloadSchema.parse(raw);
  if (streamName.includes('@assetIndex')) return WsAssetIndexPayloadSchema.parse(raw);
  if (streamName === '!contractInfo' || streamName.startsWith('!contractInfo')) {
    return WsContractInfoPayloadSchema.parse(raw);
  }
  if (streamName === 'tradingSession' || streamName.startsWith('tradingSession')) {
    return WsTradingSessionPayloadSchema.parse(raw);
  }
  if (streamName.includes('@avgPrice')) return WsSpotAvgPricePayloadSchema.parse(raw);
  if (streamName.includes('@ticker_')) return WsRollingWindowTickerPayloadSchema.parse(raw);
  if (streamName.includes('@ticker')) return WsTicker24hrPayloadSchema.parse(raw);
  throw new Error(`Unknown WS stream type: ${streamName}`);
}
