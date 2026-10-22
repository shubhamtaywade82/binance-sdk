# Crypto Loan — endpoint map

> Generated from `src/registry/*.endpoints.ts` by `npm run docs:generate` — do not edit by hand.

17 implemented endpoints.

| Operation | Method | Path | Auth | SDK surface |
|---|---|---|---|---|
| `loan.borrowHistory` | GET | `/sapi/v1/loan/borrow/history` | SIGNED | `cryptoLoan.borrowHistory` |
| `loan.income` | GET | `/sapi/v1/loan/income` | SIGNED | `cryptoLoan.income` |
| `loan.ltvAdjustmentHistory` | GET | `/sapi/v1/loan/ltv/adjustment/history` | SIGNED | `cryptoLoan.ltvAdjustmentHistory` |
| `loan.repayCollateralRate` | GET | `/sapi/v1/loan/repay/collateral/rate` | SIGNED | `cryptoLoan.repayCollateralRate` |
| `loan.repayHistory` | GET | `/sapi/v1/loan/repay/history` | SIGNED | `cryptoLoan.repayHistory` |
| `flexible.adjustLtv` | POST | `/sapi/v2/loan/flexible/adjust/ltv` | SIGNED | `cryptoLoan.flexible.adjustLtv` |
| `flexible.borrow` | POST | `/sapi/v2/loan/flexible/borrow` | SIGNED | `cryptoLoan.flexible.borrow` |
| `flexible.borrowHistory` | GET | `/sapi/v2/loan/flexible/borrow/history` | SIGNED | `cryptoLoan.flexible.borrowHistory` |
| `flexible.collateralData` | GET | `/sapi/v2/loan/flexible/collateral/data` | SIGNED | `cryptoLoan.flexible.collateralData` |
| `flexible.liquidationHistory` | GET | `/sapi/v2/loan/flexible/liquidation/history` | SIGNED | `cryptoLoan.flexible.liquidationHistory` |
| `flexible.loanableData` | GET | `/sapi/v2/loan/flexible/loanable/data` | SIGNED | `cryptoLoan.flexible.loanableData` |
| `flexible.ltvAdjustmentHistory` | GET | `/sapi/v2/loan/flexible/ltv/adjustment/history` | SIGNED | `cryptoLoan.flexible.ltvAdjustmentHistory` |
| `flexible.ongoingOrders` | GET | `/sapi/v2/loan/flexible/ongoing/orders` | SIGNED | `cryptoLoan.flexible.ongoingOrders` |
| `flexible.repay` | POST | `/sapi/v2/loan/flexible/repay` | SIGNED | `cryptoLoan.flexible.repay` |
| `flexible.repayHistory` | GET | `/sapi/v2/loan/flexible/repay/history` | SIGNED | `cryptoLoan.flexible.repayHistory` |
| `flexible.repayRate` | GET | `/sapi/v2/loan/flexible/repay/rate` | SIGNED | `cryptoLoan.flexible.repayRate` |
| `loan.interestRateHistory` | GET | `/sapi/v2/loan/interestRateHistory` | SIGNED | `cryptoLoan.interestRateHistory` |
