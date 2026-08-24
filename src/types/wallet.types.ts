import { z } from 'zod';

export const TransferTypeSchema = z.enum([
  'MAIN_UMFUTURE', 'MAIN_CMFUTURE', 'MAIN_MARGIN', 'MAIN_MINING', 'MAIN_FUNDING', 'MAIN_OPTION',
  'UMFUTURE_MAIN', 'UMFUTURE_MARGIN', 'UMFUTURE_FUNDING',
  'CMFUTURE_MAIN', 'CMFUTURE_MARGIN',
  'MARGIN_MAIN', 'MARGIN_UMFUTURE', 'MARGIN_CMFUTURE', 'MARGIN_MINING', 'MARGIN_FUNDING',
  'MINING_MAIN', 'MINING_UMFUTURE', 'MINING_MARGIN',
  'FUNDING_MAIN', 'FUNDING_UMFUTURE', 'FUNDING_MARGIN', 'FUNDING_CMFUTURE',
  'OPTION_MAIN', 'MAIN_OPTION_MARGIN',
  'MAIN_PORTFOLIO_MARGIN', 'PORTFOLIO_MARGIN_MAIN',
  'ISOLATEDMARGIN_MARGIN', 'MARGIN_ISOLATEDMARGIN', 'ISOLATEDMARGIN_ISOLATEDMARGIN',
]);
export type TransferType = z.infer<typeof TransferTypeSchema>;

export const UniversalTransferParamsSchema = z.object({
  type: TransferTypeSchema,
  asset: z.string(),
  amount: z.union([z.string(), z.number()]),
  fromSymbol: z.string().optional(),
  toSymbol: z.string().optional(),
});
export type UniversalTransferParams = z.infer<typeof UniversalTransferParamsSchema>;

export const UniversalTransferResultSchema = z.object({ tranId: z.number() });
export type UniversalTransferResult = z.infer<typeof UniversalTransferResultSchema>;

export const UniversalTransferHistoryEntrySchema = z
  .object({
    asset: z.string(),
    amount: z.string().transform(Number),
    type: z.string(),
    status: z.string(),
    tranId: z.number(),
    timestamp: z.number(),
    fromSymbol: z.string().nullable().optional(),
    toSymbol: z.string().nullable().optional(),
  })
  .loose();
export type UniversalTransferHistoryEntry = z.infer<typeof UniversalTransferHistoryEntrySchema>;

export const UniversalTransferHistoryResponseSchema = z.object({
  total: z.number(),
  rows: z.array(UniversalTransferHistoryEntrySchema),
});
export type UniversalTransferHistoryResponse = z.infer<typeof UniversalTransferHistoryResponseSchema>;

export const FundingAssetSchema = z.object({
  asset: z.string(),
  free: z.string().transform(Number),
  locked: z.string().transform(Number),
  freeze: z.string().transform(Number),
  withdrawing: z.string().transform(Number),
  btcValuation: z.string().transform(Number),
});
export type FundingAsset = z.infer<typeof FundingAssetSchema>;
export const FundingAssetsResponseSchema = z.array(FundingAssetSchema);

export const UserAssetSchema = z.object({
  asset: z.string(),
  free: z.string().transform(Number),
  locked: z.string().transform(Number),
  freeze: z.string().transform(Number),
  withdrawing: z.string().transform(Number),
  ipoable: z.string().transform(Number),
  btcValuation: z.string().transform(Number),
});
export type UserAsset = z.infer<typeof UserAssetSchema>;
export const UserAssetsResponseSchema = z.array(UserAssetSchema);

export const DepositHistoryEntrySchema = z
  .object({
    id: z.string(),
    amount: z.string().transform(Number),
    coin: z.string(),
    network: z.string(),
    status: z.number(),
    address: z.string(),
    addressTag: z.string().optional(),
    txId: z.string(),
    insertTime: z.number(),
    transferType: z.number(),
    confirmTimes: z.string().optional(),
    unlockConfirm: z.union([z.string(), z.number()]).optional(),
    walletType: z.number().optional(),
  })
  .loose();
export type DepositHistoryEntry = z.infer<typeof DepositHistoryEntrySchema>;
export const DepositHistoryResponseSchema = z.array(DepositHistoryEntrySchema);

