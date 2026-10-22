# Mining — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

13 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `mining.hashrateResaleRequestUserData` | POST | `/sapi/v1/mining/hash-transfer/config` | SIGNED | `mining.hashrateResaleRequestUserData` |
| `mining.cancelHashrateResaleConfigurationUserData` | POST | `/sapi/v1/mining/hash-transfer/config/cancel` | SIGNED | `mining.cancelHashrateResaleConfigurationUserData` |
| `mining.hashrateResaleList` | GET | `/sapi/v1/mining/hash-transfer/config/details/list` | SIGNED | `mining.hashrateResaleList` |
| `mining.hashrateResaleDetailUserData` | GET | `/sapi/v1/mining/hash-transfer/profit/details` | SIGNED | `mining.hashrateResaleDetailUserData` |
| `mining.earningsListUserData` | GET | `/sapi/v1/mining/payment/list` | SIGNED | `mining.earningsListUserData` |
| `mining.extraBonusListUserData` | GET | `/sapi/v1/mining/payment/other` | SIGNED | `mining.extraBonusListUserData` |
| `mining.miningAccountEarningUserData` | GET | `/sapi/v1/mining/payment/uid` | SIGNED | `mining.miningAccountEarningUserData` |
| `mining.acquiringAlgorithmMarketData` | GET | `/sapi/v1/mining/pub/algoList` | API_KEY | `mining.acquiringAlgorithmMarketData` |
| `mining.acquiringCoinnameMarketData` | GET | `/sapi/v1/mining/pub/coinList` | API_KEY | `mining.acquiringCoinnameMarketData` |
| `mining.accountListUserData` | GET | `/sapi/v1/mining/statistics/user/list` | SIGNED | `mining.accountListUserData` |
| `mining.statisticListUserData` | GET | `/sapi/v1/mining/statistics/user/status` | SIGNED | `mining.statisticListUserData` |
| `mining.requestForDetailMinerListUserData` | GET | `/sapi/v1/mining/worker/detail` | SIGNED | `mining.requestForDetailMinerListUserData` |
| `mining.requestForMinerListUserData` | GET | `/sapi/v1/mining/worker/list` | SIGNED | `mining.requestForMinerListUserData` |
