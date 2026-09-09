import type { CoreContext } from '../../core/context.js';
import { RiskGateway } from '../../risk/RiskGateway.js';
import { SpotAccount, SpotTrading } from '../../resources/SpotTrading.js';
import { SpotMarket } from '../../resources/SpotMarket.js';
import { SpotUserDataStream } from '../../resources/SpotUserDataStream.js';
import { ExecutionManager } from '../../execution/ExecutionManager.js';
import { SpotExecutionAdapter } from '../../execution/adapter.js';
import { SpotMarketWS } from '../../ws/SpotMarketWS.js';
import { SpotUserWS } from '../../ws/SpotUserWS.js';
import { SpotWsApi } from '../../ws/SpotWsApi.js';

/**
 * The raw Spot product surface — no cross-product aliases. Exposed directly
 * as `client.spot` and wrapped by the standalone v3 Spot client.
 */
export interface SpotSurface {
  market: SpotMarket;
  account: SpotAccount;
  trading: SpotTrading;
  /** Idempotent spot order placement with transport-failure reconciliation. */
  execution: ExecutionManager;
  userStream: SpotUserDataStream;
  ws: SpotMarketWS;
  wsUser: SpotUserWS;
  wsApi: SpotWsApi;
}

/** Shared Spot wiring (single construction path, same pattern as USDⓈ-M). */
export function buildSpotSurface(core: CoreContext, getListenKey: () => string | null): SpotSurface {
  const events = core.events;
  const riskGateway = core.policy instanceof RiskGateway ? core.policy : undefined;
  const credentials = core.credentials;
  const spotHttp = core.http('spot');

  const spotTrading = new SpotTrading(spotHttp);
  return {
    market: new SpotMarket(spotHttp),
    account: new SpotAccount(spotHttp),
    trading: spotTrading,
    execution: new ExecutionManager(new SpotExecutionAdapter(spotTrading), {
      events,
      riskGateway,
    }),
    userStream: new SpotUserDataStream(spotHttp),
    ws: new SpotMarketWS(core.endpoints.wsSpotMarket, { events }),
    wsUser: new SpotUserWS({
      baseUserUrl: core.endpoints.wsSpotUser,
      getListenKey,
      events,
    }),
    wsApi: new SpotWsApi({
      baseUrl: core.endpoints.wsSpotApi,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      privateKey: credentials.privateKey,
      signatureAlgorithm: credentials.signatureAlgorithm,
      recvWindow: core.transport.recvWindow,
    }),
  };
}
