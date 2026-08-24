import { z } from 'zod';

export const CoinMBalanceSchema = z.object({
  accountAlias: z.string(),
  asset: z.string(),
  balance: z.string().transform(Number),
  withdrawAvailable: z.string().transform(Number),
  crossWalletBalance: z.string().transform(Number),
  crossUnPnl: z.string().transform(Number),
  availableBalance: z.string().transform(Number),
  updateTime: z.number(),
});
export type CoinMBalance = z.infer<typeof CoinMBalanceSchema>;
export const CoinMBalanceResponseSchema = z.array(CoinMBalanceSchema);

export const CoinMPositionRiskSchema = z
  .object({
    symbol: z.string(),
    pair: z.string().optional(),
    positionAmt: z.string().transform(Number),
    entryPrice: z.string().transform(Number),
    markPrice: z.string().transform(Number),
    unRealizedProfit: z.string().transform(Number),
    liquidationPrice: z.string().transform(Number),
    leverage: z.string().transform(Number),
    maxQty: z.string().transform(Number).optional(),
    marginType: z.enum(['isolated', 'cross']),
    isolatedMargin: z.string().transform(Number).optional(),
    isAutoAddMargin: z.union([z.string(), z.boolean()]).optional(),
    positionSide: z.string(),
    notionalValue: z.string().transform(Number).optional(),
    breakEvenPrice: z.string().transform(Number).optional(),
    updateTime: z.number().optional(),
  })
  .loose();
export type CoinMPositionRisk = z.infer<typeof CoinMPositionRiskSchema>;
export const CoinMPositionRiskResponseSchema = z.array(CoinMPositionRiskSchema);

export const CoinMAccountAssetSchema = z
  .object({
    asset: z.string(),
    walletBalance: z.string().transform(Number),
    unrealizedProfit: z.string().transform(Number),
    marginBalance: z.string().transform(Number),
    maintMargin: z.string().transform(Number),
    initialMargin: z.string().transform(Number),
    positionInitialMargin: z.string().transform(Number),
    openOrderInitialMargin: z.string().transform(Number),
    maxWithdrawAmount: z.string().transform(Number),
    crossWalletBalance: z.string().transform(Number),
    crossUnPnl: z.string().transform(Number),
    availableBalance: z.string().transform(Number),
    updateTime: z.number(),
  })
  .loose();
export type CoinMAccountAsset = z.infer<typeof CoinMAccountAssetSchema>;

export const CoinMAccountPositionSchema = z
  .object({
    symbol: z.string(),
    positionAmt: z.string().transform(Number),
    initialMargin: z.string().transform(Number),
    maintMargin: z.string().transform(Number),
    unrealizedProfit: z.string().transform(Number),
    positionInitialMargin: z.string().transform(Number),
    openOrderInitialMargin: z.string().transform(Number),
    leverage: z.string().transform(Number),
    isolated: z.boolean(),
    positionSide: z.string(),
    entryPrice: z.string().transform(Number),
    maxQty: z.string().transform(Number).optional(),
    updateTime: z.number().optional(),
  })
  .loose();
export type CoinMAccountPosition = z.infer<typeof CoinMAccountPositionSchema>;

export const CoinMAccountSchema = z
  .object({
    canDeposit: z.boolean(),
    canTrade: z.boolean(),
    canWithdraw: z.boolean(),
    feeTier: z.number(),
    updateTime: z.number(),
    assets: z.array(CoinMAccountAssetSchema),
    positions: z.array(CoinMAccountPositionSchema),
  })
  .loose();
export type CoinMAccountInfo = z.infer<typeof CoinMAccountSchema>;

export const CoinMOrderSchema = z
  .object({
    orderId: z.number(),
    symbol: z.string(),
    pair: z.string().optional(),
    status: z.string(),
    clientOrderId: z.string(),
    price: z.string().transform(Number),
    avgPrice: z.string().transform(Number),
    origQty: z.string().transform(Number),
    executedQty: z.string().transform(Number),
    cumBase: z.string().transform(Number).optional(),
    type: z.string(),
    reduceOnly: z.boolean(),
    closePosition: z.boolean().optional(),
    side: z.string(),
    positionSide: z.string(),
    stopPrice: z.string().transform(Number).optional(),
    workingType: z.string().optional(),
    priceProtect: z.boolean().optional(),
    origType: z.string().optional(),
    timeInForce: z.string().optional(),
    activatePrice: z.string().transform(Number).optional(),
    priceRate: z.string().transform(Number).optional(),
    time: z.number(),
    updateTime: z.number(),
  })
  .loose();
