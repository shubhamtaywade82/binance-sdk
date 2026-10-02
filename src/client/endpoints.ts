export type Environment = 'live' | 'testnet' | 'demo';

export interface Endpoints {
  restRoot: string;
  restFapi: string;
  restFuturesData: string;
  restSpot: string;
  restApiRoot: string;
  restDapiRoot: string;
  restDapi: string;
  /** USDⓈ-M `/market` combined-stream URL (trades, klines, tickers, mark price, contract info, …). */
  wsMarket: string;
  /** USDⓈ-M `/public` combined-stream URL (book tickers, depth, RPI depth). */
  wsMarketPublic: string;
  wsUser: string;
  wsApi: string;
  wsSpotMarket: string;
  wsSpotUser: string;
  wsSpotApi: string;
  /**
   * COIN-M combined market-stream socket (per-symbol streams). Binance migrated
   * COIN-M delivery routing to the new `/market` URL path (mirror of the
   * USDⓈ-M migration); the legacy `/stream` path is being shut down.
   */
  wsDapiMarket: string;
  /**
   * COIN-M public all-market socket (aggregate streams like `!ticker@arr`,
   * `!bookTicker`, `!contractInfo`). New `/public` URL path introduced in the
   * 2026 COIN-M WS routing migration.
   */
  wsDapiMarketPublic: string;
  wsDapiUser: string;
}

export function resolveEnvironment(options?: {
  testnet?: boolean;
  demo?: boolean;
  apiBase?: string;
  wsBase?: string;
  /** Override for the USDⓈ-M `/public` stream URL (defaults to `wsBase` with `/market/` swapped for `/public/`). */
  wsMarketPublicBase?: string;
  wsUserBase?: string;
  wsApiBase?: string;
  dapiBase?: string;
  wsSpotApiBase?: string;
  wsDapiBase?: string;
  wsDapiMarketPublicBase?: string;
}): { env: Environment; endpoints: Endpoints } {
  const env: Environment = options?.demo ? 'demo' : options?.testnet ? 'testnet' : 'live';

  const restHost =
    options?.apiBase ??
    (env === 'demo'
      ? 'https://demo-fapi.binance.com'
      : env === 'testnet'
        ? 'https://testnet.binancefuture.com'
        : 'https://fapi.binance.com');

  // USDⓈ-M market streams are routed over `/market` and `/public` (legacy
  // `/stream` was decommissioned 2026-04-23).
  const wsFuturesRoot =
    env === 'demo'
      ? 'wss://demo-fstream.binance.com'
      : env === 'testnet'
        ? 'wss://fstream.binancefuture.com'
        : 'wss://fstream.binance.com';
  const wsMarketHost = options?.wsBase ?? `${wsFuturesRoot}/market/stream`;
  const wsMarketPublicHost =
    options?.wsMarketPublicBase ??
    (options?.wsBase ? options.wsBase.replace(/\/market(\/|$)/, '/public$1') : `${wsFuturesRoot}/public/stream`);

  const wsUserHost =
    options?.wsUserBase ??
    (env === 'demo'
      ? 'wss://demo-fstream.binance.com/public/ws'
      : env === 'testnet'
        ? 'wss://fstream.binancefuture.com/public/ws'
        : 'wss://fstream.binance.com/public/ws');

  const wsApiHost =
    options?.wsApiBase ??
    (env === 'demo'
      ? 'wss://demo-fapi.binance.com/ws-fapi/v1'
      : 'wss://ws-fapi.binance.com/ws-fapi/v1');

  const restSpotHost =
    options?.apiBase ??
    (env === 'testnet' ? 'https://testnet.binance.vision' : 'https://api.binance.com');

  const wsSpotMarketHost =
    options?.wsBase ??
    (env === 'testnet' ? 'wss://testnet.binance.vision/stream' : 'wss://stream.binance.com:9443/stream');

  const wsSpotUserHost =
    options?.wsUserBase ??
    (env === 'testnet' ? 'wss://testnet.binance.vision/ws' : 'wss://stream.binance.com:9443/ws');

  // Binance has no dedicated COIN-M demo trading host, so demo mode falls back to testnet.
  const restDapiHost =
    options?.dapiBase ??
    (env === 'testnet' || env === 'demo' ? 'https://testnet.binancefuture.com' : 'https://dapi.binance.com');

  const wsSpotApiHost =
    options?.wsSpotApiBase ??
    (env === 'testnet' ? 'wss://testnet.binance.vision/ws-api/v3' : 'wss://ws-api.binance.com:443/ws-api/v3');

  // Binance has no dedicated COIN-M demo WS host either, so demo mode falls back to testnet here too.
  // The COIN-M WS routing migration mirrors USDⓈ-M: per-symbol streams move to
  // `/market/stream` and aggregate streams to `/public/stream`; the legacy `/stream`
  // path is being shut down alongside the USDⓈ-M one.
  const wsDapiHost =
    options?.wsDapiBase ??
    (env === 'testnet' || env === 'demo' ? 'wss://dstream.binancefuture.com' : 'wss://dstream.binance.com');
  const wsDapiMarketPublicHost =
    options?.wsDapiMarketPublicBase ??
    (env === 'testnet' || env === 'demo'
      ? 'wss://dstream.binancefuture.com/public/stream'
      : 'wss://dstream.binance.com/public/stream');

  return {
    env,
    endpoints: {
      restRoot: restHost,
      restFapi: `${restHost}/fapi/v1`,
      restFuturesData: `${restHost}/futures/data`,
      restSpot: `${restSpotHost}/api/v3`,
      restApiRoot: restSpotHost,
      restDapiRoot: restDapiHost,
      restDapi: `${restDapiHost}/dapi/v1`,
      wsMarket: wsMarketHost,
      wsMarketPublic: wsMarketPublicHost,
      wsUser: wsUserHost,
      wsApi: wsApiHost,
      wsSpotMarket: wsSpotMarketHost,
      wsSpotUser: wsSpotUserHost,
      wsSpotApi: wsSpotApiHost,
      wsDapiMarket: `${wsDapiHost}/market/stream`,
      wsDapiMarketPublic: wsDapiMarketPublicHost,
      wsDapiUser: `${wsDapiHost}/public/ws`,
    },
  };
}
