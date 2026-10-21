import { z } from 'zod';

/**
 * Zod schemas for the Binance Portfolio Margin product (`/papi/v1/*`).
 * Covers the PM top-level account surface plus the UM/CM/margin/portfolio
 * sub-surfaces. Decimal-string fields are transformed to `number` to match
 * the existing USDⓈ-M / COIN-M convention.
 *
 * Schemas are `.loose()` so additional fields Binance introduces do not
 * break parsing. Callers needing strict validation can use the underlying
 * schema's `.strict()` variant.
 */

// ---------------------------------------------------------------------------
// Account & balance
// ---------------------------------------------------------------------------

export const PmAssetSchema = z.object({
  asset: z.string(),
  walletBalance: z.string().transform(Number),
  marginBalance: z.string().transform(Number).optional(),
  availableBalance: z.string().transform(Number).optional(),
  maxWithdrawAmount: z.string().transform(Number).optional(),
}).loose();
export type PmAsset = z.infer<typeof PmAssetSchema>;

export const PmAccountSchema = z.object({
  unifiedMarginAccount: z.boolean().optional(),
  marginLevel: z.string().transform(Number).optional(),
  totalNetAssetOfBtc: z.string().transform(Number).optional(),
  totalNetAssetOfUsd: z.string().transform(Number).optional(),
  actualLiability: z.string().transform(Number).optional(),
  marginRatio: z.string().transform(Number).optional(),
  assets: z.array(PmAssetSchema).optional(),
  updateTime: z.number().optional(),
}).loose();
export type PmAccount = z.infer<typeof PmAccountSchema>;

export const PmBalanceSchema = z.object({
  asset: z.string(),
  walletBalance: z.string().transform(Number),
  crossMarginAsset: z.string().transform(Number).optional(),
  crossMarginLiability: z.string().transform(Number).optional(),
  crossMarginFree: z.string().transform(Number).optional(),
  crossMarginLocked: z.string().transform(Number).optional(),
  umWalletBalance: z.string().transform(Number).optional(),
  umUnrealizedPNL: z.string().transform(Number).optional(),
  cmWalletBalance: z.string().transform(Number).optional(),
  cmUnrealizedPNL: z.string().transform(Number).optional(),
  updateTime: z.number().optional(),
}).loose();
export type PmBalance = z.infer<typeof PmBalanceSchema>;
export const PmBalanceResponseSchema = z.array(PmBalanceSchema);

// ---------------------------------------------------------------------------
// UM Futures
// ---------------------------------------------------------------------------

export const PmUmAssetSchema = z.object({
  asset: z.string(),
  walletBalance: z.string().transform(Number),
  marginBalance: z.string().transform(Number),
  maintMargin: z.string().transform(Number),
  initialMargin: z.string().transform(Number).optional(),
  positionInitialMargin: z.string().transform(Number).optional(),
  openOrderInitialMargin: z.string().transform(Number).optional(),
  maxWithdrawAmount: z.string().transform(Number).optional(),
  crossWalletBalance: z.string().transform(Number).optional(),
  crossUnPnl: z.string().transform(Number).optional(),
  availableBalance: z.string().transform(Number).optional(),
  updateTime: z.number().optional(),
}).loose();
export type PmUmAsset = z.infer<typeof PmUmAssetSchema>;

export const PmUmAccountSchema = z.object({
  feeTier: z.number().optional(),
  canTrade: z.boolean().optional(),
  canDeposit: z.boolean().optional(),
  canWithdraw: z.boolean().optional(),
  updateTime: z.number().optional(),
  assets: z.array(PmUmAssetSchema).optional(),
}).loose();
export type PmUmAccount = z.infer<typeof PmUmAccountSchema>;

export const PmUmPositionRiskSchema = z.object({
  symbol: z.string(),
  positionAmt: z.string().transform(Number),
  entryPrice: z.string().transform(Number),
  markPrice: z.string().transform(Number),
  unRealizedProfit: z.string().transform(Number),
  liquidationPrice: z.string().transform(Number).optional(),
  leverage: z.string().transform(Number).optional(),
  marginType: z.string().optional(),
  positionSide: z.string(),
  maxNotionalValue: z.string().transform(Number).optional(),
  updateTime: z.number().optional(),
}).loose();
export type PmUmPositionRisk = z.infer<typeof PmUmPositionRiskSchema>;
export const PmUmPositionRiskResponseSchema = z.array(PmUmPositionRiskSchema);

export const PmPositionModeSchema = z.object({ dualSidePosition: z.boolean() });
export type PmPositionMode = z.infer<typeof PmPositionModeSchema>;

export const PmIncomeSchema = z.object({
  symbol: z.string().optional(),
  incomeType: z.string(),
  income: z.string().transform(Number),
  asset: z.string(),
  info: z.string().optional(),
  time: z.number(),
  tranId: z.number().optional(),
}).loose();
export type PmIncome = z.infer<typeof PmIncomeSchema>;
export const PmIncomeResponseSchema = z.array(PmIncomeSchema);

