import { z } from 'zod';

/**
 * Zod schemas for the Binance Options product. These cover the documented
 * response shapes for `/eapi/v1/*` endpoints. Schemas are `.loose()` so
 * Binance adding a new field does not break parsing — callers opt into
 * strictness by parsing with the array/object schema directly.
 *
 * Decimal-string fields (prices/quantities) are transformed to `number`
 * for ergonomics, mirroring the existing Futures schemas. Callers needing
 * exact precision can use the raw `unknown` return path on each resource.
 */

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

export const OptionsPingSchema = z.object({}).loose();
export type OptionsPing = z.infer<typeof OptionsPingSchema>;

export const OptionsServerTimeSchema = z.object({
  serverTime: z.number(),
  timezone: z.string().optional(),
}).loose();
export type OptionsServerTime = z.infer<typeof OptionsServerTimeSchema>;

export const OptionsRateLimitSchema = z.object({
  rateLimitType: z.string(),
  interval: z.string(),
  intervalNum: z.number(),
  limit: z.number(),
}).loose();
export type OptionsRateLimit = z.infer<typeof OptionsRateLimitSchema>;

export const OptionsFilterSchema = z.object({
  filterType: z.string(),
}).loose();
export type OptionsFilter = z.infer<typeof OptionsFilterSchema>;

export const OptionsSymbolSchema = z.object({
  symbol: z.string(),
  underlying: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  strikePrice: z.string().transform(Number),
  expiryDate: z.number(),
  strikePricePrecision: z.number().optional(),
  exerciseStyle: z.string().optional(),
  contractType: z.string().optional(),
  contractSize: z.number().optional(),
  pricePrecision: z.number().optional(),
  quantityPrecision: z.number().optional(),
  quoteAssetPrecision: z.number().optional(),
  underlyingAssetPrecision: z.number().optional(),
  filters: z.array(OptionsFilterSchema).optional(),
  status: z.string().optional(),
}).loose();
export type OptionsSymbol = z.infer<typeof OptionsSymbolSchema>;

export const OptionsExchangeInfoSchema = z.object({
  timezone: z.string(),
  serverTime: z.number(),
  optionSymbols: z.array(OptionsSymbolSchema),
  rateLimits: z.array(OptionsRateLimitSchema).optional(),
}).loose();
export type OptionsExchangeInfo = z.infer<typeof OptionsExchangeInfoSchema>;

export const OptionsDepthLevelSchema = z.tuple([z.string(), z.string()]);
export type OptionsDepthLevel = z.infer<typeof OptionsDepthLevelSchema>;

export const OptionsDepthSchema = z.object({
  symbol: z.string(),
  bids: z.array(OptionsDepthLevelSchema),
  asks: z.array(OptionsDepthLevelSchema),
  updateId: z.number().optional(),
  lastUpdateId: z.number().optional(),
  T: z.number().optional(),
}).loose();
export type OptionsDepth = z.infer<typeof OptionsDepthSchema>;

export const OptionsTradeSchema = z.object({
  id: z.number(),
  symbol: z.string(),
  price: z.string().transform(Number),
  qty: z.string().transform(Number),
  side: z.string(),
  timestamp: z.number(),
  isBuyerMaker: z.boolean().optional(),
}).loose();
export type OptionsTrade = z.infer<typeof OptionsTradeSchema>;
export const OptionsTradesResponseSchema = z.array(OptionsTradeSchema);

export type OptionsKline = [number, string, string, string, string, string, number, string] | [number, string, string, string, string, string, number, string, number];
export const OptionsKlinesResponseSchema = z.array(
  z.union([
    z.tuple([
      z.number(), // open time
      z.string(), // open
      z.string(), // high
      z.string(), // low
      z.string(), // close
      z.string(), // volume
      z.number(), // close time
      z.string(), // quote asset volume
    ]),
    z.tuple([
      z.number(), // open time
      z.string(), // open
      z.string(), // high
      z.string(), // low
      z.string(), // close
      z.string(), // volume
      z.number(), // close time
      z.string(), // quote asset volume
      z.number(), // trade count
    ]),
  ]),
);

