import { z } from 'zod';

// ---- Spot order / OCO / trade ----

export const SpotOrderSchema = z
  .object({
    symbol: z.string(),
    orderId: z.number(),
    clientOrderId: z.string(),
    status: z.string(),
    side: z.string(),
    type: z.string(),
    timeInForce: z.string().optional(),
    price: z.string().transform(Number).optional(),
    origQty: z.string().transform(Number).optional(),
    executedQty: z.string().transform(Number).optional(),
    cummulativeQuoteQty: z.string().transform(Number).optional(),
    stopPrice: z.string().transform(Number).optional(),
    icebergQty: z.string().transform(Number).optional(),
    originalQuoteOrderQty: z.string().transform(Number).optional(),
    transactTime: z.number().optional(),
    workingTime: z.number().optional(),
    orderListId: z.number().optional(),
    selfTradePreventionMode: z.string().optional(),
    fills: z.array(z.unknown()).optional(),
  })
  .loose();
export type SpotOrder = z.infer<typeof SpotOrderSchema>;
export const SpotOrderResponseSchema = SpotOrderSchema;
export const SpotOrdersResponseSchema = z.array(SpotOrderSchema);

export const SpotOCOOrderAckSchema = z
  .object({
    orderListId: z.number(),
    contingencyType: z.string(),
    listStatusType: z.string(),
    listOrderStatus: z.string(),
    listClientOrderId: z.string(),
    transactionTime: z.number(),
    symbol: z.string(),
    orders: z.array(SpotOrderSchema),
    orderReports: z.array(z.unknown()).optional(),
  })
  .loose();
export type SpotOCOOrderAck = z.infer<typeof SpotOCOOrderAckSchema>;
export const SpotOCOOrderAckResponseSchema = SpotOCOOrderAckSchema;
export const SpotOCOOrdersResponseSchema = z.array(SpotOCOOrderAckSchema);

export const SpotTradeSchema = z
  .object({
    symbol: z.string(),
    id: z.number(),
    orderId: z.number(),
    orderListId: z.number().optional(),
    price: z.string().transform(Number),
    qty: z.string().transform(Number),
    quoteQty: z.string().transform(Number),
    commission: z.string().transform(Number),
    commissionAsset: z.string(),
    time: z.number(),
    isBuyer: z.boolean(),
    isMaker: z.boolean(),
    isBestMatch: z.boolean(),
  })
  .loose();
export type SpotTrade = z.infer<typeof SpotTradeSchema>;
export const SpotTradesResponseSchema = z.array(SpotTradeSchema);

// ---- Spot account ----

export const SpotBalanceSchema = z.object({
  asset: z.string(),
  free: z.string().transform(Number),
  locked: z.string().transform(Number),
});
export type SpotBalance = z.infer<typeof SpotBalanceSchema>;

export const SpotAccountSchema = z
  .object({
    makerCommission: z.number(),
    takerCommission: z.number(),
    buyerCommission: z.number(),
    sellerCommission: z.number(),
    canTrade: z.boolean(),
    canWithdraw: z.boolean(),
    canDeposit: z.boolean(),
    updateTime: z.number().optional(),
    accountType: z.string().optional(),
    balances: z.array(SpotBalanceSchema),
    permissions: z.array(z.string()).optional(),
  })
  .loose();
export type SpotAccountInfo = z.infer<typeof SpotAccountSchema>;

// ---- Spot user data stream events (listenKey stream) ----

/** Working floor of an allocation (maintainer digest; not in the vendored spec). */
export type SpotWorkingFloor = 'SOR' | 'EXCHANGE' | (string & {});

/** SOR allocation fields. tradeId -1 marks an allocation (maintainer digest). */
export const SpotExecutionReportSchema = z
  .object({
    e: z.literal('executionReport'),
    tradeId: z.number().optional(),
    allocId: z.number().optional(),
    matchType: z.string().optional(),
    workingFloor: z
      .string()
      .transform((value) => value as SpotWorkingFloor)
      .optional(),
  })
  .loose();
export type SpotExecutionReport = z.infer<typeof SpotExecutionReportSchema>;

export const SpotOutboundAccountPositionSchema = z
  .object({ e: z.literal('outboundAccountPosition') })
  .loose();
export type SpotOutboundAccountPosition = z.infer<typeof SpotOutboundAccountPositionSchema>;

export const SpotBalanceUpdateSchema = z.object({ e: z.literal('balanceUpdate') }).loose();
export type SpotBalanceUpdate = z.infer<typeof SpotBalanceUpdateSchema>;

export const SpotListStatusSchema = z.object({ e: z.literal('listStatus') }).loose();
export type SpotListStatus = z.infer<typeof SpotListStatusSchema>;

export type SpotUserDataEvent =
  | SpotExecutionReport
  | SpotOutboundAccountPosition
  | SpotBalanceUpdate
  | SpotListStatus;

export function parseSpotUserDataEvent(raw: unknown): SpotUserDataEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid spot user-data payload');
  }
  const eventType = (raw as { e?: string }).e;
  if (eventType === 'executionReport') return SpotExecutionReportSchema.parse(raw);
  if (eventType === 'outboundAccountPosition') return SpotOutboundAccountPositionSchema.parse(raw);
  if (eventType === 'balanceUpdate') return SpotBalanceUpdateSchema.parse(raw);
  if (eventType === 'listStatus') return SpotListStatusSchema.parse(raw);
  throw new Error(`Unknown spot user-data event type: ${eventType}`);
}