export const PmLeverageBracketSchema = z.object({
  symbol: z.string().optional(),
  brackets: z.array(z.object({
    bracket: z.number(),
    initialLeverage: z.number(),
    cap: z.string().transform(Number).optional(),
    floor: z.string().transform(Number).optional(),
    maintMarginRatio: z.number().optional(),
    cum: z.string().transform(Number).optional(),
  }).loose()),
}).loose();
export type PmLeverageBracket = z.infer<typeof PmLeverageBracketSchema>;
export const PmLeverageBracketResponseSchema = z.array(PmLeverageBracketSchema);

export const PmCommissionRateSchema = z.object({
  symbol: z.string(),
  makerCommissionRate: z.string().transform(Number),
  takerCommissionRate: z.string().transform(Number),
}).loose();
export type PmCommissionRate = z.infer<typeof PmCommissionRateSchema>;

export const PmFundingRateSchema = z.object({
  symbol: z.string(),
  fundingRate: z.string().transform(Number),
  fundingTime: z.number(),
  markPrice: z.string().transform(Number).optional(),
}).loose();
export type PmFundingRate = z.infer<typeof PmFundingRateSchema>;
export const PmFundingRateResponseSchema = z.array(PmFundingRateSchema);

export const PmOpenInterestSchema = z.object({
  symbol: z.string(),
  openInterest: z.string().transform(Number),
  time: z.number(),
}).loose();
export type PmOpenInterest = z.infer<typeof PmOpenInterestSchema>;

export const PmOrderSchema = z.object({
  orderId: z.number(),
  symbol: z.string(),
  status: z.string(),
  clientOrderId: z.string().optional(),
  price: z.string().transform(Number),
  avgPrice: z.string().transform(Number),
  origQty: z.string().transform(Number),
  executedQty: z.string().transform(Number),
  cumQuote: z.string().transform(Number).optional(),
  type: z.string().optional(),
  side: z.string(),
  positionSide: z.string().optional(),
  time: z.number(),
  updateTime: z.number(),
}).loose();
export type PmOrder = z.infer<typeof PmOrderSchema>;
export const PmOrderResponseSchema = PmOrderSchema;
export const PmOrdersResponseSchema = z.array(PmOrderSchema);

// ---------------------------------------------------------------------------
// CM Futures — reuses UM-shaped schemas with minor variations
// ---------------------------------------------------------------------------

export const PmCmAssetSchema = PmUmAssetSchema;
export type PmCmAsset = PmUmAsset;

export const PmCmAccountSchema = PmUmAccountSchema;
export type PmCmAccount = PmUmAccount;

export const PmCmPositionRiskSchema = z.object({
  symbol: z.string(),
  pair: z.string().optional(),
  positionAmt: z.string().transform(Number),
  entryPrice: z.string().transform(Number),
  markPrice: z.string().transform(Number),
  unRealizedProfit: z.string().transform(Number),
  liquidationPrice: z.string().transform(Number).optional(),
  leverage: z.string().transform(Number).optional(),
  marginType: z.string().optional(),
  positionSide: z.string(),
  updateTime: z.number().optional(),
}).loose();
export type PmCmPositionRisk = z.infer<typeof PmCmPositionRiskSchema>;
export const PmCmPositionRiskResponseSchema = z.array(PmCmPositionRiskSchema);

// ---------------------------------------------------------------------------
// Margin
// ---------------------------------------------------------------------------

export const PmMarginAccountSchema = z.object({
  marginLevel: z.string().transform(Number).optional(),
  totalNetAssetOfBtc: z.string().transform(Number).optional(),
  totalLiabilityOfBtc: z.string().transform(Number).optional(),
  totalAssetOfBtc: z.string().transform(Number).optional(),
  borrowEnabled: z.boolean().optional(),
  transferEnabled: z.boolean().optional(),
  userAssets: z.array(z.object({
    asset: z.string(),
    free: z.string().transform(Number),
    locked: z.string().transform(Number),
    borrowed: z.string().transform(Number).optional(),
    interest: z.string().transform(Number).optional(),
    netAsset: z.string().transform(Number).optional(),
  }).loose()).optional(),
}).loose();
export type PmMarginAccount = z.infer<typeof PmMarginAccountSchema>;

export const PmMarginBalanceSchema = z.object({
  asset: z.string().optional(),
  balance: z.string().transform(Number).optional(),
}).loose();
export type PmMarginBalance = z.infer<typeof PmMarginBalanceSchema>;