export const WithdrawHistoryEntrySchema = z
  .object({
    id: z.string(),
    amount: z.string().transform(Number),
    transactionFee: z.string().transform(Number),
    coin: z.string(),
    status: z.number(),
    address: z.string(),
    txId: z.string().optional(),
    applyTime: z.string(),
    network: z.string(),
    transferType: z.number(),
    withdrawOrderId: z.string().nullable().optional(),
    info: z.string().optional(),
    confirmNo: z.number().optional(),
    walletType: z.number().optional(),
  })
  .loose();
export type WithdrawHistoryEntry = z.infer<typeof WithdrawHistoryEntrySchema>;
export const WithdrawHistoryResponseSchema = z.array(WithdrawHistoryEntrySchema);

export const WithdrawParamsSchema = z.object({
  coin: z.string(),
  address: z.string(),
  amount: z.union([z.string(), z.number()]),
  withdrawOrderId: z.string().optional(),
  network: z.string().optional(),
  addressTag: z.string().optional(),
  transactionFeeFlag: z.boolean().optional(),
  name: z.string().optional(),
  walletType: z.number().optional(),
});
export type WithdrawParams = z.infer<typeof WithdrawParamsSchema>;

export const WithdrawResultSchema = z.object({ id: z.string() });
export type WithdrawResult = z.infer<typeof WithdrawResultSchema>;

export const DepositAddressSchema = z.object({
  address: z.string(),
  coin: z.string(),
  tag: z.string(),
  url: z.string().optional(),
});
export type DepositAddress = z.infer<typeof DepositAddressSchema>;

export const ApiKeyPermissionsSchema = z
  .object({
    ipRestrict: z.boolean(),
    createTime: z.number(),
    enableWithdrawals: z.boolean(),
    enableInternalTransfer: z.boolean(),
    enableFutures: z.boolean(),
    enableMargin: z.boolean(),
    enableSpotAndMarginTrading: z.boolean(),
    permitsUniversalTransfer: z.boolean().optional(),
    enableReading: z.boolean().optional(),
    tradingAuthorityExpirationTime: z.number().optional(),
  })
  .loose();
export type ApiKeyPermissions = z.infer<typeof ApiKeyPermissionsSchema>;

export const AssetDetailSchema = z.record(
  z.string(),
  z
    .object({
      minWithdrawAmount: z.string().transform(Number),
      depositStatus: z.boolean(),
      withdrawFee: z.number(),
      withdrawStatus: z.boolean(),
      depositTip: z.string().optional(),
    })
    .loose(),
);
export type AssetDetail = z.infer<typeof AssetDetailSchema>;

export const DustLogEntrySchema = z
  .object({
    transId: z.number(),
    serviceChargeAmount: z.string().transform(Number),
    amount: z.string().transform(Number),
    operateTime: z.string(),
    transferedAmount: z.string().transform(Number),
    fromAsset: z.string(),
  })
  .loose();
export type DustLogEntry = z.infer<typeof DustLogEntrySchema>;

export const DustLogResponseSchema = z.object({
  total: z.number(),
  userAssetDribblets: z.array(
    z.object({
      operateTime: z.number(),
      totalTransferedAmount: z.string().transform(Number),
      totalServiceChargeAmount: z.string().transform(Number),
      transId: z.number(),
      userAssetDribbletDetails: z.array(DustLogEntrySchema),
    }),
  ),
});
export type DustLogResponse = z.infer<typeof DustLogResponseSchema>;

export const DustConversionResultSchema = z
  .object({
    totalServiceCharge: z.string().transform(Number),
    totalTransfered: z.string().transform(Number),
    transferResult: z.array(
      z
        .object({
          amount: z.string().transform(Number),
          fromAsset: z.string(),
          operateTime: z.number(),
          serviceChargeAmount: z.string().transform(Number),
          tranId: z.number(),
          transferedAmount: z.string().transform(Number),
        })
        .loose(),
    ),
  })
  .loose();
export type DustConversionResult = z.infer<typeof DustConversionResultSchema>;

export const TradeFeeEntrySchema = z.object({
  symbol: z.string(),
  makerCommission: z.string().transform(Number),
  takerCommission: z.string().transform(Number),
});
export type TradeFeeEntry = z.infer<typeof TradeFeeEntrySchema>;
export const TradeFeeResponseSchema = z.array(TradeFeeEntrySchema);

export const AccountSnapshotSchema = z
  .object({
    code: z.number(),
    msg: z.string(),
    snapshotVos: z.array(
      z
        .object({
          type: z.string(),
          updateTime: z.number(),
          data: z.record(z.string(), z.unknown()),
        })
        .loose(),
    ),
  })
  .loose();
export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>;
