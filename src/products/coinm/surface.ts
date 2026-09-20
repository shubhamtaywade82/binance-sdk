import type { CoreContext } from '../../core/context.js';
import { RiskGateway } from '../../risk/RiskGateway.js';
import { CoinMAccount } from '../../resources/CoinMAccount.js';
import { CoinMMarket } from '../../resources/CoinMMarket.js';
import { CoinMTrading } from '../../resources/CoinMTrading.js';
import { CoinMUserDataStream } from '../../resources/CoinMUserDataStream.js';
import { CoinMExecutionAdapter } from '../../execution/adapter.js';
import { ExecutionManager } from '../../execution/ExecutionManager.js';
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
  /** Idempotent order placement with transport-failure reconciliation. */
  execution: ExecutionManager;
  userStream: CoinMUserDataStream;
  ws: CoinMMarketWS;
  wsUser: CoinMUserWS;
}

/** Shared COIN-M wiring (single construction path, same as USDⓈ-M). */
export function buildCoinmSurface(core: CoreContext, getListenKey: () => string | null): CoinMSurface {
  const events = core.events;
  const riskGateway = core.policy instanceof RiskGateway ? core.policy : undefined;
  const coinmTrading = new CoinMTrading(core.http('dapiRoot'));

  return {
    market: new CoinMMarket(core.http('dapi')),
    account: new CoinMAccount(core.http('dapiRoot')),
    trading: coinmTrading,
    execution: new ExecutionManager(new CoinMExecutionAdapter(coinmTrading), { events, riskGateway }),
    userStream: new CoinMUserDataStream(core.http('dapiRoot')),
    ws: new CoinMMarketWS(core.endpoints.wsDapiMarket, { events: core.events }),
    wsUser: new CoinMUserWS({
      baseUserUrl: core.endpoints.wsDapiUser,
      getListenKey,
      events: core.events,
    }),
  };
}
