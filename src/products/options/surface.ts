import type { CoreContext } from '../../core/context.js';
import { OptionsAccount } from '../../resources/OptionsAccount.js';
import { OptionsBlockTrading } from '../../resources/OptionsBlockTrading.js';
import { OptionsMarket } from '../../resources/OptionsMarket.js';
import { OptionsMmp } from '../../resources/OptionsMmp.js';
import { OptionsTrading } from '../../resources/OptionsTrading.js';
import { OptionsUserDataStream } from '../../resources/OptionsUserDataStream.js';

/**
 * The full Binance Options product surface, exposed via `client.options`
 * on the multi-product facade and as a standalone `OptionsClient`.
 */
export interface OptionsSurface {
  market: OptionsMarket;
  account: OptionsAccount;
  trading: OptionsTrading;
  /** Market Maker Protection (MMP) profile management. */
  mmp: OptionsMmp;
  /** Block-trade RFQ flow (create/execute/query). */
  block: OptionsBlockTrading;
  userStream: OptionsUserDataStream;
}

/** Build the Options surface over a shared {@link CoreContext}. */
export function buildOptionsSurface(core: CoreContext): OptionsSurface {
  return {
    market: new OptionsMarket(core.http('eapi')),
    account: new OptionsAccount(core.http('eapi')),
    trading: new OptionsTrading(core.http('eapi')),
    mmp: new OptionsMmp(core.http('eapi')),
    block: new OptionsBlockTrading(core.http('eapi')),
    userStream: new OptionsUserDataStream(core.http('eapi')),
  };
}
