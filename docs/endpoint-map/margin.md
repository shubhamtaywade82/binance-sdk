# Margin — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

71 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `margin.closeUserDataStreamV2UserStream` | DELETE | `/sapi/v2/margin/listen-key` | API_KEY | `margin.closeUserDataStreamV2UserStream` |
| `margin.queryLiquidationLoanUserData` | GET | `/sapi/v1/margin/liquidation-loan` | SIGNED | `margin.queryLiquidationLoanUserData` |
| `margin.queryLiquidationLoanRepayHistoryUserData` | GET | `/sapi/v1/margin/liquidation-loan/repay-history` | SIGNED | `margin.queryLiquidationLoanRepayHistoryUserData` |
| `margin.queryMarginAccountSOpenOtoOtocoOrderListsUserData` | GET | `/sapi/v1/margin/oto/openOrderList` | SIGNED | `margin.queryMarginAccountSOpenOtoOtocoOrderListsUserData` |
| `margin.exitSpecialKeyModeTrade` | POST | `/sapi/v1/margin/exit-special-key-mode` | SIGNED | `margin.exitSpecialKeyModeTrade` |
| `margin.liquidationLoanRepayMargin` | POST | `/sapi/v1/margin/liquidation-loan/repay` | SIGNED | `margin.liquidationLoanRepayMargin` |
| `margin.startUserDataStreamV2UserStream` | POST | `/sapi/v2/margin/listen-key` | API_KEY | `margin.startUserDataStreamV2UserStream` |
| `margin.keepaliveUserDataStreamV2UserStream` | PUT | `/sapi/v2/margin/listen-key` | API_KEY | `margin.keepaliveUserDataStreamV2UserStream` |
| `margin.deleteSpecialKeyLowLatencyTradingTrade` | DELETE | `/sapi/v1/margin/apiKey` | SIGNED | `margin.deleteSpecialKeyLowLatencyTradingTrade` |
| `margin.disableIsolatedMarginAccountTrade` | DELETE | `/sapi/v1/margin/isolated/account` | SIGNED | `margin.disableIsolatedMarginAccountTrade` |
| `margin.closeUserDataStreamUserStream` | DELETE | `/sapi/v1/margin/listen-key` | API_KEY | `margin.closeUserDataStreamUserStream` |
| `margin.marginAccountCancelOcoTrade` | DELETE | `/sapi/v1/margin/orderList` | SIGNED | `margin.marginAccountCancelOcoTrade` |
| `margin.getBnbBurnStatusUserData` | GET | `/sapi/v1/bnbBurn` | SIGNED | `margin.getBnbBurnStatusUserData` |
| `margin.getAllMarginAssetsMarketData` | GET | `/sapi/v1/margin/allAssets` | API_KEY | `margin.getAllMarginAssetsMarketData` |
| `margin.queryMarginAccountSAllOcoUserData` | GET | `/sapi/v1/margin/allOrderList` | SIGNED | `margin.queryMarginAccountSAllOcoUserData` |
| `margin.getAllCrossMarginPairsMarketData` | GET | `/sapi/v1/margin/allPairs` | API_KEY | `margin.getAllCrossMarginPairsMarketData` |
| `margin.querySpecialKeyListLowLatencyTradingTrade` | GET | `/sapi/v1/margin/api-key-list` | SIGNED | `margin.querySpecialKeyListLowLatencyTradingTrade` |
| `margin.querySpecialKeyLowLatencyTradingTrade` | GET | `/sapi/v1/margin/apiKey` | SIGNED | `margin.querySpecialKeyLowLatencyTradingTrade` |
| `margin.queryMarginAvailableInventoryUserData` | GET | `/sapi/v1/margin/available-inventory` | SIGNED | `margin.queryMarginAvailableInventoryUserData` |
| `margin.queryCrossIsolatedMarginCapitalFlowUserData` | GET | `/sapi/v1/margin/capital-flow` | SIGNED | `margin.queryCrossIsolatedMarginCapitalFlowUserData` |
| `margin.crossMarginCollateralRatioMarketData` | GET | `/sapi/v1/margin/crossMarginCollateralRatio` | API_KEY | `margin.crossMarginCollateralRatioMarketData` |
| `margin.queryCrossMarginFeeDataUserData` | GET | `/sapi/v1/margin/crossMarginData` | SIGNED | `margin.queryCrossMarginFeeDataUserData` |
| `margin.getDelistScheduleMarketData` | GET | `/sapi/v1/margin/delist-schedule` | API_KEY | `margin.getDelistScheduleMarketData` |
| `margin.getSmallLiabilityExchangeCoinListUserData` | GET | `/sapi/v1/margin/exchange-small-liability` | SIGNED | `margin.getSmallLiabilityExchangeCoinListUserData` |
| `margin.getSmallLiabilityExchangeHistoryUserData` | GET | `/sapi/v1/margin/exchange-small-liability-history` | SIGNED | `margin.getSmallLiabilityExchangeHistoryUserData` |
| `margin.queryMarginInterestRateHistoryUserData` | GET | `/sapi/v1/margin/interestRateHistory` | SIGNED | `margin.queryMarginInterestRateHistoryUserData` |
| `margin.queryEnabledIsolatedMarginAccountLimitUserData` | GET | `/sapi/v1/margin/isolated/accountLimit` | SIGNED | `margin.queryEnabledIsolatedMarginAccountLimitUserData` |
| `margin.getAllIsolatedMarginSymbolMarketData` | GET | `/sapi/v1/margin/isolated/allPairs` | API_KEY | `margin.getAllIsolatedMarginSymbolMarketData` |
| `margin.queryIsolatedMarginFeeDataUserData` | GET | `/sapi/v1/margin/isolatedMarginData` | SIGNED | `margin.queryIsolatedMarginFeeDataUserData` |
| `margin.queryIsolatedMarginTierDataUserData` | GET | `/sapi/v1/margin/isolatedMarginTier` | SIGNED | `margin.queryIsolatedMarginTierDataUserData` |
| `margin.queryLiabilityCoinLeverageBracketInCrossMarginProModeMarketData` | GET | `/sapi/v1/margin/leverageBracket` | API_KEY | `margin.queryLiabilityCoinLeverageBracketInCrossMarginProModeMarketData` |
| `margin.getLimitPricePairsMarketData` | GET | `/sapi/v1/margin/limit-price-pairs` | API_KEY | `margin.getLimitPricePairsMarketData` |
| `margin.getListScheduleMarketData` | GET | `/sapi/v1/margin/list-schedule` | API_KEY | `margin.getListScheduleMarketData` |
| `margin.queryPreventedMatchesUserData` | GET | `/sapi/v1/margin/myPreventedMatches` | SIGNED | `margin.queryPreventedMatchesUserData` |
| `margin.getFutureHourlyInterestRateUserData` | GET | `/sapi/v1/margin/next-hourly-interest-rate` | SIGNED | `margin.getFutureHourlyInterestRateUserData` |
| `margin.queryMarginAccountSOpenOcoUserData` | GET | `/sapi/v1/margin/openOrderList` | SIGNED | `margin.queryMarginAccountSOpenOcoUserData` |
| `margin.queryMarginAccountSOcoUserData` | GET | `/sapi/v1/margin/orderList` | SIGNED | `margin.queryMarginAccountSOcoUserData` |
| `margin.queryCurrentMarginOrderCountUsageTrade` | GET | `/sapi/v1/margin/rateLimit/order` | SIGNED | `margin.queryCurrentMarginOrderCountUsageTrade` |
| `margin.getMarginRestrictedAssetsMarketData` | GET | `/sapi/v1/margin/restricted-asset` | API_KEY | `margin.getMarginRestrictedAssetsMarketData` |
| `margin.getMarginAssetRiskBasedLiquidationRatioMarketData` | GET | `/sapi/v1/margin/risk-based-liquidation-ratio` | API_KEY | `margin.getMarginAssetRiskBasedLiquidationRatioMarketData` |
| `margin.getSummaryOfMarginAccountUserData` | GET | `/sapi/v1/margin/tradeCoeff` | SIGNED | `margin.getSummaryOfMarginAccountUserData` |
| `margin.getCrossMarginTransferHistoryUserData` | GET | `/sapi/v1/margin/transfer` | SIGNED | `margin.getCrossMarginTransferHistoryUserData` |
| `margin.createSpecialKeyLowLatencyTradingTrade` | POST | `/sapi/v1/margin/apiKey` | SIGNED | `margin.createSpecialKeyLowLatencyTradingTrade` |
| `margin.smallLiabilityExchangeMargin` | POST | `/sapi/v1/margin/exchange-small-liability` | SIGNED | `margin.smallLiabilityExchangeMargin` |
| `margin.enableIsolatedMarginAccountTrade` | POST | `/sapi/v1/margin/isolated/account` | SIGNED | `margin.enableIsolatedMarginAccountTrade` |
| `margin.startUserDataStreamUserStream` | POST | `/sapi/v1/margin/listen-key` | API_KEY | `margin.startUserDataStreamUserStream` |
| `margin.marginManualLiquidationMargin` | POST | `/sapi/v1/margin/manual-liquidation` | SIGNED | `margin.marginManualLiquidationMargin` |
| `margin.adjustCrossMarginMaxLeverageUserData` | POST | `/sapi/v1/margin/max-leverage` | SIGNED | `margin.adjustCrossMarginMaxLeverageUserData` |
| `margin.marginAccountNewOcoTrade` | POST | `/sapi/v1/margin/order/oco` | SIGNED | `margin.marginAccountNewOcoTrade` |
| `margin.marginAccountNewOtoTrade` | POST | `/sapi/v1/margin/order/oto` | SIGNED | `margin.marginAccountNewOtoTrade` |
| `margin.marginAccountNewOtocoTrade` | POST | `/sapi/v1/margin/order/otoco` | SIGNED | `margin.marginAccountNewOtocoTrade` |
| `margin.editIpForSpecialKeyLowLatencyTradingTrade` | PUT | `/sapi/v1/margin/apiKey/ip` | SIGNED | `margin.editIpForSpecialKeyLowLatencyTradingTrade` |
| `margin.keepaliveUserDataStreamUserStream` | PUT | `/sapi/v1/margin/listen-key` | API_KEY | `margin.keepaliveUserDataStreamUserStream` |
| `account.crossMarginAccount` | GET | `/sapi/v1/margin/account` | SIGNED | `margin.account.crossAccount` |
| `account.isolatedMarginAccount` | GET | `/sapi/v1/margin/isolated/account` | SIGNED | `margin.account.isolatedAccount` |
| `account.maxBorrowable` | GET | `/sapi/v1/margin/maxBorrowable` | SIGNED | `margin.account.maxBorrowable` |
| `account.maxTransferable` | GET | `/sapi/v1/margin/maxTransferable` | SIGNED | `margin.account.maxTransferable` |
| `borrowRepay.record` | GET | `/sapi/v1/margin/borrow-repay` | SIGNED | `margin.account.borrowRepayRecord` |
| `account.interestHistory` | GET | `/sapi/v1/margin/interestHistory` | SIGNED | `margin.account.interestHistory` |
| `account.forceLiquidationRecord` | GET | `/sapi/v1/margin/forceLiquidationRec` | SIGNED | `margin.account.forceLiquidationRecord` |
| `account.priceIndex` | GET | `/sapi/v1/margin/priceIndex` | PUBLIC | `margin.account.priceIndex` |
| `trading.borrowRepay` | POST | `/sapi/v1/margin/borrow-repay` | SIGNED | `margin.trading.borrowRepay` |
| `transfer.crossMargin` | POST | `/sapi/v1/margin/transfer` | SIGNED | `margin.trading.transfer` |
| `transfer.isolatedMargin` | POST | `/sapi/v1/margin/isolated/transfer` | SIGNED | `margin.trading.isolatedTransfer` |
| `trading.createOrder` | POST | `/sapi/v1/margin/order` | SIGNED | `margin.trading.createOrder` |
| `trading.cancelOrder` | DELETE | `/sapi/v1/margin/order` | SIGNED | `margin.trading.cancelOrder` |
| `trading.cancelAllOpenOrders` | DELETE | `/sapi/v1/margin/openOrders` | SIGNED | `margin.trading.cancelAllOpenOrders` |
| `trading.getOrder` | GET | `/sapi/v1/margin/order` | SIGNED | `margin.trading.getOrder` |
| `trading.getOpenOrders` | GET | `/sapi/v1/margin/openOrders` | SIGNED | `margin.trading.getOpenOrders` |
| `trading.getAllOrders` | GET | `/sapi/v1/margin/allOrders` | SIGNED | `margin.trading.getAllOrders` |
| `trading.myTrades` | GET | `/sapi/v1/margin/myTrades` | SIGNED | `margin.trading.myTrades` |
