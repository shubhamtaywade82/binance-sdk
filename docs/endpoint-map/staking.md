# Staking — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

37 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `staking.onChainYieldsAccountUserData` | GET | `/sapi/v1/onchain-yields/account` | SIGNED | `staking.onChainYieldsAccountUserData` |
| `staking.getOnChainYieldsLockedRedemptionRecordUserData` | GET | `/sapi/v1/onchain-yields/locked/history/redemptionRecord` | SIGNED | `staking.getOnChainYieldsLockedRedemptionRecordUserData` |
| `staking.getOnChainYieldsLockedRewardsHistoryUserData` | GET | `/sapi/v1/onchain-yields/locked/history/rewardsRecord` | SIGNED | `staking.getOnChainYieldsLockedRewardsHistoryUserData` |
| `staking.getOnChainYieldsLockedSubscriptionRecordUserData` | GET | `/sapi/v1/onchain-yields/locked/history/subscriptionRecord` | SIGNED | `staking.getOnChainYieldsLockedSubscriptionRecordUserData` |
| `staking.getOnChainYieldsLockedProductListUserData` | GET | `/sapi/v1/onchain-yields/locked/list` | SIGNED | `staking.getOnChainYieldsLockedProductListUserData` |
| `staking.getOnChainYieldsLockedPersonalLeftQuotaUserData` | GET | `/sapi/v1/onchain-yields/locked/personalLeftQuota` | SIGNED | `staking.getOnChainYieldsLockedPersonalLeftQuotaUserData` |
| `staking.getOnChainYieldsLockedProductPositionUserData` | GET | `/sapi/v1/onchain-yields/locked/position` | SIGNED | `staking.getOnChainYieldsLockedProductPositionUserData` |
| `staking.redeemOnChainYieldsLockedProductTrade` | POST | `/sapi/v1/onchain-yields/locked/redeem` | SIGNED | `staking.redeemOnChainYieldsLockedProductTrade` |
| `staking.setOnChainYieldsLockedAutoSubscribeUserData` | POST | `/sapi/v1/onchain-yields/locked/setAutoSubscribe` | SIGNED | `staking.setOnChainYieldsLockedAutoSubscribeUserData` |
| `staking.setOnChainYieldsLockedProductRedeemOptionUserData` | POST | `/sapi/v1/onchain-yields/locked/setRedeemOption` | SIGNED | `staking.setOnChainYieldsLockedProductRedeemOptionUserData` |
| `staking.subscribeOnChainYieldsLockedProductTrade` | POST | `/sapi/v1/onchain-yields/locked/subscribe` | SIGNED | `staking.subscribeOnChainYieldsLockedProductTrade` |
| `staking.getOnChainYieldsLockedSubscriptionPreviewUserData` | GET | `/sapi/v1/onchain-yields/locked/subscriptionPreview` | SIGNED | `staking.getOnChainYieldsLockedSubscriptionPreviewUserData` |
| `staking.getSoftStakingRewardsHistoryUserData` | GET | `/sapi/v1/soft-staking/history/rewardsRecord` | SIGNED | `staking.getSoftStakingRewardsHistoryUserData` |
| `staking.getSoftStakingProductListUserData` | GET | `/sapi/v1/soft-staking/list` | SIGNED | `staking.getSoftStakingProductListUserData` |
| `staking.setSoftStakingUserData` | GET | `/sapi/v1/soft-staking/set` | SIGNED | `staking.setSoftStakingUserData` |
| `staking.solStakingAccountUserData` | GET | `/sapi/v1/sol-staking/account` | SIGNED | `staking.solStakingAccountUserData` |
| `staking.claimBoostRewardsTrade` | POST | `/sapi/v1/sol-staking/sol/claim` | SIGNED | `staking.claimBoostRewardsTrade` |
| `staking.getBnsolRewardsHistoryUserData` | GET | `/sapi/v1/sol-staking/sol/history/bnsolRewardsHistory` | SIGNED | `staking.getBnsolRewardsHistoryUserData` |
| `staking.getBoostRewardsHistoryUserData` | GET | `/sapi/v1/sol-staking/sol/history/boostRewardsHistory` | SIGNED | `staking.getBoostRewardsHistoryUserData` |
| `staking.getBnsolRateHistoryUserData` | GET | `/sapi/v1/sol-staking/sol/history/rateHistory` | SIGNED | `staking.getBnsolRateHistoryUserData` |
| `staking.getSolRedemptionHistoryUserData` | GET | `/sapi/v1/sol-staking/sol/history/redemptionHistory` | SIGNED | `staking.getSolRedemptionHistoryUserData` |
| `staking.getSolStakingHistoryUserData` | GET | `/sapi/v1/sol-staking/sol/history/stakingHistory` | SIGNED | `staking.getSolStakingHistoryUserData` |
| `staking.getUnclaimedRewardsUserData` | GET | `/sapi/v1/sol-staking/sol/history/unclaimedRewards` | SIGNED | `staking.getUnclaimedRewardsUserData` |
| `staking.getSolStakingQuotaDetailsUserData` | GET | `/sapi/v1/sol-staking/sol/quota` | SIGNED | `staking.getSolStakingQuotaDetailsUserData` |
| `staking.redeemSolTrade` | POST | `/sapi/v1/sol-staking/sol/redeem` | SIGNED | `staking.redeemSolTrade` |
| `staking.subscribeSolStakingTrade` | POST | `/sapi/v1/sol-staking/sol/stake` | SIGNED | `staking.subscribeSolStakingTrade` |
| `staking.getWbethRateHistoryUserData` | GET | `/sapi/v1/eth-staking/eth/history/rateHistory` | SIGNED | `staking.getWbethRateHistoryUserData` |
| `staking.getEthRedemptionHistoryUserData` | GET | `/sapi/v1/eth-staking/eth/history/redemptionHistory` | SIGNED | `staking.getEthRedemptionHistoryUserData` |
| `staking.getEthStakingHistoryUserData` | GET | `/sapi/v1/eth-staking/eth/history/stakingHistory` | SIGNED | `staking.getEthStakingHistoryUserData` |
| `staking.getWbethRewardsHistoryUserData` | GET | `/sapi/v1/eth-staking/eth/history/wbethRewardsHistory` | SIGNED | `staking.getWbethRewardsHistoryUserData` |
| `staking.getCurrentEthStakingQuotaUserData` | GET | `/sapi/v1/eth-staking/eth/quota` | SIGNED | `staking.getCurrentEthStakingQuotaUserData` |
| `staking.redeemEthTrade` | POST | `/sapi/v1/eth-staking/eth/redeem` | SIGNED | `staking.redeemEthTrade` |
| `staking.getWbethUnwrapHistoryUserData` | GET | `/sapi/v1/eth-staking/wbeth/history/unwrapHistory` | SIGNED | `staking.getWbethUnwrapHistoryUserData` |
| `staking.getWbethWrapHistoryUserData` | GET | `/sapi/v1/eth-staking/wbeth/history/wrapHistory` | SIGNED | `staking.getWbethWrapHistoryUserData` |
| `staking.wrapBethTrade` | POST | `/sapi/v1/eth-staking/wbeth/wrap` | SIGNED | `staking.wrapBethTrade` |
| `staking.ethStakingAccountUserData` | GET | `/sapi/v2/eth-staking/account` | SIGNED | `staking.ethStakingAccountUserData` |
| `staking.subscribeEthStakingTrade` | POST | `/sapi/v2/eth-staking/eth/stake` | SIGNED | `staking.subscribeEthStakingTrade` |
