import { z } from 'zod';

/**
 * Zod schemas for the remaining Wave 3/4 products:
 *  - Portfolio Margin Pro (/sapi/v1/portfolio/*, /sapi/v2/portfolio/*)
 *  - Crypto Loan (v1 fixed-term + v2 flexible)
 *  - Convert SAPI
 *  - Algo SAPI (spot + futures)
 *  - Dual Investment
 *  - Alpha (bapi)
 *  - Copy Trading
 *  - C2C
 *
 * Decimal-string fields transformed to `number`; all schemas `.loose()` so
 * Binance can add fields without breaking parsing.
 */

// ---------------------------------------------------------------------------
// Portfolio Margin Pro
// ---------------------------------------------------------------------------

export const PmProAccountSchema = z.object({
  unifiedMarginAccount: z.boolean().optional(),
  marginLevel: z.string().transform(Number).optional(),
  totalNetAssetOfBtc: z.string().transform(Number).optional(),
  totalNetAssetOfUsd: z.string().transform(Number).optional(),
  actualLiability: z.string().transform(Number).optional(),
  marginRatio: z.string().transform(Number).optional(),
  updateTime: z.number().optional(),
}).loose();
export type PmProAccount = z.infer<typeof PmProAccountSchema>;

export const PmProBalanceSchema = z.object({
  asset: z.string(),
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
export type PmProBalance = z.infer<typeof PmProBalanceSchema>;
export const PmProBalanceResponseSchema = z.array(PmProBalanceSchema);

export const PmProCollateralRateSchema = z.object({
  asset: z.string(),
  collateralRate: z.string().transform(Number),
}).loose();
export type PmProCollateralRate = z.infer<typeof PmProCollateralRateSchema>;
export const PmProCollateralRateResponseSchema = z.array(PmProCollateralRateSchema);

export const PmProAssetIndexPriceSchema = z.object({
  asset: z.string(),
  indexPrice: z.string().transform(Number),
  time: z.number().optional(),
}).loose();
export type PmProAssetIndexPrice = z.infer<typeof PmProAssetIndexPriceSchema>;
export const PmProAssetIndexPriceResponseSchema = z.array(PmProAssetIndexPriceSchema);

export const PmProMarginAssetLeverageSchema = z.object({
  asset: z.string(),
  leverage: z.number().optional(),
}).loose();
export type PmProMarginAssetLeverage = z.infer<typeof PmProMarginAssetLeverageSchema>;
export const PmProMarginAssetLeverageResponseSchema = z.array(PmProMarginAssetLeverageSchema);

export const PmProInterestHistorySchema = z.object({
  asset: z.string(),
  interest: z.string().transform(Number),
  interestRate: z.string().transform(Number).optional(),
  time: z.number(),
}).loose();
export type PmProInterestHistory = z.infer<typeof PmProInterestHistorySchema>;
export const PmProInterestHistoryResponseSchema = z.array(PmProInterestHistorySchema);

export const PmProLoanRecordSchema = z.object({
  loanId: z.string().optional(),
  asset: z.string(),
  principal: z.string().transform(Number),
  status: z.string(),
  time: z.number(),
}).loose();
export type PmProLoanRecord = z.infer<typeof PmProLoanRecordSchema>;
export const PmProLoanRecordResponseSchema = z.array(PmProLoanRecordSchema);

// ---------------------------------------------------------------------------
// Crypto Loan
// ---------------------------------------------------------------------------

export const CryptoLoanBorrowHistorySchema = z.object({
  loanCoin: z.string(),
  initialLtv: z.string().transform(Number).optional(),
  marginRatio: z.string().transform(Number).optional(),
  collateralCoin: z.string().optional(),
  hourInterestRate: z.string().transform(Number).optional(),
  dailyInterestRate: z.string().transform(Number).optional(),
  loanAmount: z.string().transform(Number).optional(),
  loanTerm: z.number().optional(),
  collateralAmount: z.string().transform(Number).optional(),
  borrowTime: z.number().optional(),
  status: z.string().optional(),
  orderId: z.number().optional(),
}).loose();
export type CryptoLoanBorrowHistory = z.infer<typeof CryptoLoanBorrowHistorySchema>;
export const CryptoLoanBorrowHistoryResponseSchema = z.array(CryptoLoanBorrowHistorySchema);

export const CryptoLoanIncomeSchema = z.object({
  asset: z.string().optional(),
  type: z.string(),
  amount: z.string().transform(Number).optional(),
  timestamp: z.number().optional(),
  tranId: z.number().optional(),
}).loose();
export type CryptoLoanIncome = z.infer<typeof CryptoLoanIncomeSchema>;
export const CryptoLoanIncomeResponseSchema = z.array(CryptoLoanIncomeSchema);

export const CryptoLoanLtvAdjustmentHistorySchema = z.object({
  loanCoin: z.string().optional(),
  collateralCoin: z.string().optional(),
  direction: z.string().optional(),
  amount: z.string().transform(Number).optional(),
  preLTV: z.string().transform(Number).optional(),
  afterLTV: z.string().transform(Number).optional(),
  timestamp: z.number().optional(),
}).loose();
export type CryptoLoanLtvAdjustmentHistory = z.infer<typeof CryptoLoanLtvAdjustmentHistorySchema>;
export const CryptoLoanLtvAdjustmentHistoryResponseSchema = z.array(CryptoLoanLtvAdjustmentHistorySchema);

export const CryptoLoanRepayCollateralRateSchema = z.object({
  loanCoin: z.string(),
  collateralCoin: z.string(),
  repayAmount: z.string().transform(Number),
  collateralReturnAmount: z.string().transform(Number).optional(),
}).loose();
export type CryptoLoanRepayCollateralRate = z.infer<typeof CryptoLoanRepayCollateralRateSchema>;

export const CryptoLoanRepayHistorySchema = z.object({
  loanCoin: z.string(),
  collateralCoin: z.string().optional(),
  repayAmount: z.string().transform(Number).optional(),
  collateralReturn: z.string().transform(Number).optional(),
  repayTime: z.number().optional(),
  status: z.string().optional(),
  orderId: z.number().optional(),
}).loose();
export type CryptoLoanRepayHistory = z.infer<typeof CryptoLoanRepayHistorySchema>;
export const CryptoLoanRepayHistoryResponseSchema = z.array(CryptoLoanRepayHistorySchema);

export const CryptoLoanFlexibleBorrowSchema = z.object({
  loanCoin: z.string(),
  collateralCoin: z.string(),
  loanAmount: z.string().transform(Number).optional(),
  collateralAmount: z.string().transform(Number).optional(),
  orderId: z.number().optional(),
}).loose();
export type CryptoLoanFlexibleBorrow = z.infer<typeof CryptoLoanFlexibleBorrowSchema>;

export const CryptoLoanFlexibleLoanableSchema = z.object({
  loanCoin: z.string(),
  flexibleInterestRate: z.string().transform(Number),
  flexibleMinLimit: z.string().transform(Number).optional(),
  flexibleMaxLimit: z.string().transform(Number).optional(),
}).loose();
export type CryptoLoanFlexibleLoanable = z.infer<typeof CryptoLoanFlexibleLoanableSchema>;
export const CryptoLoanFlexibleLoanableResponseSchema = z.array(CryptoLoanFlexibleLoanableSchema);

export const CryptoLoanFlexibleCollateralSchema = z.object({
  collateralCoin: z.string(),
  initialLTV: z.string().transform(Number).optional(),
  marginCallLTV: z.string().transform(Number).optional(),
  liquidationLTV: z.string().transform(Number).optional(),
}).loose();
export type CryptoLoanFlexibleCollateral = z.infer<typeof CryptoLoanFlexibleCollateralSchema>;
export const CryptoLoanFlexibleCollateralResponseSchema = z.array(CryptoLoanFlexibleCollateralSchema);

export const CryptoLoanInterestRateHistorySchema = z.object({
  loanCoin: z.string(),
  dailyInterestRate: z.string().transform(Number),
  time: z.number(),
}).loose();
export type CryptoLoanInterestRateHistory = z.infer<typeof CryptoLoanInterestRateHistorySchema>;
export const CryptoLoanInterestRateHistoryResponseSchema = z.array(CryptoLoanInterestRateHistorySchema);

// ---------------------------------------------------------------------------
// Convert SAPI
// ---------------------------------------------------------------------------
// Wave 8 moved the Convert response schemas to the connector-js oracle
// (src/types/convert.wave8.types.ts). The legacy pair-limits assetInfo
// shape stays here as the transition-union member for Convert.assetInfo:
// Binance re-documented GET /sapi/v1/convert/assetInfo as per-asset
// precision, but the pre-catalog wire shape must keep parsing until the
// next major pins the current documented shape.

export const ConvertAssetInfoSchema = z.object({
  fromAsset: z.string().optional(),
  toAsset: z.string().optional(),
  fromAssetMinAmount: z.string().transform(Number).optional(),
  fromAssetMaxAmount: z.string().transform(Number).optional(),
  toAssetMinAmount: z.string().transform(Number).optional(),
  toAssetMaxAmount: z.string().transform(Number).optional(),
}).loose();
export type ConvertAssetInfo = z.infer<typeof ConvertAssetInfoSchema>;

// ---------------------------------------------------------------------------
// Algo SAPI
// ---------------------------------------------------------------------------

export const AlgoOrderSchema = z.object({
  algoId: z.number().optional(),
  symbol: z.string(),
  side: z.string(),
  type: z.string().optional(),
  quantity: z.string().transform(Number).optional(),
  duration: z.number().optional(),
  status: z.string().optional(),
  clientOrderId: z.string().optional(),
  createTime: z.number().optional(),
}).loose();
export type AlgoOrder = z.infer<typeof AlgoOrderSchema>;
export const AlgoOrdersResponseSchema = z.array(AlgoOrderSchema);
export const AlgoOrderResponseSchema = AlgoOrderSchema;

export const AlgoSubOrderSchema = z.object({
  subId: z.number().optional(),
  algoId: z.number().optional(),
  symbol: z.string().optional(),
  side: z.string().optional(),
  price: z.string().transform(Number).optional(),
  quantity: z.string().transform(Number).optional(),
  executedQty: z.string().transform(Number).optional(),
  status: z.string().optional(),
  time: z.number().optional(),
}).loose();
export type AlgoSubOrder = z.infer<typeof AlgoSubOrderSchema>;
export const AlgoSubOrdersResponseSchema = z.array(AlgoSubOrderSchema);

// ---------------------------------------------------------------------------
// Dual Investment
// ---------------------------------------------------------------------------

export const DualInvestmentAccountSchema = z.object({
  positionId: z.number().optional(),
  asset: z.string().optional(),
  autoCompoundPlan: z.string().optional(),
  status: z.string().optional(),
  settledAmount: z.string().transform(Number).optional(),
}).loose();
export type DualInvestmentAccount = z.infer<typeof DualInvestmentAccountSchema>;
export const DualInvestmentAccountsResponseSchema = z.array(DualInvestmentAccountSchema);

export const DualInvestmentPositionSchema = z.object({
  id: z.string(),
  asset: z.string().optional(),
  investAmount: z.string().transform(Number).optional(),
  status: z.string().optional(),
  autoCompoundPlan: z.string().optional(),
  purchaseTime: z.number().optional(),
  settleTime: z.number().optional(),
  settleAsset: z.string().optional(),
  settleAmount: z.string().transform(Number).optional(),
}).loose();
export type DualInvestmentPosition = z.infer<typeof DualInvestmentPositionSchema>;
export const DualInvestmentPositionsResponseSchema = z.array(DualInvestmentPositionSchema);

export const DualInvestmentProductSchema = z.object({
  id: z.string(),
  investCoin: z.string().optional(),
  settledCoin: z.string().optional(),
  strike: z.string().transform(Number).optional(),
  settlePrice: z.string().transform(Number).optional(),
  subscribeStartTime: z.number().optional(),
  subscribeEndTime: z.number().optional(),
  settleDate: z.number().optional(),
  expiredType: z.string().optional(),
}).loose();
export type DualInvestmentProduct = z.infer<typeof DualInvestmentProductSchema>;
export const DualInvestmentProductListResponseSchema = z.array(DualInvestmentProductSchema);

export const DualInvestmentSubscribeSchema = z.object({
  positionId: z.number().optional(),
  investCoin: z.string().optional(),
  settledCoin: z.string().optional(),
  investAmount: z.string().transform(Number).optional(),
  status: z.string().optional(),
}).loose();
export type DualInvestmentSubscribe = z.infer<typeof DualInvestmentSubscribeSchema>;

// ---------------------------------------------------------------------------
// Alpha (BAPI)
// ---------------------------------------------------------------------------

export const AlphaAggTradeSchema = z.object({
  a: z.number(),
  p: z.string().transform(Number),
  q: z.string().transform(Number),
  T: z.number(),
  m: z.boolean().optional(),
}).loose();
export type AlphaAggTrade = z.infer<typeof AlphaAggTradeSchema>;
export const AlphaAggTradesResponseSchema = z.array(AlphaAggTradeSchema);

export const AlphaExchangeInfoSchema = z.object({
  timezone: z.string().optional(),
  serverTime: z.number().optional(),
  symbols: z.array(z.object({
    symbol: z.string(),
    baseAsset: z.string().optional(),
    quoteAsset: z.string().optional(),
    status: z.string().optional(),
  }).loose()).optional(),
}).loose();
export type AlphaExchangeInfo = z.infer<typeof AlphaExchangeInfoSchema>;

export type AlphaKline = [number, string, string, string, string, string, number];
export const AlphaKlinesResponseSchema = z.array(
  z.tuple([
    z.number(), // open time
    z.string(), // open
    z.string(), // high
    z.string(), // low
    z.string(), // close
    z.string(), // volume
    z.number(), // close time
  ]),
);

export const AlphaTickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string().transform(Number).optional(),
  priceChangePercent: z.string().transform(Number).optional(),
  volume: z.string().transform(Number).optional(),
  high: z.string().transform(Number).optional(),
  low: z.string().transform(Number).optional(),
}).loose();
export type AlphaTicker = z.infer<typeof AlphaTickerSchema>;
export const AlphaTickerResponseSchema = z.array(AlphaTickerSchema);

