import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Sub-account (SAPI). */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Wave 6: contract-first gap closure (Postman-driven) ----
  ["subaccount.deleteSubAccountApiKeyForMasterAccountUserData", "DELETE", "/sapi/v1/sub-account/subAccountApi", "signed", "subaccount.deleteSubAccountApiKeyForMasterAccountUserData"],
  ["subaccount.querySubAccountApiKeyForMasterAccountUserData", "GET", "/sapi/v1/sub-account/subAccountApi", "signed", "subaccount.querySubAccountApiKeyForMasterAccountUserData"],
  ["subaccount.createSubAccountApiKeyForMasterAccountUserData", "POST", "/sapi/v1/sub-account/subAccountApi", "signed", "subaccount.createSubAccountApiKeyForMasterAccountUserData"],
  ["subaccount.createSubAccountApiKeyV2ForMasterAccountUserData", "POST", "/sapi/v2/sub-account/subAccountApi", "signed", "subaccount.createSubAccountApiKeyV2ForMasterAccountUserData"],
  ["subaccount.modifySubAccountApiKeyPermissionForMasterAccountUserData", "POST", "/sapi/v1/sub-account/subAccountApiPermission", "signed", "subaccount.modifySubAccountApiKeyPermissionForMasterAccountUserData"],

  // ---- Wave 6: contract-first gap closure (Postman-driven) ----
  ["subaccount.deleteIpListForASubAccountApiKeyForMasterAccountUserData", "DELETE", "/sapi/v1/sub-account/subAccountApi/ipRestriction/ipList", "signed", "subaccount.deleteIpListForASubAccountApiKeyForMasterAccountUserData"],
  ["subaccount.queryManagedSubAccountSnapshotForInvestorMasterAccountUserData", "GET", "/sapi/v1/managed-subaccount/accountSnapshot", "signed", "subaccount.queryManagedSubAccountSnapshotForInvestorMasterAccountUserData"],
  ["subaccount.queryManagedSubAccountAssetDetailsForInvestorMasterAccountUserData", "GET", "/sapi/v1/managed-subaccount/asset", "signed", "subaccount.queryManagedSubAccountAssetDetailsForInvestorMasterAccountUserData"],
  ["subaccount.getManagedSubAccountDepositAddressForInvestorMasterAccountUserData", "GET", "/sapi/v1/managed-subaccount/deposit/address", "signed", "subaccount.getManagedSubAccountDepositAddressForInvestorMasterAccountUserData"],
  ["subaccount.queryManagedSubAccountFuturesAssetDetailsForInvestorMasterAccountUserData", "GET", "/sapi/v1/managed-subaccount/fetch-future-asset", "signed", "subaccount.queryManagedSubAccountFuturesAssetDetailsForInvestorMasterAccountUserData"],
  ["subaccount.queryManagedSubAccountListForInvestorUserData", "GET", "/sapi/v1/managed-subaccount/info", "signed", "subaccount.queryManagedSubAccountListForInvestorUserData"],
  ["subaccount.queryManagedSubAccountMarginAssetDetailsForInvestorMasterAccountUserData", "GET", "/sapi/v1/managed-subaccount/marginAsset", "signed", "subaccount.queryManagedSubAccountMarginAssetDetailsForInvestorMasterAccountUserData"],
  ["subaccount.queryManagedSubAccountTransferLogForTradingTeamSubAccountUserData", "GET", "/sapi/v1/managed-subaccount/query-trans-log", "signed", "subaccount.queryManagedSubAccountTransferLogForTradingTeamSubAccountUserData"],
  ["subaccount.queryManagedSubAccountTransferLogForInvestorMasterAccountUserData", "GET", "/sapi/v1/managed-subaccount/queryTransLogForInvestor", "signed", "subaccount.queryManagedSubAccountTransferLogForInvestorMasterAccountUserData"],
  ["subaccount.queryManagedSubAccountTransferLogForTradingTeamMasterAccountUserData", "GET", "/sapi/v1/managed-subaccount/queryTransLogForTradeParent", "signed", "subaccount.queryManagedSubAccountTransferLogForTradingTeamMasterAccountUserData"],
  ["subaccount.getDetailOnSubAccountSFuturesAccountForMasterAccountUserData", "GET", "/sapi/v1/sub-account/futures/account", "signed", "subaccount.getDetailOnSubAccountSFuturesAccountForMasterAccountUserData"],
  ["subaccount.getSummaryOfSubAccountSFuturesAccountForMasterAccountUserData", "GET", "/sapi/v1/sub-account/futures/accountSummary", "signed", "subaccount.getSummaryOfSubAccountSFuturesAccountForMasterAccountUserData"],
  ["subaccount.querySubAccountFuturesAssetTransferHistoryForMasterAccountUserData", "GET", "/sapi/v1/sub-account/futures/internalTransfer", "signed", "subaccount.querySubAccountFuturesAssetTransferHistoryForMasterAccountUserData"],
  ["subaccount.getMovePositionHistoryForSubAccountForMasterAccountUserData", "GET", "/sapi/v1/sub-account/futures/move-position", "signed", "subaccount.getMovePositionHistoryForSubAccountForMasterAccountUserData"],
  ["subaccount.getFuturesPositionRiskOfSubAccountForMasterAccountUserData", "GET", "/sapi/v1/sub-account/futures/positionRisk", "signed", "subaccount.getFuturesPositionRiskOfSubAccountForMasterAccountUserData"],
  ["subaccount.getSummaryOfSubAccountSMarginAccountForMasterAccountUserData", "GET", "/sapi/v1/sub-account/margin/accountSummary", "signed", "subaccount.getSummaryOfSubAccountSMarginAccountForMasterAccountUserData"],
  ["subaccount.querySubAccountSpotAssetTransferHistoryForMasterAccountUserData", "GET", "/sapi/v1/sub-account/sub/transfer/history", "signed", "subaccount.querySubAccountSpotAssetTransferHistoryForMasterAccountUserData"],
  ["subaccount.getIpRestrictionForASubAccountApiKeyForMasterAccountUserData", "GET", "/sapi/v1/sub-account/subAccountApi/ipRestriction", "signed", "subaccount.getIpRestrictionForASubAccountApiKeyForMasterAccountUserData"],
  ["subaccount.querySubAccountTransactionStatisticsForMasterAccountUserData", "GET", "/sapi/v1/sub-account/transaction-statistics", "signed", "subaccount.querySubAccountTransactionStatisticsForMasterAccountUserData"],
  ["subaccount.subAccountTransferHistoryForSubAccountUserData", "GET", "/sapi/v1/sub-account/transfer/subUserHistory", "signed", "subaccount.subAccountTransferHistoryForSubAccountUserData"],
  ["subaccount.getDetailOnSubAccountSFuturesAccountV2ForMasterAccountUserData", "GET", "/sapi/v2/sub-account/futures/account", "signed", "subaccount.getDetailOnSubAccountSFuturesAccountV2ForMasterAccountUserData"],
  ["subaccount.getFuturesPositionRiskOfSubAccountV2ForMasterAccountUserData", "GET", "/sapi/v2/sub-account/futures/positionRisk", "signed", "subaccount.getFuturesPositionRiskOfSubAccountV2ForMasterAccountUserData"],
  ["subaccount.querySubAccountAssetsForMasterAccountUserData", "GET", "/sapi/v4/sub-account/assets", "signed", "subaccount.querySubAccountAssetsForMasterAccountUserData"],
  ["subaccount.depositAssetsIntoTheManagedSubAccountForInvestorMasterAccountUserData", "POST", "/sapi/v1/managed-subaccount/deposit", "signed", "subaccount.depositAssetsIntoTheManagedSubAccountForInvestorMasterAccountUserData"],
  ["subaccount.withdrawlAssetsFromTheManagedSubAccountForInvestorMasterAccountUserData", "POST", "/sapi/v1/managed-subaccount/withdraw", "signed", "subaccount.withdrawlAssetsFromTheManagedSubAccountForInvestorMasterAccountUserData"],
  ["subaccount.enableOptionsForSubAccountForMasterAccountUserData", "POST", "/sapi/v1/sub-account/eoptions/enable", "signed", "subaccount.enableOptionsForSubAccountForMasterAccountUserData"],
  ["subaccount.subAccountFuturesAssetTransferForMasterAccountUserData", "POST", "/sapi/v1/sub-account/futures/internalTransfer", "signed", "subaccount.subAccountFuturesAssetTransferForMasterAccountUserData"],
  ["subaccount.movePositionForSubAccountForMasterAccountUserData", "POST", "/sapi/v1/sub-account/futures/move-position", "signed", "subaccount.movePositionForSubAccountForMasterAccountUserData"],
  ["subaccount.futuresTransferForSubAccountForMasterAccountUserData", "POST", "/sapi/v1/sub-account/futures/transfer", "signed", "subaccount.futuresTransferForSubAccountForMasterAccountUserData"],
  ["subaccount.marginTransferForSubAccountForMasterAccountUserData", "POST", "/sapi/v1/sub-account/margin/transfer", "signed", "subaccount.marginTransferForSubAccountForMasterAccountUserData"],
  ["subaccount.transferToMasterForSubAccountUserData", "POST", "/sapi/v1/sub-account/transfer/subToMaster", "signed", "subaccount.transferToMasterForSubAccountUserData"],
  ["subaccount.transferToSubAccountOfSameMasterForSubAccountUserData", "POST", "/sapi/v1/sub-account/transfer/subToSub", "signed", "subaccount.transferToSubAccountOfSameMasterForSubAccountUserData"],
  ["subaccount.addIpRestrictionForSubAccountApiKeyForMasterAccountUserData", "POST", "/sapi/v2/sub-account/subAccountApi/ipRestriction", "signed", "subaccount.addIpRestrictionForSubAccountApiKeyForMasterAccountUserData"],

  ['subaccount.list', 'GET', '/sapi/v1/sub-account/list', 'signed', 'subaccount.list'],
  ['subaccount.status', 'GET', '/sapi/v1/sub-account/status', 'signed', 'subaccount.status'],
  ['subaccount.spotAssets', 'GET', '/sapi/v3/sub-account/assets', 'signed', 'subaccount.spotAssets'],
  ['subaccount.spotSummary', 'GET', '/sapi/v1/sub-account/spotSummary', 'signed', 'subaccount.spotSummary'],
  ['subaccount.futuresAccountSummary', 'GET', '/sapi/v2/sub-account/futures/accountSummary', 'signed', 'subaccount.futuresAccountSummary'],
  ['subaccount.marginAccount', 'GET', '/sapi/v1/sub-account/margin/account', 'signed', 'subaccount.marginAccount'],
  ['subaccount.universalTransfer', 'POST', '/sapi/v1/sub-account/universalTransfer', 'signed', 'subaccount.universalTransfer'],
  ['subaccount.universalTransferHistory', 'GET', '/sapi/v1/sub-account/universalTransfer', 'signed', 'subaccount.universalTransferHistory'],
  ['subaccount.createVirtual', 'POST', '/sapi/v1/sub-account/virtualSubAccount', 'signed', 'subaccount.createVirtualSubAccount'],
  ['subaccount.enableFutures', 'POST', '/sapi/v1/sub-account/futures/enable', 'signed', 'subaccount.enableFutures'],
  ['subaccount.enableMargin', 'POST', '/sapi/v1/sub-account/margin/enable', 'signed', 'subaccount.enableMargin'],
  ['subaccount.depositAddress', 'GET', '/sapi/v1/capital/deposit/subAddress', 'signed', 'subaccount.depositAddress'],
  ['subaccount.depositHistory', 'GET', '/sapi/v1/capital/deposit/subHisrec', 'signed', 'subaccount.depositHistory'],
];

export const SUBACCOUNT_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'subaccount',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
