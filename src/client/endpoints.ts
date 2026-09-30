export type Environment = 'live' | 'testnet' | 'demo';

export interface Endpoints {
  restRoot: string;
  restFapi: string;
  restFuturesData: string;
  restSpot: string;
  restApiRoot: string;
  restDapiRoot: string;
  restDapi: string;
  /** USDⓈ-M `/market` combined-stream URL (trades, klines, tickers, mark price, …). */
  wsMarket: string;
  /** USDⓈ-M `/public` combined-stream URL (book tickers and depth / RPI depth). */
  wsPublic: string;
  wsUser: string;
  wsApi: string;
  wsSpotMarket: string;
  wsSpotUser: string;
  wsSpotApi: string;
  wsDapiMarket: string;
  wsDapiUser: string;
}

export function resolveEnvironment(options?: {
  testnet?: boolean;
  demo?: boolean;
  apiBase?: string;
  wsBase?: string;
  /** Override for the USDⓈ-M `/public` stream URL (defaults to `wsBase` with `/market/` swapped for `/public/`). */
  wsPublicBase?: string;
  wsUserBase?: string;
  wsApiBase?: string;
  dapiBase?: string;
  wsSpotApiBase?: string;
  wsDapiBase?: string;
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
  // `/stream` was decommissioned 2026-04-23); user data stays on `/ws`.
  const wsFuturesRoot =
    env === 'demo'
      ? 'wss://demo-fstream.binance.com'
      : env === 'testnet'
        ? 'wss://fstream.binancefuture.com'
        : 'wss://fstream.binance.com';
  const wsMarketHost = options?.wsBase ?? `${wsFuturesRoot}/market/stream`;
  const wsPublicHost =
    options?.wsPublicBase ??
    (options?.wsBase ? options.wsBase.replace(/\/market(\/|$)/, '/public$1') : `${wsFuturesRoot}/public/stream`);

  const wsUserHost =
    options?.wsUserBase ??
    (env === 'demo'
      ? 'wss://demo-fstream.binance.com/ws'
      : env === 'testnet'
        ? 'wss://fstream.binancefuture.com/ws'
        : 'wss://fstream.binance.com/ws');

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
  const wsDapiHost =
    options?.wsDapiBase ??
    (env === 'testnet' || env === 'demo' ? 'wss://dstream.binancefuture.com' : 'wss://dstream.binance.com');

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
      wsPublic: wsPublicHost,
      wsUser: wsUserHost,
      wsApi: wsApiHost,
      wsSpotMarket: wsSpotMarketHost,
      wsSpotUser: wsSpotUserHost,
      wsSpotApi: wsSpotApiHost,
      wsDapiMarket: `${wsDapiHost}/stream`,
      wsDapiUser: `${wsDapiHost}/ws`,
    },
  };
}
