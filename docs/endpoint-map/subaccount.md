# Sub-account — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

51 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `subaccount.deleteSubAccountApiKeyForMasterAccountUserData` | DELETE | `/sapi/v1/sub-account/subAccountApi` | SIGNED | `subaccount.deleteSubAccountApiKeyForMasterAccountUserData` |
| `subaccount.querySubAccountApiKeyForMasterAccountUserData` | GET | `/sapi/v1/sub-account/subAccountApi` | SIGNED | `subaccount.querySubAccountApiKeyForMasterAccountUserData` |
| `subaccount.createSubAccountApiKeyForMasterAccountUserData` | POST | `/sapi/v1/sub-account/subAccountApi` | SIGNED | `subaccount.createSubAccountApiKeyForMasterAccountUserData` |
| `subaccount.createSubAccountApiKeyV2ForMasterAccountUserData` | POST | `/sapi/v2/sub-account/subAccountApi` | SIGNED | `subaccount.createSubAccountApiKeyV2ForMasterAccountUserData` |
| `subaccount.modifySubAccountApiKeyPermissionForMasterAccountUserData` | POST | `/sapi/v1/sub-account/subAccountApiPermission` | SIGNED | `subaccount.modifySubAccountApiKeyPermissionForMasterAccountUserData` |
| `subaccount.deleteIpListForASubAccountApiKeyForMasterAccountUserData` | DELETE | `/sapi/v1/sub-account/subAccountApi/ipRestriction/ipList` | SIGNED | `subaccount.deleteIpListForASubAccountApiKeyForMasterAccountUserData` |
| `subaccount.queryManagedSubAccountSnapshotForInvestorMasterAccountUserData` | GET | `/sapi/v1/managed-subaccount/accountSnapshot` | SIGNED | `subaccount.queryManagedSubAccountSnapshotForInvestorMasterAccountUserData` |
| `subaccount.queryManagedSubAccountAssetDetailsForInvestorMasterAccountUserData` | GET | `/sapi/v1/managed-subaccount/asset` | SIGNED | `subaccount.queryManagedSubAccountAssetDetailsForInvestorMasterAccountUserData` |
| `subaccount.getManagedSubAccountDepositAddressForInvestorMasterAccountUserData` | GET | `/sapi/v1/managed-subaccount/deposit/address` | SIGNED | `subaccount.getManagedSubAccountDepositAddressForInvestorMasterAccountUserData` |
| `subaccount.queryManagedSubAccountFuturesAssetDetailsForInvestorMasterAccountUserData` | GET | `/sapi/v1/managed-subaccount/fetch-future-asset` | SIGNED | `subaccount.queryManagedSubAccountFuturesAssetDetailsForInvestorMasterAccountUserData` |
| `subaccount.queryManagedSubAccountListForInvestorUserData` | GET | `/sapi/v1/managed-subaccount/info` | SIGNED | `subaccount.queryManagedSubAccountListForInvestorUserData` |
| `subaccount.queryManagedSubAccountMarginAssetDetailsForInvestorMasterAccountUserData` | GET | `/sapi/v1/managed-subaccount/marginAsset` | SIGNED | `subaccount.queryManagedSubAccountMarginAssetDetailsForInvestorMasterAccountUserData` |
| `subaccount.queryManagedSubAccountTransferLogForTradingTeamSubAccountUserData` | GET | `/sapi/v1/managed-subaccount/query-trans-log` | SIGNED | `subaccount.queryManagedSubAccountTransferLogForTradingTeamSubAccountUserData` |
| `subaccount.queryManagedSubAccountTransferLogForInvestorMasterAccountUserData` | GET | `/sapi/v1/managed-subaccount/queryTransLogForInvestor` | SIGNED | `subaccount.queryManagedSubAccountTransferLogForInvestorMasterAccountUserData` |
| `subaccount.queryManagedSubAccountTransferLogForTradingTeamMasterAccountUserData` | GET | `/sapi/v1/managed-subaccount/queryTransLogForTradeParent` | SIGNED | `subaccount.queryManagedSubAccountTransferLogForTradingTeamMasterAccountUserData` |
| `subaccount.getDetailOnSubAccountSFuturesAccountForMasterAccountUserData` | GET | `/sapi/v1/sub-account/futures/account` | SIGNED | `subaccount.getDetailOnSubAccountSFuturesAccountForMasterAccountUserData` |
| `subaccount.getSummaryOfSubAccountSFuturesAccountForMasterAccountUserData` | GET | `/sapi/v1/sub-account/futures/accountSummary` | SIGNED | `subaccount.getSummaryOfSubAccountSFuturesAccountForMasterAccountUserData` |
| `subaccount.querySubAccountFuturesAssetTransferHistoryForMasterAccountUserData` | GET | `/sapi/v1/sub-account/futures/internalTransfer` | SIGNED | `subaccount.querySubAccountFuturesAssetTransferHistoryForMasterAccountUserData` |
| `subaccount.getMovePositionHistoryForSubAccountForMasterAccountUserData` | GET | `/sapi/v1/sub-account/futures/move-position` | SIGNED | `subaccount.getMovePositionHistoryForSubAccountForMasterAccountUserData` |
| `subaccount.getFuturesPositionRiskOfSubAccountForMasterAccountUserData` | GET | `/sapi/v1/sub-account/futures/positionRisk` | SIGNED | `subaccount.getFuturesPositionRiskOfSubAccountForMasterAccountUserData` |
| `subaccount.getSummaryOfSubAccountSMarginAccountForMasterAccountUserData` | GET | `/sapi/v1/sub-account/margin/accountSummary` | SIGNED | `subaccount.getSummaryOfSubAccountSMarginAccountForMasterAccountUserData` |
| `subaccount.querySubAccountSpotAssetTransferHistoryForMasterAccountUserData` | GET | `/sapi/v1/sub-account/sub/transfer/history` | SIGNED | `subaccount.querySubAccountSpotAssetTransferHistoryForMasterAccountUserData` |
| `subaccount.getIpRestrictionForASubAccountApiKeyForMasterAccountUserData` | GET | `/sapi/v1/sub-account/subAccountApi/ipRestriction` | SIGNED | `subaccount.getIpRestrictionForASubAccountApiKeyForMasterAccountUserData` |
| `subaccount.querySubAccountTransactionStatisticsForMasterAccountUserData` | GET | `/sapi/v1/sub-account/transaction-statistics` | SIGNED | `subaccount.querySubAccountTransactionStatisticsForMasterAccountUserData` |
| `subaccount.subAccountTransferHistoryForSubAccountUserData` | GET | `/sapi/v1/sub-account/transfer/subUserHistory` | SIGNED | `subaccount.subAccountTransferHistoryForSubAccountUserData` |
| `subaccount.getDetailOnSubAccountSFuturesAccountV2ForMasterAccountUserData` | GET | `/sapi/v2/sub-account/futures/account` | SIGNED | `subaccount.getDetailOnSubAccountSFuturesAccountV2ForMasterAccountUserData` |
| `subaccount.getFuturesPositionRiskOfSubAccountV2ForMasterAccountUserData` | GET | `/sapi/v2/sub-account/futures/positionRisk` | SIGNED | `subaccount.getFuturesPositionRiskOfSubAccountV2ForMasterAccountUserData` |
| `subaccount.querySubAccountAssetsForMasterAccountUserData` | GET | `/sapi/v4/sub-account/assets` | SIGNED | `subaccount.querySubAccountAssetsForMasterAccountUserData` |
| `subaccount.depositAssetsIntoTheManagedSubAccountForInvestorMasterAccountUserData` | POST | `/sapi/v1/managed-subaccount/deposit` | SIGNED | `subaccount.depositAssetsIntoTheManagedSubAccountForInvestorMasterAccountUserData` |
| `subaccount.withdrawlAssetsFromTheManagedSubAccountForInvestorMasterAccountUserData` | POST | `/sapi/v1/managed-subaccount/withdraw` | SIGNED | `subaccount.withdrawlAssetsFromTheManagedSubAccountForInvestorMasterAccountUserData` |
| `subaccount.enableOptionsForSubAccountForMasterAccountUserData` | POST | `/sapi/v1/sub-account/eoptions/enable` | SIGNED | `subaccount.enableOptionsForSubAccountForMasterAccountUserData` |
| `subaccount.subAccountFuturesAssetTransferForMasterAccountUserData` | POST | `/sapi/v1/sub-account/futures/internalTransfer` | SIGNED | `subaccount.subAccountFuturesAssetTransferForMasterAccountUserData` |
| `subaccount.movePositionForSubAccountForMasterAccountUserData` | POST | `/sapi/v1/sub-account/futures/move-position` | SIGNED | `subaccount.movePositionForSubAccountForMasterAccountUserData` |
| `subaccount.futuresTransferForSubAccountForMasterAccountUserData` | POST | `/sapi/v1/sub-account/futures/transfer` | SIGNED | `subaccount.futuresTransferForSubAccountForMasterAccountUserData` |
| `subaccount.marginTransferForSubAccountForMasterAccountUserData` | POST | `/sapi/v1/sub-account/margin/transfer` | SIGNED | `subaccount.marginTransferForSubAccountForMasterAccountUserData` |
| `subaccount.transferToMasterForSubAccountUserData` | POST | `/sapi/v1/sub-account/transfer/subToMaster` | SIGNED | `subaccount.transferToMasterForSubAccountUserData` |
| `subaccount.transferToSubAccountOfSameMasterForSubAccountUserData` | POST | `/sapi/v1/sub-account/transfer/subToSub` | SIGNED | `subaccount.transferToSubAccountOfSameMasterForSubAccountUserData` |
| `subaccount.addIpRestrictionForSubAccountApiKeyForMasterAccountUserData` | POST | `/sapi/v2/sub-account/subAccountApi/ipRestriction` | SIGNED | `subaccount.addIpRestrictionForSubAccountApiKeyForMasterAccountUserData` |
| `subaccount.list` | GET | `/sapi/v1/sub-account/list` | SIGNED | `subaccount.list` |
| `subaccount.status` | GET | `/sapi/v1/sub-account/status` | SIGNED | `subaccount.status` |
| `subaccount.spotAssets` | GET | `/sapi/v3/sub-account/assets` | SIGNED | `subaccount.spotAssets` |
| `subaccount.spotSummary` | GET | `/sapi/v1/sub-account/spotSummary` | SIGNED | `subaccount.spotSummary` |
| `subaccount.futuresAccountSummary` | GET | `/sapi/v2/sub-account/futures/accountSummary` | SIGNED | `subaccount.futuresAccountSummary` |
| `subaccount.marginAccount` | GET | `/sapi/v1/sub-account/margin/account` | SIGNED | `subaccount.marginAccount` |
| `subaccount.universalTransfer` | POST | `/sapi/v1/sub-account/universalTransfer` | SIGNED | `subaccount.universalTransfer` |
| `subaccount.universalTransferHistory` | GET | `/sapi/v1/sub-account/universalTransfer` | SIGNED | `subaccount.universalTransferHistory` |
| `subaccount.createVirtual` | POST | `/sapi/v1/sub-account/virtualSubAccount` | SIGNED | `subaccount.createVirtualSubAccount` |
| `subaccount.enableFutures` | POST | `/sapi/v1/sub-account/futures/enable` | SIGNED | `subaccount.enableFutures` |
| `subaccount.enableMargin` | POST | `/sapi/v1/sub-account/margin/enable` | SIGNED | `subaccount.enableMargin` |
| `subaccount.depositAddress` | GET | `/sapi/v1/capital/deposit/subAddress` | SIGNED | `subaccount.depositAddress` |
| `subaccount.depositHistory` | GET | `/sapi/v1/capital/deposit/subHisrec` | SIGNED | `subaccount.depositHistory` |
