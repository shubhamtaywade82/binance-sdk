import type { CoreContext } from '../../core/context.js';
import { PortfolioMarginPro } from '../../resources/PortfolioMarginPro.js';
import { PortfolioMarginProWave6 } from '../../resources/PortfolioMarginProWave6.js';

/** Portfolio Margin Pro product surface. */
export interface PortfolioMarginProSurface {
  /** PM Pro account/balance/repay/loan/market endpoints (24 total). */
  account: PortfolioMarginPro;
  /**
   * Wave-6 contract-first gap closure — 6 PM Pro endpoints added from the
   * official Binance Postman collection (margin-call-level DELETE + POST,
   * pmLoan GET, repay-futures-switch GET, asset-collection POST,
   * delta-mode POST).
   */
  wave6: PortfolioMarginProWave6;
}

/** Build the PM Pro surface over a shared {@link CoreContext}. */
export function buildPortfolioMarginProSurface(core: CoreContext): PortfolioMarginProSurface {
  return {
    account: new PortfolioMarginPro(core.http('apiRoot')),
    wave6: new PortfolioMarginProWave6(core.http('apiRoot')),
  };
}