export const OptionsMarkSchema = z.object({
  symbol: z.string(),
  markPrice: z.string().transform(Number),
  bidPrice: z.string().transform(Number).optional(),
  askPrice: z.string().transform(Number).optional(),
  bidQty: z.string().transform(Number).optional(),
  askQty: z.string().transform(Number).optional(),
  lastPrice: z.string().transform(Number).optional(),
  time: z.number().optional(),
}).loose();
export type OptionsMark = z.infer<typeof OptionsMarkSchema>;
export const OptionsMarkResponseSchema = z.array(OptionsMarkSchema);

export const OptionsIndexSchema = z.object({
  underlying: z.string(),
  indexPrice: z.string().transform(Number),
  time: z.number(),
}).loose();
export type OptionsIndex = z.infer<typeof OptionsIndexSchema>;
export const OptionsIndexResponseSchema = z.array(OptionsIndexSchema);

export const OptionsTickerSchema = z.object({
  symbol: z.string(),
  priceChange: z.string().transform(Number),
  priceChangePercent: z.string().transform(Number),
  lastPrice: z.string().transform(Number),
  lastQty: z.string().transform(Number),
  open: z.string().transform(Number),
  high: z.string().transform(Number),
  low: z.string().transform(Number),
  volume: z.string().transform(Number),
  amount: z.string().transform(Number),
  openTime: z.number(),
  closeTime: z.number(),
  firstTradeId: z.number().optional(),
  tradeCount: z.number().optional(),
}).loose();
export type OptionsTicker = z.infer<typeof OptionsTickerSchema>;
export const OptionsTickerResponseSchema = z.array(OptionsTickerSchema);

export const OptionsOpenInterestSchema = z.object({
  symbol: z.string(),
  openInterest: z.string().transform(Number),
  openInterestUsd: z.string().transform(Number).optional(),
  time: z.number(),
}).loose();
export type OptionsOpenInterest = z.infer<typeof OptionsOpenInterestSchema>;
export const OptionsOpenInterestResponseSchema = z.array(OptionsOpenInterestSchema);

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export const OptionsMarginAssetSchema = z.object({
  asset: z.string(),
  marginBalance: z.string().transform(Number),
  availableBalance: z.string().transform(Number),
}).loose();
export type OptionsMarginAsset = z.infer<typeof OptionsMarginAssetSchema>;

export const OptionsMarginAccountSchema = z.object({
  underlying: z.string(),
  marginAsset: z.array(OptionsMarginAssetSchema).optional(),
  time: z.number().optional(),
}).loose();
export type OptionsMarginAccount = z.infer<typeof OptionsMarginAccountSchema>;

export const OptionsBillSchema = z.object({
  id: z.number(),
  asset: z.string(),
  amount: z.string().transform(Number),
  type: z.string(),
  time: z.number(),
  status: z.string().optional(),
}).loose();
export type OptionsBill = z.infer<typeof OptionsBillSchema>;
export const OptionsBillResponseSchema = z.array(OptionsBillSchema);

export const OptionsPositionSchema = z.object({
  symbol: z.string(),
  qty: z.string().transform(Number),
  baseValue: z.string().transform(Number),
  quoteValue: z.string().transform(Number),
  markPrice: z.string().transform(Number),
  positionCost: z.string().transform(Number),
  strikePrice: z.string().transform(Number).optional(),
  expiryDate: z.number().optional(),
  side: z.string(),
  pnl: z.string().transform(Number).optional(),
  time: z.number().optional(),
}).loose();
export type OptionsPosition = z.infer<typeof OptionsPositionSchema>;
export const OptionsPositionResponseSchema = z.array(OptionsPositionSchema);

export const OptionsUserTradeSchema = z.object({
  id: z.number(),
  tradeId: z.string().optional(),
  orderId: z.string(),
  symbol: z.string(),
  price: z.string().transform(Number),
  qty: z.string().transform(Number),
  fee: z.string().transform(Number),
  feeAsset: z.string(),
  side: z.string(),
  isBuyerMaker: z.boolean().optional(),
  time: z.number(),
}).loose();
export type OptionsUserTrade = z.infer<typeof OptionsUserTradeSchema>;
export const OptionsUserTradesResponseSchema = z.array(OptionsUserTradeSchema);

