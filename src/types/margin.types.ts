import { z } from 'zod';

export const MarginAssetBalanceSchema = z.object({
  asset: z.string(),
  borrowed: z.string().transform(Number),
  free: z.string().transform(Number),
  interest: z.string().transform(Number),
  locked: z.string().transform(Number),
  netAsset: z.string().transform(Number),
});
export type MarginAssetBalance = z.infer<typeof MarginAssetBalanceSchema>;

export const CrossMarginAccountSchema = z
  .object({
    borrowEnabled: z.boolean(),
    marginLevel: z.string().transform(Number),
    totalAssetOfBtc: z.string().transform(Number),
    totalLiabilityOfBtc: z.string().transform(Number),
    totalNetAssetOfBtc: z.string().transform(Number),
    tradeEnabled: z.boolean(),
    transferEnabled: z.boolean(),
    accountType: z.string().optional(),
    userAssets: z.array(MarginAssetBalanceSchema),
  })
  .loose();
export type CrossMarginAccount = z.infer<typeof CrossMarginAccountSchema>;

export const IsolatedMarginAssetSchema = z
  .object({
    asset: z.string(),
    borrowEnabled: z.boolean(),
    borrowed: z.string().transform(Number),
    free: z.string().transform(Number),
    interest: z.string().transform(Number),
    locked: z.string().transform(Number),
    netAsset: z.string().transform(Number),
    netAssetOfBtc: z.string().transform(Number),
    repayEnabled: z.boolean(),
    totalAsset: z.string().transform(Number),
  })
  .loose();
export type IsolatedMarginAsset = z.infer<typeof IsolatedMarginAssetSchema>;

export const IsolatedMarginSymbolSchema = z
  .object({
    baseAsset: IsolatedMarginAssetSchema,
    quoteAsset: IsolatedMarginAssetSchema,
    symbol: z.string(),
    isolatedCreated: z.boolean().optional(),
    enabled: z.boolean(),
    marginLevel: z.string().transform(Number),
    marginLevelStatus: z.string().optional(),
    marginRatio: z.string().transform(Number).optional(),
    indexPrice: z.string().transform(Number).optional(),
    liquidatePrice: z.string().transform(Number).optional(),
    liquidateRate: z.string().transform(Number).optional(),
    tradeEnabled: z.boolean(),
  })
  .loose();
export type IsolatedMarginSymbol = z.infer<typeof IsolatedMarginSymbolSchema>;

export const IsolatedMarginAccountSchema = z.object({
  assets: z.array(IsolatedMarginSymbolSchema),
  totalAssetOfBtc: z.string().transform(Number).optional(),
  totalLiabilityOfBtc: z.string().transform(Number).optional(),
  totalNetAssetOfBtc: z.string().transform(Number).optional(),
});
export type IsolatedMarginAccount = z.infer<typeof IsolatedMarginAccountSchema>;

export const MaxBorrowableSchema = z.object({
  amount: z.string().transform(Number),
  borrowLimit: z.string().transform(Number),
});
export type MaxBorrowable = z.infer<typeof MaxBorrowableSchema>;

export const MaxTransferableSchema = z.object({
  amount: z.string().transform(Number),
  fullAmount: z.string().transform(Number).optional(),
});
export type MaxTransferable = z.infer<typeof MaxTransferableSchema>;

export const BorrowRepayParamsSchema = z.object({
  asset: z.string(),
  isIsolated: z.enum(['TRUE', 'FALSE']).optional(),
  symbol: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  type: z.enum(['BORROW', 'REPAY']),
});
export type BorrowRepayParams = z.infer<typeof BorrowRepayParamsSchema>;

export const BorrowRepayResultSchema = z.object({ tranId: z.number() });
export type BorrowRepayResult = z.infer<typeof BorrowRepayResultSchema>;

export const BorrowRepayRecordEntrySchema = z
  .object({
    isolatedSymbol: z.string().optional(),
    txId: z.number(),
    asset: z.string(),
    principal: z.string().transform(Number),
    timestamp: z.number(),
    status: z.string(),
  })
  .loose();
export type BorrowRepayRecordEntry = z.infer<typeof BorrowRepayRecordEntrySchema>;

export const BorrowRepayRecordResponseSchema = z.object({
  rows: z.array(BorrowRepayRecordEntrySchema),
  total: z.number(),
});
export type BorrowRepayRecordResponse = z.infer<typeof BorrowRepayRecordResponseSchema>;

export const MarginTransferResultSchema = z.object({ tranId: z.number() });
export type MarginTransferResult = z.infer<typeof MarginTransferResultSchema>;

