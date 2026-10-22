# Simple Earn — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

40 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `simpleEarn.getBfusdAccountUserData` | GET | `/sapi/v1/bfusd/account` | SIGNED | `simpleEarn.getBfusdAccountUserData` |
| `simpleEarn.getBfusdRateHistoryUserData` | GET | `/sapi/v1/bfusd/history/rateHistory` | SIGNED | `simpleEarn.getBfusdRateHistoryUserData` |
| `simpleEarn.getBfusdRedemptionHistoryUserData` | GET | `/sapi/v1/bfusd/history/redemptionHistory` | SIGNED | `simpleEarn.getBfusdRedemptionHistoryUserData` |
| `simpleEarn.getBfusdRewardsHistoryUserData` | GET | `/sapi/v1/bfusd/history/rewardsHistory` | SIGNED | `simpleEarn.getBfusdRewardsHistoryUserData` |
| `simpleEarn.getBfusdSubscriptionHistoryUserData` | GET | `/sapi/v1/bfusd/history/subscriptionHistory` | SIGNED | `simpleEarn.getBfusdSubscriptionHistoryUserData` |
| `simpleEarn.getBfusdQuotaDetailsUserData` | GET | `/sapi/v1/bfusd/quota` | SIGNED | `simpleEarn.getBfusdQuotaDetailsUserData` |
| `simpleEarn.redeemBfusdTrade` | POST | `/sapi/v1/bfusd/redeem` | SIGNED | `simpleEarn.redeemBfusdTrade` |
| `simpleEarn.subscribeBfusdTrade` | POST | `/sapi/v1/bfusd/subscribe` | SIGNED | `simpleEarn.subscribeBfusdTrade` |
| `simpleEarn.simpleAccountUserData` | GET | `/sapi/v1/simple-earn/account` | SIGNED | `simpleEarn.simpleAccountUserData` |
| `simpleEarn.getCollateralRecordUserData` | GET | `/sapi/v1/simple-earn/flexible/history/collateralRecord` | SIGNED | `simpleEarn.getCollateralRecordUserData` |
| `simpleEarn.getRateHistoryUserData` | GET | `/sapi/v1/simple-earn/flexible/history/rateHistory` | SIGNED | `simpleEarn.getRateHistoryUserData` |
| `simpleEarn.getFlexibleRedemptionRecordUserData` | GET | `/sapi/v1/simple-earn/flexible/history/redemptionRecord` | SIGNED | `simpleEarn.getFlexibleRedemptionRecordUserData` |
| `simpleEarn.getFlexibleRewardsHistoryUserData` | GET | `/sapi/v1/simple-earn/flexible/history/rewardsRecord` | SIGNED | `simpleEarn.getFlexibleRewardsHistoryUserData` |
| `simpleEarn.getFlexibleSubscriptionRecordUserData` | GET | `/sapi/v1/simple-earn/flexible/history/subscriptionRecord` | SIGNED | `simpleEarn.getFlexibleSubscriptionRecordUserData` |
| `simpleEarn.getSimpleEarnFlexibleProductListUserData` | GET | `/sapi/v1/simple-earn/flexible/list` | SIGNED | `simpleEarn.getSimpleEarnFlexibleProductListUserData` |
| `simpleEarn.getFlexiblePersonalLeftQuotaUserData` | GET | `/sapi/v1/simple-earn/flexible/personalLeftQuota` | SIGNED | `simpleEarn.getFlexiblePersonalLeftQuotaUserData` |
| `simpleEarn.getFlexibleProductPositionUserData` | GET | `/sapi/v1/simple-earn/flexible/position` | SIGNED | `simpleEarn.getFlexibleProductPositionUserData` |
| `simpleEarn.redeemFlexibleProductTrade` | POST | `/sapi/v1/simple-earn/flexible/redeem` | SIGNED | `simpleEarn.redeemFlexibleProductTrade` |
| `simpleEarn.setFlexibleAutoSubscribeUserData` | POST | `/sapi/v1/simple-earn/flexible/setAutoSubscribe` | SIGNED | `simpleEarn.setFlexibleAutoSubscribeUserData` |
| `simpleEarn.subscribeFlexibleProductTrade` | POST | `/sapi/v1/simple-earn/flexible/subscribe` | SIGNED | `simpleEarn.subscribeFlexibleProductTrade` |
| `simpleEarn.getFlexibleSubscriptionPreviewUserData` | GET | `/sapi/v1/simple-earn/flexible/subscriptionPreview` | SIGNED | `simpleEarn.getFlexibleSubscriptionPreviewUserData` |
| `simpleEarn.getLockedRedemptionRecordUserData` | GET | `/sapi/v1/simple-earn/locked/history/redemptionRecord` | SIGNED | `simpleEarn.getLockedRedemptionRecordUserData` |
| `simpleEarn.getLockedRewardsHistoryUserData` | GET | `/sapi/v1/simple-earn/locked/history/rewardsRecord` | SIGNED | `simpleEarn.getLockedRewardsHistoryUserData` |
| `simpleEarn.getLockedSubscriptionRecordUserData` | GET | `/sapi/v1/simple-earn/locked/history/subscriptionRecord` | SIGNED | `simpleEarn.getLockedSubscriptionRecordUserData` |
| `simpleEarn.getSimpleEarnLockedProductListUserData` | GET | `/sapi/v1/simple-earn/locked/list` | SIGNED | `simpleEarn.getSimpleEarnLockedProductListUserData` |
| `simpleEarn.getLockedPersonalLeftQuotaUserData` | GET | `/sapi/v1/simple-earn/locked/personalLeftQuota` | SIGNED | `simpleEarn.getLockedPersonalLeftQuotaUserData` |
| `simpleEarn.getLockedProductPosition` | GET | `/sapi/v1/simple-earn/locked/position` | SIGNED | `simpleEarn.getLockedProductPosition` |
| `simpleEarn.redeemLockedProductTrade` | POST | `/sapi/v1/simple-earn/locked/redeem` | SIGNED | `simpleEarn.redeemLockedProductTrade` |
| `simpleEarn.setLockedAutoSubscribeUserData` | POST | `/sapi/v1/simple-earn/locked/setAutoSubscribe` | SIGNED | `simpleEarn.setLockedAutoSubscribeUserData` |
| `simpleEarn.setLockedProductRedeemOptionUserData` | POST | `/sapi/v1/simple-earn/locked/setRedeemOption` | SIGNED | `simpleEarn.setLockedProductRedeemOptionUserData` |
| `simpleEarn.subscribeLockedProductTrade` | POST | `/sapi/v1/simple-earn/locked/subscribe` | SIGNED | `simpleEarn.subscribeLockedProductTrade` |
| `simpleEarn.getLockedSubscriptionPreviewUserData` | GET | `/sapi/v1/simple-earn/locked/subscriptionPreview` | SIGNED | `simpleEarn.getLockedSubscriptionPreviewUserData` |
| `simpleEarn.getRwusdAccountUserData` | GET | `/sapi/v1/rwusd/account` | SIGNED | `simpleEarn.getRwusdAccountUserData` |
| `simpleEarn.getRwusdRateHistoryUserData` | GET | `/sapi/v1/rwusd/history/rateHistory` | SIGNED | `simpleEarn.getRwusdRateHistoryUserData` |
| `simpleEarn.getRwusdRedemptionHistoryUserData` | GET | `/sapi/v1/rwusd/history/redemptionHistory` | SIGNED | `simpleEarn.getRwusdRedemptionHistoryUserData` |
| `simpleEarn.getRwusdRewardsHistoryUserData` | GET | `/sapi/v1/rwusd/history/rewardsHistory` | SIGNED | `simpleEarn.getRwusdRewardsHistoryUserData` |
| `simpleEarn.getRwusdSubscriptionHistoryUserData` | GET | `/sapi/v1/rwusd/history/subscriptionHistory` | SIGNED | `simpleEarn.getRwusdSubscriptionHistoryUserData` |
| `simpleEarn.getRwusdQuotaDetailsUserData` | GET | `/sapi/v1/rwusd/quota` | SIGNED | `simpleEarn.getRwusdQuotaDetailsUserData` |
| `simpleEarn.redeemRwusdTrade` | POST | `/sapi/v1/rwusd/redeem` | SIGNED | `simpleEarn.redeemRwusdTrade` |
| `simpleEarn.subscribeRwusdTrade` | POST | `/sapi/v1/rwusd/subscribe` | SIGNED | `simpleEarn.subscribeRwusdTrade` |