export const OptionsCommissionSchema = z.object({
  symbol: z.string(),
  makerCommissionRate: z.string().transform(Number),
  takerCommissionRate: z.string().transform(Number),
}).loose();
export type OptionsCommission = z.infer<typeof OptionsCommissionSchema>;

export const OptionsExerciseRecordSchema = z.object({
  symbol: z.string(),
  strikePrice: z.string().transform(Number),
  expiryDate: z.number(),
  strikeResult: z.string(),
  qty: z.string().transform(Number).optional(),
  settleAsset: z.string().optional(),
  settlePrice: z.string().transform(Number).optional(),
  time: z.number().optional(),
}).loose();
export type OptionsExerciseRecord = z.infer<typeof OptionsExerciseRecordSchema>;
export const OptionsExerciseRecordResponseSchema = z.array(OptionsExerciseRecordSchema);

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

export const OptionsOrderSchema = z.object({
  orderId: z.string(),
  symbol: z.string(),
  side: z.string(),
  type: z.string().optional(),
  price: z.string().transform(Number).optional(),
  qty: z.string().transform(Number).optional(),
  executedQty: z.string().transform(Number).optional(),
  avgPrice: z.string().transform(Number).optional(),
  status: z.string(),
  clientOrderId: z.string().optional(),
  time: z.number().optional(),
  updateTime: z.number().optional(),
  reduceOnly: z.boolean().optional(),
  postOnly: z.boolean().optional(),
}).loose();
export type OptionsOrder = z.infer<typeof OptionsOrderSchema>;
export const OptionsOrderResponseSchema = OptionsOrderSchema;
export const OptionsOrdersResponseSchema = z.array(OptionsOrderSchema);

export const OptionsBatchOrderResultSchema = z.object({
  orderId: z.string().optional(),
  clientOrderId: z.string().optional(),
  status: z.string().optional(),
  errorCode: z.number().optional(),
  errorMsg: z.string().optional(),
}).loose();
export type OptionsBatchOrderResult = z.infer<typeof OptionsBatchOrderResultSchema>;
export const OptionsBatchOrdersResponseSchema = z.array(OptionsBatchOrderResultSchema);

export const OptionsCountdownCancelSchema = z.object({
  symbol: z.string(),
  countdownTime: z.number(),
}).loose();
export type OptionsCountdownCancel = z.infer<typeof OptionsCountdownCancelSchema>;

// ---------------------------------------------------------------------------
// MMP
// ---------------------------------------------------------------------------

export const OptionsMmpSchema = z.object({
  uid: z.string(),
  underlying: z.string().optional(),
  windowTimeInMilliseconds: z.number().optional(),
  frozenTimeInMilliseconds: z.number().optional(),
  qtyLimit: z.number().optional(),
  deltaLimit: z.number().optional(),
  triggerLimit: z.number().optional(),
}).loose();
export type OptionsMmp = z.infer<typeof OptionsMmpSchema>;

// ---------------------------------------------------------------------------
// Block trading
// ---------------------------------------------------------------------------

export const OptionsBlockOrderSchema = z.object({
  blockOrderId: z.string(),
  symbol: z.string(),
  side: z.string(),
  price: z.string().transform(Number).optional(),
  qty: z.string().transform(Number).optional(),
  status: z.string(),
  expireTime: z.number().optional(),
  createTime: z.number().optional(),
  legs: z.array(OptionsOrderSchema).optional(),
}).loose();
export type OptionsBlockOrder = z.infer<typeof OptionsBlockOrderSchema>;
export const OptionsBlockOrdersResponseSchema = z.array(OptionsBlockOrderSchema);

export const OptionsBlockTradeSchema = z.object({
  blockTradeId: z.string(),
  symbol: z.string(),
  price: z.string().transform(Number),
  qty: z.string().transform(Number),
  side: z.string(),
  time: z.number(),
  isBuyerMaker: z.boolean().optional(),
}).loose();
export type OptionsBlockTrade = z.infer<typeof OptionsBlockTradeSchema>;
export const OptionsBlockTradesResponseSchema = z.array(OptionsBlockTradeSchema);

// ---------------------------------------------------------------------------
// User data stream
// ---------------------------------------------------------------------------

export const OptionsListenKeySchema = z.object({ listenKey: z.string() });
export type OptionsListenKey = z.infer<typeof OptionsListenKeySchema>;
