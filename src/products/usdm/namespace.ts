import type { CoreContext } from '../../core/context.js';
import { RiskGateway } from '../../risk/RiskGateway.js';
import { FuturesAccount } from '../../resources/FuturesAccount.js';
import { FuturesData } from '../../resources/FuturesData.js';
import { FuturesMarket } from '../../resources/FuturesMarket.js';
import { FuturesOps } from '../../resources/FuturesOps.js';
import { FuturesTrading } from '../../resources/FuturesTrading.js';
import { UserDataStream } from '../../resources/UserDataStream.js';
import { ExecutionManager } from '../../execution/ExecutionManager.js';
import { FuturesMarketWS } from '../../ws/FuturesMarketWS.js';
import { FuturesUserWS } from '../../ws/FuturesUserWS.js';
import { WsApi } from '../../ws/WsApi.js';
import type { CoinMSurface } from '../coinm/surface.js';

/**
 * The raw USDⓈ-M product surface — every capability, no cross-product
 * aliases. This is what the standalone {@link USDMClient} exposes and what
 * the multi-product `BinanceClient.futures` facade wraps (adding the
 * ergonomic `futures.usdm` / `futures.coinm` aliases).
 */
export interface UsdmSurface {
  market: FuturesMarket;
  data: FuturesData;
  account: FuturesAccount;
  trading: FuturesTrading;
  ops: FuturesOps;
  /** Idempotent order placement with transport-failure reconciliation. */
  execution: ExecutionManager;
  userStream: UserDataStream;
  ws: FuturesMarketWS;
  wsUser: FuturesUserWS;
  wsApi: WsApi;
}

/**
 * Shared USDⓈ-M wiring — the single construction path for the product
 * surface, used by both the multi-product `BinanceClient` facade and the
 * standalone v3 {@link USDMClient}. One wiring means one behavior: ledger
 * prefixes, event names, WS URLs and adapter choices cannot drift between
 * the two entry points.
 */
export function buildUsdmSurface(core: CoreContext, getListenKey: () => string | null): UsdmSurface {
  const events = core.events;
  const riskGateway = core.policy instanceof RiskGateway ? core.policy : undefined;
  const credentials = core.credentials;

  const futuresMarket = new FuturesMarket(core.http('fapi'), core.endpoints.restRoot);
  const futuresData = new FuturesData({
    restFapi: core.endpoints.restFapi,
    restFuturesData: core.endpoints.restFuturesData,
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret,
    recvWindow: core.transport.recvWindow,
    timeoutMs: core.transport.timeoutMs,
    maxRetries: core.transport.maxRetries,
    retryBaseDelayMs: core.transport.retryBaseDelayMs,
    retryMaxDelayMs: core.transport.retryMaxDelayMs,
  });
  const futuresAccount = new FuturesAccount(core.http('fapiRoot'));
  const futuresTrading = new FuturesTrading(core.http('fapiRoot'));

  return {
    market: futuresMarket,
    data: futuresData,
    account: futuresAccount,
    trading: futuresTrading,
    ops: new FuturesOps(futuresMarket, futuresData, futuresAccount, futuresTrading),
    execution: new ExecutionManager(futuresTrading, { events, riskGateway }),
    userStream: new UserDataStream(core.http('fapiRoot')),
    ws: new FuturesMarketWS(core.endpoints.wsMarket, { events }),
    wsUser: new FuturesUserWS({
      baseUserUrl: core.endpoints.wsUser,
      getListenKey,
      events,
    }),
    wsApi: new WsApi({
      baseUrl: core.endpoints.wsApi,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      privateKey: credentials.privateKey,
      signatureAlgorithm: credentials.signatureAlgorithm,
      recvWindow: core.transport.recvWindow,
    }),
  };
}

/** The facade type: USDⓈ-M surface plus the ergonomic cross-product aliases. */
export type FuturesNamespace = UsdmSurface & {
  /** Ergonomic alias for the USDⓈ-M surface (same objects as `client.futures`). */
  readonly usdm: FuturesNamespace;
  /** Ergonomic alias for the COIN-M surface (same objects as `client.coinm`). */
  readonly coinm: CoinMSurface;
};
