import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Crypto Loan. */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- v1 loan (fixed-term) ----
  ['loan.borrowHistory', 'GET', '/sapi/v1/loan/borrow/history', 'signed', 'cryptoLoan.borrowHistory'],
  ['loan.income', 'GET', '/sapi/v1/loan/income', 'signed', 'cryptoLoan.income'],
  ['loan.ltvAdjustmentHistory', 'GET', '/sapi/v1/loan/ltv/adjustment/history', 'signed', 'cryptoLoan.ltvAdjustmentHistory'],
  ['loan.repayCollateralRate', 'GET', '/sapi/v1/loan/repay/collateral/rate', 'signed', 'cryptoLoan.repayCollateralRate'],
  ['loan.repayHistory', 'GET', '/sapi/v1/loan/repay/history', 'signed', 'cryptoLoan.repayHistory'],
  // ---- v2 loan (flexible) ----
  ['flexible.adjustLtv', 'POST', '/sapi/v2/loan/flexible/adjust/ltv', 'signed', 'cryptoLoan.flexible.adjustLtv'],
  ['flexible.borrow', 'POST', '/sapi/v2/loan/flexible/borrow', 'signed', 'cryptoLoan.flexible.borrow'],
  ['flexible.borrowHistory', 'GET', '/sapi/v2/loan/flexible/borrow/history', 'signed', 'cryptoLoan.flexible.borrowHistory'],
  ['flexible.collateralData', 'GET', '/sapi/v2/loan/flexible/collateral/data', 'signed', 'cryptoLoan.flexible.collateralData'],
  ['flexible.liquidationHistory', 'GET', '/sapi/v2/loan/flexible/liquidation/history', 'signed', 'cryptoLoan.flexible.liquidationHistory'],
  ['flexible.loanableData', 'GET', '/sapi/v2/loan/flexible/loanable/data', 'signed', 'cryptoLoan.flexible.loanableData'],
  ['flexible.ltvAdjustmentHistory', 'GET', '/sapi/v2/loan/flexible/ltv/adjustment/history', 'signed', 'cryptoLoan.flexible.ltvAdjustmentHistory'],
  ['flexible.ongoingOrders', 'GET', '/sapi/v2/loan/flexible/ongoing/orders', 'signed', 'cryptoLoan.flexible.ongoingOrders'],
  ['flexible.repay', 'POST', '/sapi/v2/loan/flexible/repay', 'signed', 'cryptoLoan.flexible.repay'],
  ['flexible.repayHistory', 'GET', '/sapi/v2/loan/flexible/repay/history', 'signed', 'cryptoLoan.flexible.repayHistory'],
  ['flexible.repayRate', 'GET', '/sapi/v2/loan/flexible/repay/rate', 'signed', 'cryptoLoan.flexible.repayRate'],
  // ---- interest rate history ----
  ['loan.interestRateHistory', 'GET', '/sapi/v2/loan/interestRateHistory', 'signed', 'cryptoLoan.interestRateHistory'],
];

export const CRYPTO_LOAN_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'cryptoLoan',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
