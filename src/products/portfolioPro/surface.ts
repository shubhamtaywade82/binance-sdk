import type { CoreContext } from '../../core/context.js';
import { PortfolioMarginPro } from '../../resources/PortfolioMarginPro.js';

/** Portfolio Margin Pro product surface. */
export interface PortfolioMarginProSurface {
  /** PM Pro account/balance/repay/loan/market endpoints (24 total). */
  account: PortfolioMarginPro;
}

/** Build the PM Pro surface over a shared {@link CoreContext}. */
export function buildPortfolioMarginProSurface(core: CoreContext): PortfolioMarginProSurface {
  return { account: new PortfolioMarginPro(core.http('apiRoot')) };
}
