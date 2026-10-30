export type Environment = 'live' | 'testnet' | 'demo';

export interface Endpoints {
  restRoot: string;
  restFapi: string;
  restFuturesData: string;
  restSpot: string;
  restApiRoot: string;
  restDapiRoot: string;
  restDapi: string;
  /** Options API root (https://eapi.binance.com/eapi/v1). */
  restEapi: string;
  /** Portfolio Margin API root (https://papi.binance.com/papi/v1). */
  restPapi: string;
  /** Alpha / BAPI root (https://www.binance.com/bapi). */
  restBapi: string;
  /** USDⓈ-M `/market` combined-stream URL (trades, klines, tickers, mark price, contract info, …). */
  wsMarket: string;
  /** USDⓈ-M `/public` combined-stream URL (book tickers, depth, RPI depth). */
  wsMarketPublic: string;
  /**
   * USDⓈ-M `/private` base URL — user-data streams (v3.5.1). The listen key
   * and event subscriptions are attached as query parameters by the shared
   * builder in `src/ws/privateUrl.ts`:
   * `wss://fstream.binance.com/private/ws?listenKey=<listenKey>&events=…`.
   */
  wsPrivate: string;
  /**
   * Deprecated alias of {@link wsPrivate} since v3.5.1 — kept so consumers
   * reading `endpoints.wsUser` keep compiling. Historically this carried the
   * legacy `/public/ws` listenKey base, which the 2026-04-23 WebSocket
   * routing migration decommissioned; it now points at `/private` and must
   * be combined with `buildPrivateStreamUrl`, never by appending the key as
   * a raw path segment.
   *
   * @deprecated use `wsPrivate` (and the private URL builder) instead.
   */
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
  /** COIN-M WebSocket API (`ws-dapi`). */
  wsDapiApi: string;
  /** Options market-stream socket (combined stream URL). */
  wsOptionsMarket: string;
  /** Options user-data stream socket (single listenKey socket). */
  wsOptionsUser: string;
  /** Portfolio Margin user-data stream socket (single listenKey socket). */
  wsPortfolioMarginUser: string;
}

export function resolveEnvironment(options?: {
  testnet?: boolean;
  demo?: boolean;
  apiBase?: string;
  wsBase?: string;
  /** Override for the USDⓈ-M `/public` stream URL (defaults to `wsBase` with `/market/` swapped for `/public/`). */
  wsMarketPublicBase?: string;
  /**
   * Override for the USDⓈ-M `/private` base URL. Since v3.5.1 this is a
   * *private base* (e.g. `wss://fstream.binance.com/private`), not the legacy
   * full `/public/ws` path.
   */
  wsUserBase?: string;
  /** Alias of `wsUserBase` (they configure the same `/private` base). */
  wsPrivateBase?: string;
  wsApiBase?: string;
  dapiBase?: string;
  wsSpotApiBase?: string;
  wsDapiBase?: string;
  wsDapiMarketPublicBase?: string;
  wsDapiApiBase?: string;
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

  // USDⓈ-M user data moved to the routed `/private` base in the 2026-03
  // WebSocket migration; the legacy `/public/ws/<listenKey>` form was
  // decommissioned 2026-04-23. Testnet/demo hosts mirror the live routing
  // structure — see docs/migration notes for validation status.
  const wsPrivateHost =
    options?.wsUserBase ??
    options?.wsPrivateBase ??
    (env === 'demo'
      ? 'wss://demo-fstream.binance.com/private'
      : env === 'testnet'
        ? 'wss://fstream.binancefuture.com/private'
        : 'wss://fstream.binance.com/private');

  const wsApiHost =
    options?.wsApiBase ??
    (env === 'demo'
      ? 'wss://demo-fapi.binance.com/ws-fapi/v1'
      : env === 'testnet'
        ? 'wss://testnet.binancefuture.com/ws-fapi/v1'
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

  const wsDapiApiHost =
    options?.wsDapiApiBase ??
    (env === 'testnet' || env === 'demo'
      ? 'wss://testnet.binancefuture.com/ws-dapi/v1'
      : 'wss://ws-dapi.binance.com/ws-dapi/v1');

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
      // New product hosts — Options, Portfolio Margin, Alpha / BAPI. They use
      // distinct hosts (eapi.binance.com, papi.binance.com, www.binance.com)
      // independent of the futures testnet/demo modes. When testnet/demo hosts
      // become available, these can be parameterized via options.
      restEapi: 'https://eapi.binance.com/eapi/v1',
      restPapi: 'https://papi.binance.com/papi/v1',
      // Note: restBapi uses the bare www host because Alpha paths already
      // include the `/bapi` prefix (e.g. `/bapi/defi/v1/public/alpha-trade/*`).
      restBapi: 'https://www.binance.com',
      wsMarket: wsMarketHost,
      wsMarketPublic: wsMarketPublicHost,
      wsPrivate: wsPrivateHost,
      wsUser: wsPrivateHost,
      wsApi: wsApiHost,
      wsSpotMarket: wsSpotMarketHost,
      wsSpotUser: wsSpotUserHost,
      wsSpotApi: wsSpotApiHost,
      wsDapiMarket: `${wsDapiHost}/market/stream`,
      wsDapiMarketPublic: wsDapiMarketPublicHost,
      wsDapiUser: `${wsDapiHost}/public/ws`,
      wsDapiApi: wsDapiApiHost,
      // Wave 8 — Options + Portfolio Margin WebSocket hosts.
      wsOptionsMarket: 'wss://nbstream.binance.com/eoptions/stream',
      wsOptionsUser: 'wss://nbstream.binance.com/eoptions/ws',
      wsPortfolioMarginUser: 'wss://fstream.binance.com/pm/ws',
    },
  };
}
