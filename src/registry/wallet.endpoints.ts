import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Wallet (SAPI). */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Wave 6: contract-first gap closure (Postman-driven) ----
  ["wallet.getCountryListUserData", "GET", "/sapi/v1/localentity/country/list", "signed", "wallet.getCountryListUserData"],
  ["wallet.getRegionListUserData", "GET", "/sapi/v1/localentity/region/list", "signed", "wallet.getRegionListUserData"],
  ["wallet.getSpotAssetTagsMarketData", "GET", "/sapi/v1/spot/asset/tags", "apiKey", "wallet.getSpotAssetTagsMarketData"],

  // ---- Wave 6: contract-first gap closure (Postman-driven) ----
  ["wallet.accountApiTradingStatusUserData", "GET", "/sapi/v1/account/apiTradingStatus", "signed", "wallet.accountApiTradingStatusUserData"],
  ["wallet.accountInfoUserData", "GET", "/sapi/v1/account/info", "signed", "wallet.accountInfoUserData"],
  ["wallet.accountStatusUserData", "GET", "/sapi/v1/account/status", "signed", "wallet.accountStatusUserData"],
  ["wallet.fetchAddressVerificationListUserData", "GET", "/sapi/v1/addressVerify/list", "signed", "wallet.fetchAddressVerificationListUserData"],
  ["wallet.assetDividendRecordUserData", "GET", "/sapi/v1/asset/assetDividend", "signed", "wallet.assetDividendRecordUserData"],
  ["wallet.queryUserDelegationHistoryForMasterAccountUserData", "GET", "/sapi/v1/asset/custody/transfer-history", "signed", "wallet.queryUserDelegationHistoryForMasterAccountUserData"],
  ["wallet.getCloudMiningPaymentAndRefundHistoryUserData", "GET", "/sapi/v1/asset/ledger-transfer/cloud-mining/queryByPage", "signed", "wallet.getCloudMiningPaymentAndRefundHistoryUserData"],
  ["wallet.queryUserWalletBalanceUserData", "GET", "/sapi/v1/asset/wallet/balance", "signed", "wallet.queryUserWalletBalanceUserData"],
  ["wallet.allCoinsInformationUserData", "GET", "/sapi/v1/capital/config/getall", "signed", "wallet.allCoinsInformationUserData"],
  ["wallet.fetchDepositAddressListWithNetworkUserData", "GET", "/sapi/v1/capital/deposit/address/list", "signed", "wallet.fetchDepositAddressListWithNetworkUserData"],
  ["wallet.fetchWithdrawAddressListUserData", "GET", "/sapi/v1/capital/withdraw/address/list", "signed", "wallet.fetchWithdrawAddressListUserData"],
  ["wallet.fetchWithdrawQuotaUserData", "GET", "/sapi/v1/capital/withdraw/quota", "signed", "wallet.fetchWithdrawQuotaUserData"],
  ["wallet.depositHistoryForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData", "GET", "/sapi/v1/localentity/deposit/history", "signed", "wallet.depositHistoryForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData"],
  ["wallet.checkQuestionnaireRequirementsForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData", "GET", "/sapi/v1/localentity/questionnaire-requirements", "signed", "wallet.checkQuestionnaireRequirementsForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData"],
  ["wallet.vaspListForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData", "GET", "/sapi/v1/localentity/vasp", "signed", "wallet.vaspListForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData"],
  ["wallet.withdrawHistoryForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData", "GET", "/sapi/v1/localentity/withdraw/history", "signed", "wallet.withdrawHistoryForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData"],
  ["wallet.getSymbolsDelistScheduleForSpotMarketData", "GET", "/sapi/v1/spot/delist-schedule", "apiKey", "wallet.getSymbolsDelistScheduleForSpotMarketData"],
  ["wallet.getOpenSymbolListMarketData", "GET", "/sapi/v1/spot/open-symbol-list", "apiKey", "wallet.getOpenSymbolListMarketData"],
  ["wallet.systemStatusSystem", "GET", "/sapi/v1/system/status", "apiKey", "wallet.systemStatusSystem"],
  ["wallet.depositHistoryV2ForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData", "GET", "/sapi/v2/localentity/deposit/history", "signed", "wallet.depositHistoryV2ForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData"],
  ["wallet.withdrawHistoryV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData", "GET", "/sapi/v2/localentity/withdraw/history", "signed", "wallet.withdrawHistoryV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData"],
  ["wallet.disableFastWithdrawSwitchUserData", "POST", "/sapi/v1/account/disableFastWithdrawSwitch", "signed", "wallet.disableFastWithdrawSwitchUserData"],
  ["wallet.enableFastWithdrawSwitchUserData", "POST", "/sapi/v1/account/enableFastWithdrawSwitch", "signed", "wallet.enableFastWithdrawSwitchUserData"],
  ["wallet.getAssetsThatCanBeConvertedIntoBnbUserData", "POST", "/sapi/v1/asset/dust-btc", "signed", "wallet.getAssetsThatCanBeConvertedIntoBnbUserData"],
  ["wallet.dustConvertUserData", "POST", "/sapi/v1/asset/dust-convert/convert", "signed", "wallet.dustConvertUserData"],
  ["wallet.dustConvertibleAssetsUserData", "POST", "/sapi/v1/asset/dust-convert/query-convertible-assets", "signed", "wallet.dustConvertibleAssetsUserData"],
  ["wallet.toggleBnbBurnOnSpotTradeAndMarginInterestUserData", "POST", "/sapi/v1/bnbBurn", "signed", "wallet.toggleBnbBurnOnSpotTradeAndMarginInterestUserData"],
  ["wallet.oneClickArrivalDepositApplyForExpiredAddressDepositUserData", "POST", "/sapi/v1/capital/deposit/credit-apply", "signed", "wallet.oneClickArrivalDepositApplyForExpiredAddressDepositUserData"],
  ["wallet.brokerWithdrawForBrokersOfLocalEntitiesThatRequireTravelRuleUserData", "POST", "/sapi/v1/localentity/broker/withdraw/apply", "signed", "wallet.brokerWithdrawForBrokersOfLocalEntitiesThatRequireTravelRuleUserData"],
  ["wallet.withdrawForLocalEntitiesThatRequireTravelRuleUserData", "POST", "/sapi/v1/localentity/withdraw/apply", "signed", "wallet.withdrawForLocalEntitiesThatRequireTravelRuleUserData"],
  ["wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserDataBroker", "PUT", "/sapi/v1/localentity/broker/deposit/provide-info", "signed", "wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserDataBroker"],
  ["wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData", "PUT", "/sapi/v1/localentity/deposit/provide-info", "signed", "wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData"],
  ["wallet.submitDepositQuestionnaireV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData", "PUT", "/sapi/v2/localentity/deposit/provide-info", "signed", "wallet.submitDepositQuestionnaireV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData"],

  ['transfer.universalTransfer', 'POST', '/sapi/v1/asset/transfer', 'signed', 'wallet.universalTransfer'],
  ['transfer.universalTransferHistory', 'GET', '/sapi/v1/asset/transfer', 'signed', 'wallet.universalTransferHistory'],
  ['account.fundingWallet', 'POST', '/sapi/v1/asset/get-funding-asset', 'signed', 'wallet.fundingWallet'],
  ['account.userAsset', 'POST', '/sapi/v3/asset/getUserAsset', 'signed', 'wallet.userAsset'],
  ['deposit.history', 'GET', '/sapi/v1/capital/deposit/hisrec', 'signed', 'wallet.depositHistory'],
  ['withdraw.history', 'GET', '/sapi/v1/capital/withdraw/history', 'signed', 'wallet.withdrawHistory'],
  ['withdraw.apply', 'POST', '/sapi/v1/capital/withdraw/apply', 'signed', 'wallet.withdraw'],
  ['deposit.address', 'GET', '/sapi/v1/capital/deposit/address', 'signed', 'wallet.depositAddress'],
  ['account.snapshot', 'GET', '/sapi/v1/accountSnapshot', 'signed', 'wallet.accountSnapshot'],
  ['account.apiKeyPermissions', 'GET', '/sapi/v1/account/apiRestrictions', 'signed', 'wallet.apiKeyPermissions'],
  ['account.assetDetail', 'GET', '/sapi/v1/asset/assetDetail', 'signed', 'wallet.assetDetail'],
  ['account.dustLog', 'GET', '/sapi/v1/asset/dribblet', 'signed', 'wallet.dustLog'],
  ['account.convertDustToBnb', 'POST', '/sapi/v1/asset/dust', 'signed', 'wallet.convertDustToBnb'],
  ['account.tradeFee', 'GET', '/sapi/v1/asset/tradeFee', 'signed', 'wallet.tradeFee'],
];

export const WALLET_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'wallet',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
