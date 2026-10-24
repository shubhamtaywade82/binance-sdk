# Wallet — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

50 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `wallet.getCountryListUserData` | GET | `/sapi/v1/localentity/country/list` | SIGNED | `wallet.getCountryListUserData` |
| `wallet.getRegionListUserData` | GET | `/sapi/v1/localentity/region/list` | SIGNED | `wallet.getRegionListUserData` |
| `wallet.getSpotAssetTagsMarketData` | GET | `/sapi/v1/spot/asset/tags` | API_KEY | `wallet.getSpotAssetTagsMarketData` |
| `wallet.accountApiTradingStatusUserData` | GET | `/sapi/v1/account/apiTradingStatus` | SIGNED | `wallet.accountApiTradingStatusUserData` |
| `wallet.accountInfoUserData` | GET | `/sapi/v1/account/info` | SIGNED | `wallet.accountInfoUserData` |
| `wallet.accountStatusUserData` | GET | `/sapi/v1/account/status` | SIGNED | `wallet.accountStatusUserData` |
| `wallet.fetchAddressVerificationListUserData` | GET | `/sapi/v1/addressVerify/list` | SIGNED | `wallet.fetchAddressVerificationListUserData` |
| `wallet.assetDividendRecordUserData` | GET | `/sapi/v1/asset/assetDividend` | SIGNED | `wallet.assetDividendRecordUserData` |
| `wallet.queryUserDelegationHistoryForMasterAccountUserData` | GET | `/sapi/v1/asset/custody/transfer-history` | SIGNED | `wallet.queryUserDelegationHistoryForMasterAccountUserData` |
| `wallet.getCloudMiningPaymentAndRefundHistoryUserData` | GET | `/sapi/v1/asset/ledger-transfer/cloud-mining/queryByPage` | SIGNED | `wallet.getCloudMiningPaymentAndRefundHistoryUserData` |
| `wallet.queryUserWalletBalanceUserData` | GET | `/sapi/v1/asset/wallet/balance` | SIGNED | `wallet.queryUserWalletBalanceUserData` |
| `wallet.allCoinsInformationUserData` | GET | `/sapi/v1/capital/config/getall` | SIGNED | `wallet.allCoinsInformationUserData` |
| `wallet.fetchDepositAddressListWithNetworkUserData` | GET | `/sapi/v1/capital/deposit/address/list` | SIGNED | `wallet.fetchDepositAddressListWithNetworkUserData` |
| `wallet.fetchWithdrawAddressListUserData` | GET | `/sapi/v1/capital/withdraw/address/list` | SIGNED | `wallet.fetchWithdrawAddressListUserData` |
| `wallet.fetchWithdrawQuotaUserData` | GET | `/sapi/v1/capital/withdraw/quota` | SIGNED | `wallet.fetchWithdrawQuotaUserData` |
| `wallet.depositHistoryForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData` | GET | `/sapi/v1/localentity/deposit/history` | SIGNED | `wallet.depositHistoryForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData` |
| `wallet.checkQuestionnaireRequirementsForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` | GET | `/sapi/v1/localentity/questionnaire-requirements` | SIGNED | `wallet.checkQuestionnaireRequirementsForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` |
| `wallet.vaspListForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` | GET | `/sapi/v1/localentity/vasp` | SIGNED | `wallet.vaspListForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` |
| `wallet.withdrawHistoryForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` | GET | `/sapi/v1/localentity/withdraw/history` | SIGNED | `wallet.withdrawHistoryForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` |
| `wallet.getSymbolsDelistScheduleForSpotMarketData` | GET | `/sapi/v1/spot/delist-schedule` | API_KEY | `wallet.getSymbolsDelistScheduleForSpotMarketData` |
| `wallet.getOpenSymbolListMarketData` | GET | `/sapi/v1/spot/open-symbol-list` | API_KEY | `wallet.getOpenSymbolListMarketData` |
| `wallet.systemStatusSystem` | GET | `/sapi/v1/system/status` | API_KEY | `wallet.systemStatusSystem` |
| `wallet.depositHistoryV2ForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData` | GET | `/sapi/v2/localentity/deposit/history` | SIGNED | `wallet.depositHistoryV2ForLocalEntitiesThatRequiredTravelRuleSupportingNetworkUserData` |
| `wallet.withdrawHistoryV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` | GET | `/sapi/v2/localentity/withdraw/history` | SIGNED | `wallet.withdrawHistoryV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` |
| `wallet.disableFastWithdrawSwitchUserData` | POST | `/sapi/v1/account/disableFastWithdrawSwitch` | SIGNED | `wallet.disableFastWithdrawSwitchUserData` |
| `wallet.enableFastWithdrawSwitchUserData` | POST | `/sapi/v1/account/enableFastWithdrawSwitch` | SIGNED | `wallet.enableFastWithdrawSwitchUserData` |
| `wallet.getAssetsThatCanBeConvertedIntoBnbUserData` | POST | `/sapi/v1/asset/dust-btc` | SIGNED | `wallet.getAssetsThatCanBeConvertedIntoBnbUserData` |
| `wallet.dustConvertUserData` | POST | `/sapi/v1/asset/dust-convert/convert` | SIGNED | `wallet.dustConvertUserData` |
| `wallet.dustConvertibleAssetsUserData` | POST | `/sapi/v1/asset/dust-convert/query-convertible-assets` | SIGNED | `wallet.dustConvertibleAssetsUserData` |
| `wallet.toggleBnbBurnOnSpotTradeAndMarginInterestUserData` | POST | `/sapi/v1/bnbBurn` | SIGNED | `wallet.toggleBnbBurnOnSpotTradeAndMarginInterestUserData` |
| `wallet.oneClickArrivalDepositApplyForExpiredAddressDepositUserData` | POST | `/sapi/v1/capital/deposit/credit-apply` | SIGNED | `wallet.oneClickArrivalDepositApplyForExpiredAddressDepositUserData` |
| `wallet.brokerWithdrawForBrokersOfLocalEntitiesThatRequireTravelRuleUserData` | POST | `/sapi/v1/localentity/broker/withdraw/apply` | SIGNED | `wallet.brokerWithdrawForBrokersOfLocalEntitiesThatRequireTravelRuleUserData` |
| `wallet.withdrawForLocalEntitiesThatRequireTravelRuleUserData` | POST | `/sapi/v1/localentity/withdraw/apply` | SIGNED | `wallet.withdrawForLocalEntitiesThatRequireTravelRuleUserData` |
| `wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserDataBroker` | PUT | `/sapi/v1/localentity/broker/deposit/provide-info` | SIGNED | `wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserDataBroker` |
| `wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` | PUT | `/sapi/v1/localentity/deposit/provide-info` | SIGNED | `wallet.submitDepositQuestionnaireForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` |
| `wallet.submitDepositQuestionnaireV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` | PUT | `/sapi/v2/localentity/deposit/provide-info` | SIGNED | `wallet.submitDepositQuestionnaireV2ForLocalEntitiesThatRequireTravelRuleSupportingNetworkUserData` |
| `transfer.universalTransfer` | POST | `/sapi/v1/asset/transfer` | SIGNED | `wallet.universalTransfer` |
| `transfer.universalTransferHistory` | GET | `/sapi/v1/asset/transfer` | SIGNED | `wallet.universalTransferHistory` |
| `account.fundingWallet` | POST | `/sapi/v1/asset/get-funding-asset` | SIGNED | `wallet.fundingWallet` |
| `account.userAsset` | POST | `/sapi/v3/asset/getUserAsset` | SIGNED | `wallet.userAsset` |
| `deposit.history` | GET | `/sapi/v1/capital/deposit/hisrec` | SIGNED | `wallet.depositHistory` |
| `withdraw.history` | GET | `/sapi/v1/capital/withdraw/history` | SIGNED | `wallet.withdrawHistory` |
| `withdraw.apply` | POST | `/sapi/v1/capital/withdraw/apply` | SIGNED | `wallet.withdraw` |
| `deposit.address` | GET | `/sapi/v1/capital/deposit/address` | SIGNED | `wallet.depositAddress` |
| `account.snapshot` | GET | `/sapi/v1/accountSnapshot` | SIGNED | `wallet.accountSnapshot` |
| `account.apiKeyPermissions` | GET | `/sapi/v1/account/apiRestrictions` | SIGNED | `wallet.apiKeyPermissions` |
| `account.assetDetail` | GET | `/sapi/v1/asset/assetDetail` | SIGNED | `wallet.assetDetail` |
| `account.dustLog` | GET | `/sapi/v1/asset/dribblet` | SIGNED | `wallet.dustLog` |
| `account.convertDustToBnb` | POST | `/sapi/v1/asset/dust` | SIGNED | `wallet.convertDustToBnb` |
| `account.tradeFee` | GET | `/sapi/v1/asset/tradeFee` | SIGNED | `wallet.tradeFee` |
