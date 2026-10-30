import { z } from 'zod';

export const OrderSchema = z.object({
  orderId: z.number(),
  symbol: z.string(),
  status: z.string(),
  clientOrderId: z.string(),
  price: z.string().transform(Number),
  avgPrice: z.string().transform(Number),
  origQty: z.string().transform(Number),
  executedQty: z.string().transform(Number),
  cumQuote: z.string().transform(Number),
  type: z.string(),
  reduceOnly: z.boolean(),
  side: z.string(),
  positionSide: z.string(),
  stopPrice: z.string().transform(Number).optional(),
  closePosition: z.boolean().optional(),
  timeInForce: z.string().optional(),
  origType: z.string().optional(),
  time: z.number(),
  updateTime: z.number(),
  workingType: z.string().optional(),
  priceProtect: z.boolean().optional(),
});
export type Order = z.infer<typeof OrderSchema>;
export const OrderResponseSchema = OrderSchema;
export const OrdersResponseSchema = z.array(OrderSchema);

export const CreateOrderParamsSchema = z.object({
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  type: z.string(),
  quantity: z.union([z.string(), z.number()]).optional(),
  price: z.union([z.string(), z.number()]).optional(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'GTX', 'GTD']).optional(),
  stopPrice: z.union([z.string(), z.number()]).optional(),
  reduceOnly: z.boolean().optional(),
  positionSide: z.enum(['BOTH', 'LONG', 'SHORT']).optional(),
  newClientOrderId: z.string().optional(),
  closePosition: z.boolean().optional(),
  newOrderRespType: z.enum(['ACK', 'RESULT']).optional(),
  priceProtect: z.boolean().optional(),
  workingType: z.enum(['MARK_PRICE', 'CONTRACT_PRICE']).optional(),
  callbackRate: z.union([z.string(), z.number()]).optional(),
  activationPrice: z.union([z.string(), z.number()]).optional(),
  selfTradePreventionMode: z.enum(['NONE', 'EXPIRE_TAKER', 'EXPIRE_MAKER', 'EXPIRE_BOTH']).optional(),
  goodTillDate: z.number().optional(),
});
export type CreateOrderParams = z.infer<typeof CreateOrderParamsSchema>;

export const ModifyOrderParamsSchema = CreateOrderParamsSchema.extend({
  orderId: z.number().optional(),
  origClientOrderId: z.string().optional(),
  origType: z.string().optional(),
});
export type ModifyOrderParams = z.infer<typeof ModifyOrderParamsSchema>;

export const AlgoOrderSchema = z.object({
  algoId: z.number(),
  symbol: z.string(),
  side: z.string(),
  positionSide: z.string(),
  totalQty: z.string().transform(Number).optional(),
  executedQty: z.string().transform(Number).optional(),
  executedAmt: z.string().transform(Number).optional(),
  avgPrice: z.string().transform(Number).optional(),
  clientAlgoId: z.string().optional(),
  bookTime: z.number().optional(),
  endTime: z.number().optional(),
  algoStatus: z.string().optional(),
  algoType: z.string().optional(),
  urgency: z.string().optional(),
});
export type AlgoOrder = z.infer<typeof AlgoOrderSchema>;
export const AlgoOrderResponseSchema = AlgoOrderSchema;
export const AlgoOrdersResponseSchema = z.array(AlgoOrderSchema);

export const BatchOrdersItemSchema = z.object({
  orderId: z.number(),
  symbol: z.string(),
  status: z.string(),
  clientOrderId: z.string(),
  price: z.string().transform(Number),
  avgPrice: z.string().transform(Number),
  origQty: z.string().transform(Number),
  executedQty: z.string().transform(Number),
  cumQuote: z.string().transform(Number),
  type: z.string(),
  reduceOnly: z.boolean(),
  side: z.string(),
  positionSide: z.string(),
  time: z.number(),
  updateTime: z.number(),
});
export type BatchOrdersItem = z.infer<typeof BatchOrdersItemSchema>;
export const BatchOrdersResponseSchema = z.array(BatchOrdersItemSchema);

