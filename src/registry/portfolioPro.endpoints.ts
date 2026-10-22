import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/**
 * [operation, method, path, auth, implementedBy] rows for Binance Portfolio
 * Margin Pro (https://api.binance.com/sapi/v1/portfolio/* and /sapi/v2/portfolio/*).
 *
 * PM Pro is the next-generation unified margin account that supports
 * additional asset classes (earn-asset transfers, classic mode repay
 * switches, etc.) distinct from the legacy /papi/v1 surface.
 */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  // ---- Wave 6: contract-first gap closure (Postman-driven) ----
  ["portfolioPro.deleteMarginCallLevelUserData", "DELETE", "/sapi/v1/portfolio/margin-call-level", "signed", "portfolioPro.deleteMarginCallLevelUserData"],
  ["portfolioPro.queryPortfolioMarginProBankruptcyLoanAmountUserData", "GET", "/sapi/v1/portfolio/pmLoan", "signed", "portfolioPro.queryPortfolioMarginProBankruptcyLoanAmountUserData"],
  ["portfolioPro.getAutoRepayFuturesStatusUserData", "GET", "/sapi/v1/portfolio/repay-futures-switch", "signed", "portfolioPro.getAutoRepayFuturesStatusUserData"],
  ["portfolioPro.fundCollectionByAssetUserData", "POST", "/sapi/v1/portfolio/asset-collection", "signed", "portfolioPro.fundCollectionByAssetUserData"],
  ["portfolioPro.switchDeltaModeTrade", "POST", "/sapi/v1/portfolio/delta-mode", "signed", "portfolioPro.switchDeltaModeTrade"],
  ["portfolioPro.setMarginCallLevelUserData", "POST", "/sapi/v1/portfolio/margin-call-level", "signed", "portfolioPro.setMarginCallLevelUserData"],

  // ---- v1 ----
  ['account.account', 'GET', '/sapi/v1/portfolio/account', 'signed', 'portfolioPro.account.account'],
  ['account.balance', 'GET', '/sapi/v1/portfolio/balance', 'signed', 'portfolioPro.account.balance'],
  ['account.assetCollection', 'GET', '/sapi/v1/portfolio/asset-collection', 'signed', 'portfolioPro.account.assetCollection'],
  ['account.autoCollection', 'POST', '/sapi/v1/portfolio/auto-collection', 'signed', 'portfolioPro.account.autoCollection'],
  ['account.bnbTransfer', 'POST', '/sapi/v1/portfolio/bnb-transfer', 'signed', 'portfolioPro.account.bnbTransfer'],
  ['account.deltaMode', 'GET', '/sapi/v1/portfolio/delta-mode', 'signed', 'portfolioPro.account.deltaMode'],
  ['account.earnAssetBalance', 'GET', '/sapi/v1/portfolio/earn-asset-balance', 'signed', 'portfolioPro.account.earnAssetBalance'],
  ['account.earnAssetTransfer', 'POST', '/sapi/v1/portfolio/earn-asset-transfer', 'signed', 'portfolioPro.account.earnAssetTransfer'],
  ['account.interestHistory', 'GET', '/sapi/v1/portfolio/interest-history', 'signed', 'portfolioPro.account.interestHistory'],
  ['account.marginCallLevel', 'GET', '/sapi/v1/portfolio/margin-call-level', 'signed', 'portfolioPro.account.marginCallLevel'],
  ['account.pmLoan', 'POST', '/sapi/v1/portfolio/pmLoan', 'signed', 'portfolioPro.account.pmLoan'],
  ['account.pmLoanHistory', 'GET', '/sapi/v1/portfolio/pmloan-history', 'signed', 'portfolioPro.account.pmLoanHistory'],
  ['account.repay', 'POST', '/sapi/v1/portfolio/repay', 'signed', 'portfolioPro.account.repay'],
  ['account.repayFuturesNegativeBalance', 'POST', '/sapi/v1/portfolio/repay-futures-negative-balance', 'signed', 'portfolioPro.account.repayFuturesNegativeBalance'],
  ['account.repayFuturesSwitch', 'POST', '/sapi/v1/portfolio/repay-futures-switch', 'signed', 'portfolioPro.account.repayFuturesSwitch'],
  ['market.assetIndexPrice', 'GET', '/sapi/v1/portfolio/asset-index-price', 'signed', 'portfolioPro.market.assetIndexPrice'],
  ['market.collateralRate', 'GET', '/sapi/v1/portfolio/collateralRate', 'signed', 'portfolioPro.market.collateralRate'],
  ['market.marginAssetLeverage', 'GET', '/sapi/v1/portfolio/margin-asset-leverage', 'signed', 'portfolioPro.market.marginAssetLeverage'],

  // ---- v2 ----
  ['account.accountV2', 'GET', '/sapi/v2/portfolio/account', 'signed', 'portfolioPro.account.accountV2'],
  ['account.collateralRateV2', 'GET', '/sapi/v2/portfolio/collateralRate', 'signed', 'portfolioPro.account.collateralRateV2'],
  ['account.balanceV2', 'GET', '/sapi/v2/portfolio/balance', 'signed', 'portfolioPro.account.balanceV2'],
  ['account.assetIndexPriceV2', 'GET', '/sapi/v2/portfolio/asset-index-price', 'signed', 'portfolioPro.account.assetIndexPriceV2'],
  ['account.marginAssetLeverageV2', 'GET', '/sapi/v2/portfolio/margin-asset-leverage', 'signed', 'portfolioPro.account.marginAssetLeverageV2'],
  ['account.collateralRateV3', 'GET', '/sapi/v3/portfolio/collateralRate', 'signed', 'portfolioPro.account.collateralRateV3'],
];

export const PORTFOLIO_PRO_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'portfolioPro',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
