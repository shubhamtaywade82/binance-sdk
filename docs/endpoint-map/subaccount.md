# Sub-account — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

13 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
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