export const IsolatedTransferParamsSchema = z.object({
  asset: z.string(),
  symbol: z.string(),
  transFrom: z.enum(['SPOT', 'ISOLATED_MARGIN']),
  transTo: z.enum(['SPOT', 'ISOLATED_MARGIN']),
  amount: z.union([z.string(), z.number()]),
});
export type IsolatedTransferParams = z.infer<typeof IsolatedTransferParamsSchema>;

export const MarginInterestHistoryEntrySchema = z
  .object({
    txId: z.number(),
    interestAccuredTime: z.number(),
    asset: z.string(),
    rawAsset: z.string().optional(),
    principal: z.string().transform(Number),
    interest: z.string().transform(Number),
    interestRate: z.string().transform(Number),
    type: z.string(),
    isolatedSymbol: z.string().optional(),
  })
  .loose();
export type MarginInterestHistoryEntry = z.infer<typeof MarginInterestHistoryEntrySchema>;

export const MarginInterestHistoryResponseSchema = z.object({
  rows: z.array(MarginInterestHistoryEntrySchema),
  total: z.number(),
});
export type MarginInterestHistoryResponse = z.infer<typeof MarginInterestHistoryResponseSchema>;

export const MarginForceLiquidationEntrySchema = z
  .object({
    avgPrice: z.string().transform(Number),
    executedQty: z.string().transform(Number),
    orderId: z.number(),
    price: z.string().transform(Number),
    qty: z.string().transform(Number),
    side: z.string(),
    symbol: z.string(),
    timeInForce: z.string(),
    isIsolated: z.boolean().optional(),
    updatedTime: z.number(),
  })
  .loose();
export type MarginForceLiquidationEntry = z.infer<typeof MarginForceLiquidationEntrySchema>;

export const MarginForceLiquidationResponseSchema = z.object({
  rows: z.array(MarginForceLiquidationEntrySchema),
  total: z.number(),
});
export type MarginForceLiquidationResponse = z.infer<typeof MarginForceLiquidationResponseSchema>;

export const MarginPriceIndexSchema = z.object({
  calcTime: z.number(),
  price: z.string().transform(Number),
  symbol: z.string(),
});
export type MarginPriceIndex = z.infer<typeof MarginPriceIndexSchema>;

export const MarginOrderSchema = z
  .object({
    symbol: z.string(),
    orderId: z.number(),
    clientOrderId: z.string(),
    isIsolated: z.boolean().optional(),
    price: z.string().transform(Number),
    origQty: z.string().transform(Number),
    executedQty: z.string().transform(Number),
    cummulativeQuoteQty: z.string().transform(Number),
    status: z.string(),
    timeInForce: z.string().optional(),
    type: z.string(),
    side: z.string(),
    transactTime: z.number().optional(),
    time: z.number().optional(),
    updateTime: z.number().optional(),
    fills: z.array(z.unknown()).optional(),
  })
  .loose();
export type MarginOrder = z.infer<typeof MarginOrderSchema>;
export const MarginOrderResponseSchema = MarginOrderSchema;
export const MarginOrdersResponseSchema = z.array(MarginOrderSchema);

export const MarginCreateOrderParamsSchema = z.object({
  symbol: z.string(),
  isIsolated: z.enum(['TRUE', 'FALSE']).optional(),
  side: z.enum(['BUY', 'SELL']),
  type: z.string(),
  quantity: z.union([z.string(), z.number()]).optional(),
  quoteOrderQty: z.union([z.string(), z.number()]).optional(),
  price: z.union([z.string(), z.number()]).optional(),
  stopPrice: z.union([z.string(), z.number()]).optional(),
  newClientOrderId: z.string().optional(),
  icebergQty: z.union([z.string(), z.number()]).optional(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional(),
  sideEffectType: z.enum(['NO_SIDE_EFFECT', 'MARGIN_BUY', 'AUTO_REPAY', 'AUTO_BORROW_REPAY']).optional(),
  newOrderRespType: z.enum(['ACK', 'RESULT', 'FULL']).optional(),
  autoRepayAtCancel: z.boolean().optional(),
});
export type MarginCreateOrderParams = z.infer<typeof MarginCreateOrderParamsSchema>;

export const MarginTradeSchema = z
  .object({
    symbol: z.string(),
    id: z.number(),
    orderId: z.number(),
    price: z.string().transform(Number),
    qty: z.string().transform(Number),
    quoteQty: z.string().transform(Number),
    commission: z.string().transform(Number),
    commissionAsset: z.string(),
    time: z.number(),
    isBuyer: z.boolean(),
    isMaker: z.boolean(),
    isBestMatch: z.boolean().optional(),
    isIsolated: z.boolean().optional(),
  })
  .loose();
export type MarginTrade = z.infer<typeof MarginTradeSchema>;
export const MarginTradesResponseSchema = z.array(MarginTradeSchema);
