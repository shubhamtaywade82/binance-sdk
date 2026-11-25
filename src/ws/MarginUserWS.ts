import { SpotUserWS, type SpotUserDataSigner, type SpotUserWSOptions } from './SpotUserWS.js';

export { type WsConnectionState } from './WsConnection.js';

export interface MarginUserWSOptions extends Omit<SpotUserWSOptions, 'getListenToken'> {
  /**
   * Provides the short-lived margin listen token on every (re)subscribe.
   * Obtain tokens via `margin.account.createListenToken()`; a token is valid
   * for at most 24 hours, so cache it by `expirationTime` and fetch a fresh
   * one before it lapses. An invalid or expired token is rejected with
   * Binance error code `-1209`.
   */
  getListenToken: () => string | null;
}

/**
 * Margin user-data stream over the WebSocket API, authenticated with a
 * short-lived listen token.
 *
 * This is the verified successor to the deprecated listen-key-based margin
 * user data stream (`wss://stream.binance.com:9443/ws/<listenKey>`):
 * `POST /sapi/v1/userListenToken` creates `{token, expirationTime}` and the
 * subscription uses `userDataStream.subscribe.listenToken` on
 * `wss://ws-api.binance.com:443/ws-api/v3`. Events arrive wrapped in a
 * `{subscriptionId, event}` envelope and carry the margin event family
 * (`executionReport` incl. the 2026-04-09 fields `Cs`/`pl`/`pL`/`pY`/`eR`,
 * `balanceUpdate`, `outboundAccountPosition`, …). `eventStreamTerminated`
 * triggers an automatic re-subscribe (as on the spot user stream).
 *
 * Standalone usage:
 *
 * ```ts
 * const { token } = await client.margin.account.createListenToken();
 * const wsUser = new MarginUserWS({
 *   wsApiUrl: client.endpoints.wsSpotApi,
 *   signSubscription: () => null, // unused: the token authorizes the stream
 *   getListenToken: () => currentToken, // refresh via createListenToken before expiry
 * });
 * await wsUser.start();
 * ```
 */
export class MarginUserWS extends SpotUserWS {
  constructor(options: MarginUserWSOptions) {
    super({ ...options, name: options.name ?? 'marginUser' });
  }
}

export type { SpotUserDataSigner };
