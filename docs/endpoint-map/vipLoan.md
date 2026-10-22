# VIP Loan — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

11 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `vipLoan.vipLoanBorrowTrade` | POST | `/sapi/v1/loan/vip/borrow` | SIGNED | `vipLoan.vipLoanBorrowTrade` |
| `vipLoan.vipLoanRenewTrade` | POST | `/sapi/v1/loan/vip/renew` | SIGNED | `vipLoan.vipLoanRenewTrade` |
| `vipLoan.vipLoanRepayTrade` | POST | `/sapi/v1/loan/vip/repay` | SIGNED | `vipLoan.vipLoanRepayTrade` |
| `vipLoan.getVipLoanAccruedInterestUserData` | GET | `/sapi/v1/loan/vip/accruedInterest` | SIGNED | `vipLoan.getVipLoanAccruedInterestUserData` |
| `vipLoan.checkVipLoanCollateralAccountUserData` | GET | `/sapi/v1/loan/vip/collateral/account` | SIGNED | `vipLoan.checkVipLoanCollateralAccountUserData` |
| `vipLoan.getVipLoanOngoingOrdersUserData` | GET | `/sapi/v1/loan/vip/ongoing/orders` | SIGNED | `vipLoan.getVipLoanOngoingOrdersUserData` |
| `vipLoan.queryApplicationStatusUserData` | GET | `/sapi/v1/loan/vip/request/data` | SIGNED | `vipLoan.queryApplicationStatusUserData` |
| `vipLoan.getCollateralAssetDataUserData` | GET | `/sapi/v1/loan/vip/collateral/data` | SIGNED | `vipLoan.getCollateralAssetDataUserData` |
| `vipLoan.getVipLoanInterestRateHistoryUserData` | GET | `/sapi/v1/loan/vip/interestRateHistory` | SIGNED | `vipLoan.getVipLoanInterestRateHistoryUserData` |
| `vipLoan.getLoanableAssetsDataUserData` | GET | `/sapi/v1/loan/vip/loanable/data` | SIGNED | `vipLoan.getLoanableAssetsDataUserData` |
| `vipLoan.getBorrowInterestRateUserData` | GET | `/sapi/v1/loan/vip/request/interestRate` | SIGNED | `vipLoan.getBorrowInterestRateUserData` |
