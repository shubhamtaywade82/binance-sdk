# Portfolio Margin Pro — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

30 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `portfolioPro.deleteMarginCallLevelUserData` | DELETE | `/sapi/v1/portfolio/margin-call-level` | SIGNED | `portfolioPro.deleteMarginCallLevelUserData` |
| `portfolioPro.queryPortfolioMarginProBankruptcyLoanAmountUserData` | GET | `/sapi/v1/portfolio/pmLoan` | SIGNED | `portfolioPro.queryPortfolioMarginProBankruptcyLoanAmountUserData` |
| `portfolioPro.getAutoRepayFuturesStatusUserData` | GET | `/sapi/v1/portfolio/repay-futures-switch` | SIGNED | `portfolioPro.getAutoRepayFuturesStatusUserData` |
| `portfolioPro.fundCollectionByAssetUserData` | POST | `/sapi/v1/portfolio/asset-collection` | SIGNED | `portfolioPro.fundCollectionByAssetUserData` |
| `portfolioPro.switchDeltaModeTrade` | POST | `/sapi/v1/portfolio/delta-mode` | SIGNED | `portfolioPro.switchDeltaModeTrade` |
| `portfolioPro.setMarginCallLevelUserData` | POST | `/sapi/v1/portfolio/margin-call-level` | SIGNED | `portfolioPro.setMarginCallLevelUserData` |
| `account.account` | GET | `/sapi/v1/portfolio/account` | SIGNED | `portfolioPro.account.account` |
| `account.balance` | GET | `/sapi/v1/portfolio/balance` | SIGNED | `portfolioPro.account.balance` |
| `account.assetCollection` | GET | `/sapi/v1/portfolio/asset-collection` | SIGNED | `portfolioPro.account.assetCollection` |
| `account.autoCollection` | POST | `/sapi/v1/portfolio/auto-collection` | SIGNED | `portfolioPro.account.autoCollection` |
| `account.bnbTransfer` | POST | `/sapi/v1/portfolio/bnb-transfer` | SIGNED | `portfolioPro.account.bnbTransfer` |
| `account.deltaMode` | GET | `/sapi/v1/portfolio/delta-mode` | SIGNED | `portfolioPro.account.deltaMode` |
| `account.earnAssetBalance` | GET | `/sapi/v1/portfolio/earn-asset-balance` | SIGNED | `portfolioPro.account.earnAssetBalance` |
| `account.earnAssetTransfer` | POST | `/sapi/v1/portfolio/earn-asset-transfer` | SIGNED | `portfolioPro.account.earnAssetTransfer` |
| `account.interestHistory` | GET | `/sapi/v1/portfolio/interest-history` | SIGNED | `portfolioPro.account.interestHistory` |
| `account.marginCallLevel` | GET | `/sapi/v1/portfolio/margin-call-level` | SIGNED | `portfolioPro.account.marginCallLevel` |
| `account.pmLoan` | POST | `/sapi/v1/portfolio/pmLoan` | SIGNED | `portfolioPro.account.pmLoan` |
| `account.pmLoanHistory` | GET | `/sapi/v1/portfolio/pmloan-history` | SIGNED | `portfolioPro.account.pmLoanHistory` |
| `account.repay` | POST | `/sapi/v1/portfolio/repay` | SIGNED | `portfolioPro.account.repay` |
| `account.repayFuturesNegativeBalance` | POST | `/sapi/v1/portfolio/repay-futures-negative-balance` | SIGNED | `portfolioPro.account.repayFuturesNegativeBalance` |
| `account.repayFuturesSwitch` | POST | `/sapi/v1/portfolio/repay-futures-switch` | SIGNED | `portfolioPro.account.repayFuturesSwitch` |
| `market.assetIndexPrice` | GET | `/sapi/v1/portfolio/asset-index-price` | SIGNED | `portfolioPro.market.assetIndexPrice` |
| `market.collateralRate` | GET | `/sapi/v1/portfolio/collateralRate` | SIGNED | `portfolioPro.market.collateralRate` |
| `market.marginAssetLeverage` | GET | `/sapi/v1/portfolio/margin-asset-leverage` | SIGNED | `portfolioPro.market.marginAssetLeverage` |
| `account.accountV2` | GET | `/sapi/v2/portfolio/account` | SIGNED | `portfolioPro.account.accountV2` |
| `account.collateralRateV2` | GET | `/sapi/v2/portfolio/collateralRate` | SIGNED | `portfolioPro.account.collateralRateV2` |
| `account.balanceV2` | GET | `/sapi/v2/portfolio/balance` | SIGNED | `portfolioPro.account.balanceV2` |
| `account.assetIndexPriceV2` | GET | `/sapi/v2/portfolio/asset-index-price` | SIGNED | `portfolioPro.account.assetIndexPriceV2` |
| `account.marginAssetLeverageV2` | GET | `/sapi/v2/portfolio/margin-asset-leverage` | SIGNED | `portfolioPro.account.marginAssetLeverageV2` |
| `account.collateralRateV3` | GET | `/sapi/v3/portfolio/collateralRate` | SIGNED | `portfolioPro.account.collateralRateV3` |
