import type { CoreContext } from '../../core/context.js';
import { CoinMAccount } from '../../resources/CoinMAccount.js';
import { CoinMMarket } from '../../resources/CoinMMarket.js';
import { CoinMTrading } from '../../resources/CoinMTrading.js';
import { CoinMUserDataStream } from '../../resources/CoinMUserDataStream.js';
import { CoinMMarketWS } from '../../ws/CoinMMarketWS.js';
import { CoinMUserWS } from '../../ws/CoinMUserWS.js';

/**
 * The raw COIN-M product surface — no cross-product aliases. Exposed
 * directly as `client.coinm`, aliased from `client.futures.coinm`, and
 * wrapped by the standalone v3 COIN-M client.
 */
export interface CoinMSurface {
  market: CoinMMarket;
  account: CoinMAccount;
  trading: CoinMTrading;
  userStream: CoinMUserDataStream;
  ws: CoinMMarketWS;
  wsUser: CoinMUserWS;
}

/** Shared COIN-M wiring (single construction path, same as USDⓈ-M). */
export function buildCoinmSurface(core: CoreContext, getListenKey: () => string | null): CoinMSurface {
  return {
    market: new CoinMMarket(core.http('dapi')),
    account: new CoinMAccount(core.http('dapiRoot')),
    trading: new CoinMTrading(core.http('dapiRoot')),
    userStream: new CoinMUserDataStream(core.http('dapiRoot')),
    ws: new CoinMMarketWS(core.endpoints.wsDapiMarket, { events: core.events }),
    wsUser: new CoinMUserWS({
      baseUserUrl: core.endpoints.wsDapiUser,
      getListenKey,
      events: core.events,
    }),
  };
}