export const PmMarginLoanRecordSchema = z.object({
  txId: z.number(),
  asset: z.string(),
  principal: z.string().transform(Number),
  status: z.string(),
  timestamp: z.number(),
}).loose();
export type PmMarginLoanRecord = z.infer<typeof PmMarginLoanRecordSchema>;
export const PmMarginLoanRecordResponseSchema = z.array(PmMarginLoanRecordSchema);

export const PmMarginRepayRecordSchema = z.object({
  txId: z.number(),
  asset: z.string(),
  amount: z.string().transform(Number),
  principal: z.string().transform(Number).optional(),
  status: z.string(),
  timestamp: z.number(),
}).loose();
export type PmMarginRepayRecord = z.infer<typeof PmMarginRepayRecordSchema>;
export const PmMarginRepayRecordResponseSchema = z.array(PmMarginRepayRecordSchema);

// ---------------------------------------------------------------------------
// Portfolio (PM loan, repay, collateral)
// ---------------------------------------------------------------------------

export const PmPortfolioAccountSchema = z.object({
  unifiedMarginAccount: z.boolean().optional(),
  marginLevel: z.string().transform(Number).optional(),
  totalNetAssetOfBtc: z.string().transform(Number).optional(),
  totalNetAssetOfUsd: z.string().transform(Number).optional(),
  actualLiability: z.string().transform(Number).optional(),
  marginRatio: z.string().transform(Number).optional(),
  updateTime: z.number().optional(),
}).loose();
export type PmPortfolioAccount = z.infer<typeof PmPortfolioAccountSchema>;

export const PmPortfolioBalanceSchema = z.object({
  asset: z.string(),
  availableBalance: z.string().transform(Number),
  totalWalletBalance: z.string().transform(Number).optional(),
  crossMarginAsset: z.string().transform(Number).optional(),
  umWalletBalance: z.string().transform(Number).optional(),
  cmWalletBalance: z.string().transform(Number).optional(),
}).loose();
export type PmPortfolioBalance = z.infer<typeof PmPortfolioBalanceSchema>;
export const PmPortfolioBalanceResponseSchema = z.array(PmPortfolioBalanceSchema);

export const PmCollateralRateSchema = z.object({
  asset: z.string(),
  collateralRate: z.string().transform(Number),
}).loose();
export type PmCollateralRate = z.infer<typeof PmCollateralRateSchema>;
export const PmCollateralRateResponseSchema = z.array(PmCollateralRateSchema);

export const PmAssetIndexPriceSchema = z.object({
  asset: z.string(),
  indexPrice: z.string().transform(Number),
  time: z.number().optional(),
}).loose();
export type PmAssetIndexPrice = z.infer<typeof PmAssetIndexPriceSchema>;
export const PmAssetIndexPriceResponseSchema = z.array(PmAssetIndexPriceSchema);

export const PmMarginAssetLeverageSchema = z.object({
  asset: z.string(),
  leverage: z.number().optional(),
}).loose();
export type PmMarginAssetLeverage = z.infer<typeof PmMarginAssetLeverageSchema>;
export const PmMarginAssetLeverageResponseSchema = z.array(PmMarginAssetLeverageSchema);

export const PmInterestHistorySchema = z.object({
  asset: z.string(),
  interest: z.string().transform(Number),
  interestRate: z.string().transform(Number).optional(),
  principal: z.string().transform(Number).optional(),
  liabilityAsset: z.string().optional(),
  liabilityAmt: z.string().transform(Number).optional(),
  time: z.number(),
}).loose();
export type PmInterestHistory = z.infer<typeof PmInterestHistorySchema>;
export const PmInterestHistoryResponseSchema = z.array(PmInterestHistorySchema);

export const PmMarginCallLevelSchema = z.object({
  marginCallLevel: z.string().transform(Number),
  marginCallTriggered: z.boolean().optional(),
}).loose();
export type PmMarginCallLevel = z.infer<typeof PmMarginCallLevelSchema>;

export const PmEarnAssetBalanceSchema = z.object({
  asset: z.string(),
  earnAmount: z.string().transform(Number),
  amount: z.string().transform(Number).optional(),
}).loose();
export type PmEarnAssetBalance = z.infer<typeof PmEarnAssetBalanceSchema>;

// ---------------------------------------------------------------------------
// Rate limit order
// ---------------------------------------------------------------------------

export const PmRateLimitOrderSchema = z.object({
  rateLimitType: z.string(),
  interval: z.string(),
  intervalNum: z.number(),
  limit: z.number(),
}).loose();
export type PmRateLimitOrder = z.infer<typeof PmRateLimitOrderSchema>;
export const PmRateLimitOrderResponseSchema = z.array(PmRateLimitOrderSchema);

// ---------------------------------------------------------------------------
// Listen key
// ---------------------------------------------------------------------------

export const PmListenKeySchema = z.object({ listenKey: z.string() });
export type PmListenKey = z.infer<typeof PmListenKeySchema>;
