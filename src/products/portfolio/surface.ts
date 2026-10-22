import type { CoreContext } from '../../core/context.js';
import { PortfolioMarginAccount } from '../../resources/PortfolioMarginAccount.js';
import { PortfolioMarginCm } from '../../resources/PortfolioMarginCm.js';
import { PortfolioMarginMargin } from '../../resources/PortfolioMarginMargin.js';
import { PortfolioMarginPortfolio } from '../../resources/PortfolioMarginPortfolio.js';
import { PortfolioMarginUm } from '../../resources/PortfolioMarginUm.js';
import { PortfolioMarginUserDataStream } from '../../resources/PortfolioMarginUserDataStream.js';
import { PortfolioMarginWave6 } from '../../resources/PortfolioMarginWave6.js';
import { PortfolioMarginUserWS } from '../../ws/PortfolioMarginUserWS.js';

export interface PortfolioMarginSurface {
  account: PortfolioMarginAccount;
  um: PortfolioMarginUm;
  cm: PortfolioMarginCm;
  margin: PortfolioMarginMargin;
  portfolio: PortfolioMarginPortfolio;
  userStream: PortfolioMarginUserDataStream;
  wave6: PortfolioMarginWave6;
  /** Wave 8 — Portfolio Margin user-data WebSocket stream. */
  wsUser: PortfolioMarginUserWS;
}

export function buildPortfolioMarginSurface(core: CoreContext, getListenKey?: () => string | null): PortfolioMarginSurface {
  return {
    account: new PortfolioMarginAccount(core.http('papi')),
    um: new PortfolioMarginUm(core.http('papi')),
    cm: new PortfolioMarginCm(core.http('papi')),
    margin: new PortfolioMarginMargin(core.http('papi')),
    portfolio: new PortfolioMarginPortfolio(core.http('papi')),
    userStream: new PortfolioMarginUserDataStream(core.http('papi')),
    wave6: new PortfolioMarginWave6(core.http('papiRoot')),
    wsUser: new PortfolioMarginUserWS({
      baseUserUrl: core.endpoints.wsPortfolioMarginUser,
      getListenKey: getListenKey ?? (() => null),
      events: core.events,
    }),
  };
}
