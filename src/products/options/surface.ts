import type { CoreContext } from '../../core/context.js';
import { OptionsAccount } from '../../resources/OptionsAccount.js';
import { OptionsBlockTrading } from '../../resources/OptionsBlockTrading.js';
import { OptionsMarket } from '../../resources/OptionsMarket.js';
import { OptionsMmp } from '../../resources/OptionsMmp.js';
import { OptionsTrading } from '../../resources/OptionsTrading.js';
import { OptionsUserDataStream } from '../../resources/OptionsUserDataStream.js';
import { OptionsWave6 } from '../../resources/OptionsWave6.js';
import { OptionsMarketWS } from '../../ws/OptionsMarketWS.js';
import { OptionsUserWS } from '../../ws/OptionsUserWS.js';

export interface OptionsSurface {
  market: OptionsMarket;
  account: OptionsAccount;
  trading: OptionsTrading;
  mmp: OptionsMmp;
  block: OptionsBlockTrading;
  userStream: OptionsUserDataStream;
  wave6: OptionsWave6;
  /** Wave 8 — Options market WebSocket streams. */
  ws: OptionsMarketWS;
  /** Wave 8 — Options user-data WebSocket stream. */
  wsUser: OptionsUserWS;
}

export function buildOptionsSurface(core: CoreContext, getListenKey?: () => string | null): OptionsSurface {
  return {
    market: new OptionsMarket(core.http('eapi')),
    account: new OptionsAccount(core.http('eapi')),
    trading: new OptionsTrading(core.http('eapi')),
    mmp: new OptionsMmp(core.http('eapi')),
    block: new OptionsBlockTrading(core.http('eapi')),
    userStream: new OptionsUserDataStream(core.http('eapi')),
    wave6: new OptionsWave6(core.http('eapiRoot')),
    ws: new OptionsMarketWS(core.endpoints.wsOptionsMarket, { events: core.events }),
    wsUser: new OptionsUserWS({
      baseUserUrl: core.endpoints.wsOptionsUser,
      getListenKey: getListenKey ?? (() => null),
      events: core.events,
    }),
  };
}
