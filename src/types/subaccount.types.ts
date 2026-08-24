import { z } from 'zod';

export const SubAccountEntrySchema = z
  .object({
    email: z.string(),
    isFreeze: z.boolean(),
    createTime: z.number(),
    isManagedSubAccount: z.boolean().optional(),
    isAssetManagementSubAccount: z.boolean().optional(),
    type: z.string().optional(),
  })
  .loose();
export type SubAccountEntry = z.infer<typeof SubAccountEntrySchema>;

export const SubAccountListResponseSchema = z.object({
  subAccounts: z.array(SubAccountEntrySchema),
});
export type SubAccountListResponse = z.infer<typeof SubAccountListResponseSchema>;

export const SubAccountStatusSchema = z
  .object({
    email: z.string(),
    isSubUserEnabled: z.boolean(),
    isUserActive: z.boolean(),
    insertTime: z.number(),
    isMarginEnabled: z.boolean(),
    isFutureEnabled: z.boolean(),
    mobile: z.number().optional(),
  })
  .loose();
export type SubAccountStatus = z.infer<typeof SubAccountStatusSchema>;
export const SubAccountStatusResponseSchema = z.array(SubAccountStatusSchema);

export const SubAccountSpotAssetSchema = z.object({
  asset: z.string(),
  free: z.string().transform(Number),
  locked: z.string().transform(Number),
});
export type SubAccountSpotAsset = z.infer<typeof SubAccountSpotAssetSchema>;

export const SubAccountSpotAssetsResponseSchema = z.object({
  balances: z.array(SubAccountSpotAssetSchema),
});
export type SubAccountSpotAssetsResponse = z.infer<typeof SubAccountSpotAssetsResponseSchema>;

export const SubAccountSpotSummaryEntrySchema = z
  .object({
    email: z.string(),
    totalAsset: z.string().transform(Number),
  })
  .loose();
export type SubAccountSpotSummaryEntry = z.infer<typeof SubAccountSpotSummaryEntrySchema>;

export const SubAccountSpotSummarySchema = z.object({
  totalCount: z.number(),
  masterAccountTotalAsset: z.string().transform(Number),
  spotSubUserAssetBtcVoList: z.array(SubAccountSpotSummaryEntrySchema),
});
export type SubAccountSpotSummary = z.infer<typeof SubAccountSpotSummarySchema>;

export const SubAccountFuturesSummarySchema = z
  .object({
    totalCount: z.number().optional(),
    totalMarginBalanceOfBTC: z.string().transform(Number).optional(),
    totalUnrealizedProfitOfBTC: z.string().transform(Number).optional(),
    totalWalletBalanceOfBTC: z.string().transform(Number).optional(),
    subAccountList: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .loose();
export type SubAccountFuturesSummary = z.infer<typeof SubAccountFuturesSummarySchema>;

export const SubAccountMarginAccountSchema = z
  .object({
    email: z.string(),
    marginLevel: z.string().transform(Number),
    totalAssetOfBtc: z.string().transform(Number),
    totalLiabilityOfBtc: z.string().transform(Number),
    totalNetAssetOfBtc: z.string().transform(Number),
    marginTradeCoeffVo: z.record(z.string(), z.unknown()).optional(),
    marginUserAssetVoList: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .loose();
export type SubAccountMarginAccount = z.infer<typeof SubAccountMarginAccountSchema>;

export const SubAccountUniversalTransferParamsSchema = z.object({
  fromEmail: z.string().optional(),
  toEmail: z.string().optional(),
  fromAccountType: z.enum(['SPOT', 'USDT_FUTURE', 'COIN_FUTURE', 'MARGIN', 'ISOLATED_MARGIN']),
  toAccountType: z.enum(['SPOT', 'USDT_FUTURE', 'COIN_FUTURE', 'MARGIN', 'ISOLATED_MARGIN']),
  symbol: z.string().optional(),
  asset: z.string(),
  amount: z.union([z.string(), z.number()]),
  clientTranId: z.string().optional(),
});
export type SubAccountUniversalTransferParams = z.infer<typeof SubAccountUniversalTransferParamsSchema>;

export const SubAccountUniversalTransferResultSchema = z.object({
  tranId: z.number(),
  clientTranId: z.string().optional(),
});
export type SubAccountUniversalTransferResult = z.infer<typeof SubAccountUniversalTransferResultSchema>;

export const SubAccountUniversalTransferEntrySchema = z
  .object({
    tranId: z.number(),
    fromEmail: z.string(),
    toEmail: z.string(),
    asset: z.string(),
    amount: z.string().transform(Number),
    fromAccountType: z.string(),
    toAccountType: z.string(),
    status: z.string(),
    createTimeStamp: z.number(),
    clientTranId: z.string().optional(),
  })
  .loose();
export type SubAccountUniversalTransferEntry = z.infer<typeof SubAccountUniversalTransferEntrySchema>;

export const SubAccountUniversalTransferHistoryResponseSchema = z.object({
  result: z.array(SubAccountUniversalTransferEntrySchema),
  totalCount: z.number(),
});
export type SubAccountUniversalTransferHistoryResponse = z.infer<
  typeof SubAccountUniversalTransferHistoryResponseSchema
>;

export const VirtualSubAccountResultSchema = z.object({ email: z.string() });
export type VirtualSubAccountResult = z.infer<typeof VirtualSubAccountResultSchema>;

export const SubAccountDepositAddressSchema = z.object({
  address: z.string(),
  coin: z.string(),
  tag: z.string(),
  url: z.string().optional(),
});
export type SubAccountDepositAddress = z.infer<typeof SubAccountDepositAddressSchema>;

export const SubAccountDepositHistoryEntrySchema = z
  .object({
    id: z.string(),
    amount: z.string().transform(Number),
    coin: z.string(),
    network: z.string(),
    status: z.number(),
    address: z.string(),
    txId: z.string(),
    insertTime: z.number(),
    transferType: z.number(),
  })
  .loose();
export type SubAccountDepositHistoryEntry = z.infer<typeof SubAccountDepositHistoryEntrySchema>;
export const SubAccountDepositHistoryResponseSchema = z.array(SubAccountDepositHistoryEntrySchema);

export const SubAccountEnableResultSchema = z
  .object({
    email: z.string(),
    isFuturesEnabled: z.boolean().optional(),
    isMarginEnabled: z.boolean().optional(),
  })
  .loose();
export type SubAccountEnableResult = z.infer<typeof SubAccountEnableResultSchema>;