export type CoinMOrder = z.infer<typeof CoinMOrderSchema>;
export const CoinMOrderResponseSchema = CoinMOrderSchema;
export const CoinMOrdersResponseSchema = z.array(CoinMOrderSchema);

export const CoinMCreateOrderParamsSchema = z.object({
  symbol: z.string(),
  side: z.enum(['BUY', 'SELL']),
  positionSide: z.enum(['BOTH', 'LONG', 'SHORT']).optional(),
  type: z.string(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'GTX']).optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  reduceOnly: z.boolean().optional(),
  price: z.union([z.string(), z.number()]).optional(),
  newClientOrderId: z.string().optional(),
  stopPrice: z.union([z.string(), z.number()]).optional(),
  closePosition: z.boolean().optional(),
  activationPrice: z.union([z.string(), z.number()]).optional(),
  callbackRate: z.union([z.string(), z.number()]).optional(),
  workingType: z.enum(['MARK_PRICE', 'CONTRACT_PRICE']).optional(),
  priceProtect: z.boolean().optional(),
  newOrderRespType: z.enum(['ACK', 'RESULT']).optional(),
});
export type CoinMCreateOrderParams = z.infer<typeof CoinMCreateOrderParamsSchema>;

export const CoinMLeverageChangeSchema = z.object({
  leverage: z.number(),
  maxQty: z.string().transform(Number),
  symbol: z.string(),
});
export type CoinMLeverageChange = z.infer<typeof CoinMLeverageChangeSchema>;

export const CoinMMarginTypeChangeSchema = z.object({ code: z.number(), msg: z.string() });
export type CoinMMarginTypeChange = z.infer<typeof CoinMMarginTypeChangeSchema>;

export const CoinMPositionMarginChangeSchema = z.object({
  amount: z.number(),
  code: z.number(),
  msg: z.string(),
  type: z.number(),
});
export type CoinMPositionMarginChange = z.infer<typeof CoinMPositionMarginChangeSchema>;

export const CoinMIncomeSchema = z
  .object({
    symbol: z.string().optional(),
    incomeType: z.string(),
    income: z.string().transform(Number),
    asset: z.string(),
    info: z.string().optional(),
    time: z.number(),
    tranId: z.number(),
    tradeId: z.string().optional(),
  })
  .loose();
export type CoinMIncome = z.infer<typeof CoinMIncomeSchema>;
export const CoinMIncomeHistoryResponseSchema = z.array(CoinMIncomeSchema);

export const CoinMUserTradeSchema = z
  .object({
    symbol: z.string(),
    id: z.number(),
    orderId: z.number(),
    pair: z.string().optional(),
    side: z.string(),
    price: z.string().transform(Number),
    qty: z.string().transform(Number),
    realizedPnl: z.string().transform(Number),
    marginAsset: z.string().optional(),
    baseQty: z.string().transform(Number).optional(),
    commission: z.string().transform(Number),
    commissionAsset: z.string(),
    time: z.number(),
    positionSide: z.string(),
    buyer: z.boolean(),
    maker: z.boolean(),
  })
  .loose();
export type CoinMUserTrade = z.infer<typeof CoinMUserTradeSchema>;
export const CoinMUserTradesResponseSchema = z.array(CoinMUserTradeSchema);

export const CoinMOpenInterestHistEntrySchema = z.object({
  pair: z.string(),
  contractType: z.string(),
  sumOpenInterest: z.string().transform(Number),
  sumOpenInterestValue: z.string().transform(Number),
  timestamp: z.number(),
});
export type CoinMOpenInterestHistEntry = z.infer<typeof CoinMOpenInterestHistEntrySchema>;
export const CoinMOpenInterestHistSchema = z.array(CoinMOpenInterestHistEntrySchema);

export const CoinMPositionModeSchema = z.object({ dualSidePosition: z.boolean() });
export type CoinMPositionMode = z.infer<typeof CoinMPositionModeSchema>;

export const CoinMLeverageBracketSchema = z.object({
  bracket: z.number(),
  initialLeverage: z.number(),
  qtyCap: z.number(),
  qtyFloor: z.number(),
  maintMarginRatio: z.number(),
  cum: z.number().optional(),
});
export type CoinMLeverageBracket = z.infer<typeof CoinMLeverageBracketSchema>;
export const CoinMLeverageBracketResponseSchema = z.array(
  z.object({
    symbol: z.string().optional(),
    pair: z.string().optional(),
    brackets: z.array(CoinMLeverageBracketSchema),
  }),
);

export const CoinMCommissionRateSchema = z.object({
  symbol: z.string(),
  makerCommissionRate: z.string().transform(Number),
  takerCommissionRate: z.string().transform(Number),
});
export type CoinMCommissionRate = z.infer<typeof CoinMCommissionRateSchema>;