export const OrderModifyHistoryEntrySchema = z.object({
  orderId: z.number(),
  symbol: z.string(),
  status: z.string(),
  clientOrderId: z.string(),
  price: z.string().transform(Number),
  avgPrice: z.string().transform(Number),
  origQty: z.string().transform(Number),
  executedQty: z.string().transform(Number),
  cumQuote: z.string().transform(Number),
  type: z.string(),
  reduceOnly: z.boolean(),
  side: z.string(),
  positionSide: z.string(),
  origType: z.string().optional(),
  stopPrice: z.string().transform(Number).optional(),
  updateTime: z.number(),
});
export type OrderModifyHistoryEntry = z.infer<typeof OrderModifyHistoryEntrySchema>;
export const OrderModifyHistorySchema = z.array(OrderModifyHistoryEntrySchema);

export const LeverageChangeSchema = z.object({
  leverage: z.number(),
  maxNotionalValue: z.union([z.string(), z.number()]),
  symbol: z.string(),
});
export type LeverageChange = z.infer<typeof LeverageChangeSchema>;

export const MarginTypeChangeSchema = z.object({
  code: z.number(),
  msg: z.string(),
});
export type MarginTypeChange = z.infer<typeof MarginTypeChangeSchema>;

export const PositionMarginChangeSchema = z.object({
  amount: z.number(),
  code: z.number(),
  msg: z.string(),
  type: z.number(),
});
export type PositionMarginChange = z.infer<typeof PositionMarginChangeSchema>;

export const CountdownCancelAllSchema = z.object({
  symbol: z.string(),
  countdownTime: z.number(),
});
export type CountdownCancelAll = z.infer<typeof CountdownCancelAllSchema>;

/**
 * New order ACK response (`newOrderRespType: 'ACK'`).
 *
 * Binance's ACK contract does NOT carry execution fields: `avgPrice`,
 * `executedQty` and `cumQuote` are RESULT-only fields (and `reduceOnly` is
 * not part of the ACK payload either). They are optional here so a true ACK
 * response parses; when absent the execution envelope reports *unknown*,
 * never a silent zero (see v3.5.1 release notes). For a MARKET/LIMIT order
 * without an explicit `newOrderRespType` Binance defaults to RESULT, which
 * also parses against this schema.
 */
export const NewOrderAckSchema = z.object({
  orderId: z.number(),
  symbol: z.string(),
  status: z.string(),
  clientOrderId: z.string(),
  price: z.string(),
  /** RESULT-only; absent from ACK responses. */
  avgPrice: z.string().optional(),
  origQty: z.string(),
  /** RESULT-only; absent from ACK responses. */
  executedQty: z.string().optional(),
  /** RESULT-only; absent from ACK responses. */
  cumQuote: z.string().optional(),
  type: z.string(),
  /** RESULT-only; absent from ACK responses. */
  reduceOnly: z.boolean().optional(),
  side: z.string(),
  positionSide: z.string(),
  timeInForce: z.string().optional(),
  selfTradePreventionMode: z.string().optional(),
  time: z.number(),
  updateTime: z.number(),
  workingType: z.string().optional(),
  origType: z.string().optional(),
  closePosition: z.boolean().optional(),
});
export type NewOrderAck = z.infer<typeof NewOrderAckSchema>;

/**
 * Cancel order response (`DELETE /fapi/v1/order`). Its contract differs from
 * the query-order shape: it carries `cumQty` (the cumulative *quantity*,
 * distinct from `cumQuote`) and omits `avgPrice`, `origQty` and `reduceOnly`.
 * Parsing it with the full {@link OrderSchema} fails against real Binance
 * responses — this dedicated (tolerant) schema is the v3.5.1 fix.
 */
export const CancelOrderResultSchema = z.object({
  clientOrderId: z.string(),
  cumQty: z.string().optional(),
  cumQuote: z.string().optional(),
  executedQty: z.string().optional(),
  orderId: z.number(),
  origClientOrderId: z.string().optional(),
  price: z.string().optional(),
  side: z.string(),
  status: z.string(),
  stopPrice: z.string().optional(),
  symbol: z.string(),
  timeInForce: z.string().optional(),
  type: z.string(),
  updateTime: z.number().optional(),
  workingType: z.string().optional(),
  positionSide: z.string().optional(),
  priceProtect: z.boolean().optional(),
  selfTradePreventionMode: z.string().optional(),
});
export type CancelOrderResult = z.infer<typeof CancelOrderResultSchema>;
