export type Environment = 'live' | 'testnet' | 'demo';

export interface Endpoints {
  restRoot: string;
  restFapi: string;
  restFuturesData: string;
  restSpot: string;
  restApiRoot: string;
  restDapiRoot: string;
  restDapi: string;
  wsMarket: string;
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

  const wsMarketHost =
    options?.wsBase ??
    (env === 'demo'
      ? 'wss://demo-fstream.binance.com/stream'
      : env === 'testnet'
        ? 'wss://fstream.binancefuture.com/stream'
        : 'wss://fstream.binance.com/stream');

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
