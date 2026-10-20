import type { CoreContext } from '../../core/context.js';
import { PortfolioMarginAccount } from '../../resources/PortfolioMarginAccount.js';
import { PortfolioMarginCm } from '../../resources/PortfolioMarginCm.js';
import { PortfolioMarginMargin } from '../../resources/PortfolioMarginMargin.js';
import { PortfolioMarginPortfolio } from '../../resources/PortfolioMarginPortfolio.js';
import { PortfolioMarginUm } from '../../resources/PortfolioMarginUm.js';
import { PortfolioMarginUserDataStream } from '../../resources/PortfolioMarginUserDataStream.js';

/**
 * Full Binance Portfolio Margin product surface. Exposed via
 * `client.portfolioMargin` on the multi-product facade and as a standalone
 * `PortfolioMarginClient`. Sub-namespaces mirror Binance's URL layout:
 *
 *  - `account`    — top-level PM account/balance/transfer endpoints
 *  - `um`         — USDⓈ-M Futures scoped under PM (`/papi/v1/um/*`)
 *  - `cm`         — COIN-M Futures scoped under PM (`/papi/v1/cm/*`)
 *  - `margin`     — classic margin scoped under PM (`/papi/v1/margin/*`)
 *  - `portfolio`  — PM loan, repay, interest, collateral config (`/papi/v1/portfolio/*`)
 *  - `userStream` — PM listen-key lifecycle
 */
export interface PortfolioMarginSurface {
  account: PortfolioMarginAccount;
  um: PortfolioMarginUm;
  cm: PortfolioMarginCm;
  margin: PortfolioMarginMargin;
  portfolio: PortfolioMarginPortfolio;
  userStream: PortfolioMarginUserDataStream;
}

/** Build the PM surface over a shared {@link CoreContext}. */
export function buildPortfolioMarginSurface(core: CoreContext): PortfolioMarginSurface {
  return {
    account: new PortfolioMarginAccount(core.http('papi')),
    um: new PortfolioMarginUm(core.http('papi')),
    cm: new PortfolioMarginCm(core.http('papi')),
    margin: new PortfolioMarginMargin(core.http('papi')),
    portfolio: new PortfolioMarginPortfolio(core.http('papi')),
    userStream: new PortfolioMarginUserDataStream(core.http('papi')),
  };
}
