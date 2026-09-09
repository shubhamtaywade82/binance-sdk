# Wallet — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

14 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
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