export const AlphaTokenSchema = z.object({
  symbol: z.string(),
  asset: z.string().optional(),
  name: z.string().optional(),
  chain: z.string().optional(),
  decimals: z.number().optional(),
}).loose();
export type AlphaToken = z.infer<typeof AlphaTokenSchema>;
export const AlphaTokenListResponseSchema = z.array(AlphaTokenSchema);

// ---------------------------------------------------------------------------
// Copy Trading
// ---------------------------------------------------------------------------

export const CopyTradingLeadSymbolSchema = z.object({
  symbol: z.string(),
  maxLeadTradeQty: z.string().transform(Number).optional(),
  minLeadTradeQty: z.string().transform(Number).optional(),
  status: z.string().optional(),
}).loose();
export type CopyTradingLeadSymbol = z.infer<typeof CopyTradingLeadSymbolSchema>;
export const CopyTradingLeadSymbolResponseSchema = z.array(CopyTradingLeadSymbolSchema);

export const CopyTradingUserStatusSchema = z.object({
  isLeadTrader: z.boolean().optional(),
  copyTradingStatus: z.string().optional(),
}).loose();
export type CopyTradingUserStatus = z.infer<typeof CopyTradingUserStatusSchema>;

// ---------------------------------------------------------------------------
// C2C
// ---------------------------------------------------------------------------

export const C2COrderSchema = z.object({
  orderNumber: z.string().optional(),
  tradeType: z.string().optional(),
  asset: z.string().optional(),
  amount: z.string().transform(Number).optional(),
  orderStatus: z.string().optional(),
  createTime: z.number().optional(),
}).loose();
export type C2COrder = z.infer<typeof C2COrderSchema>;
export const C2COrderResponseSchema = z.array(C2COrderSchema);
