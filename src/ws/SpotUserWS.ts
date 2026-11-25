import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';
import { Signer } from '../client/Signer.js';
import type { Credentials } from '../core/credentials.js';
import { parseSpotUserDataEvent, type SpotUserDataEvent } from '../types/spot.types.js';
import { buildSignaturePayload } from './signature.js';

export { type WsConnectionState };

/** Signed params for `userDataStream.subscribe.signature`, or null without signing credentials. */
export type SpotUserDataSigner = () => Record<string, unknown> | null;

export interface SpotUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  /** Spot WebSocket API URL (`wss://ws-api.binance.com:443/ws-api/v3`). */
  wsApiUrl: string;
  signSubscription: SpotUserDataSigner;
  /**
   * True when the connection is authenticated with session.logon (Ed25519). The subscription
   * then uses unsigned userDataStream.subscribe, which the session authorizes.
   */
  sessionAuthenticated?: () => boolean;
  /**
   * Provides the short-lived margin listen token (from `POST /sapi/v1/userListenToken`).
   * When present (and no session wins), the subscription uses the unsigned
   * `userDataStream.subscribe.listenToken` method — the verified transport of the
   * margin user-data stream (listen-key margin streams are deprecated). The provider
   * is invoked on every (re)subscribe, so it should return a fresh, unexpired token;
   * an invalid token is rejected by Binance with error code `-1209`.
   */
  getListenToken?: () => string | null;
}

/** Builds the signer for the Spot user-data subscription from shared credentials. */
export function createSpotUserDataSigner(credentials: Credentials): SpotUserDataSigner {
  const signer = new Signer({
    algorithm: credentials.signatureAlgorithm,
    apiSecret: credentials.apiSecret,
    privateKey: credentials.privateKey,
  });
  return () => {
    if (!credentials.apiKey || !signer.canSign()) return null;
    // WS API signatures cover the params sorted by name.
    const params = { apiKey: credentials.apiKey, timestamp: Date.now() };
    const payload = buildSignaturePayload({ apiKey: params.apiKey, timestamp: params.timestamp });
    return { ...params, signature: signer.sign(payload) };
  };
}

/** Sends the signed subscribe request on an open connection; resolves with the subscription id. */
export async function subscribeSpotUserData(
  connection: WsConnection,
  signSubscription: SpotUserDataSigner,
): Promise<number> {
  const params = signSubscription();
  if (!params) throw new Error('Spot user data stream requires an API key and secret (or privateKey)');
  const result = (await connection.request('userDataStream.subscribe.signature', params)) as {
    subscriptionId: number;
  };
  return Number(result.subscriptionId);
}

/**
 * Session-authenticated subscribe (verified): `userDataStream.subscribe` on a connection that
 * completed session.logon. No signature is sent, because the session carries authorization.
 */
export async function subscribeSpotUserDataSession(connection: WsConnection): Promise<number> {
  const result = (await connection.request('userDataStream.subscribe', {})) as
    | { subscriptionId?: unknown }
    | undefined;
  if (typeof result?.subscriptionId !== 'number') {
    throw new Error('userDataStream.subscribe returned no subscriptionId');
  }
  return result.subscriptionId;
}

/** Result of a listen-token subscription: the subscription id and the token expiry. */
export interface ListenTokenSubscription {
  subscriptionId: number;
  /** Token expiration epoch ms when Binance reports it (upstream example values are microseconds). */
  expirationTime?: number;
}

/**
 * Margin listen-token subscribe (verified): `userDataStream.subscribe.listenToken` on the
 * WS API takes `{ listenToken }` and returns `result.subscriptionId` plus
 * `result.expirationTime`. The request is unsigned — the short-lived token carries the
 * authorization. Binance rejects an invalid or expired token with error code `-1209`
 * (surfaced as a rejected subscribe promise and an `error` event on the connection).
 */
export async function subscribeSpotUserDataListenToken(
  connection: WsConnection,
  listenToken: string,
): Promise<ListenTokenSubscription> {
  if (!listenToken) {
    throw new Error('listenToken is required for userDataStream.subscribe.listenToken');
  }
  const result = (await connection.request('userDataStream.subscribe.listenToken', {
    listenToken,
  })) as { subscriptionId?: unknown; expirationTime?: unknown } | undefined;
  if (typeof result?.subscriptionId !== 'number') {
    throw new Error('userDataStream.subscribe.listenToken returned no subscriptionId');
  }
  return {
    subscriptionId: result.subscriptionId,
    expirationTime: typeof result.expirationTime === 'number' ? result.expirationTime : undefined,
  };
}

/** Unwraps a WS API event frame `{subscriptionId, event}`; undefined for anything else. */
export function unwrapSpotUserFrame(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== 'object' || !('event' in parsed)) return undefined;
  return (parsed as { event: unknown }).event;
}

/**
 * Spot user-data stream over the WebSocket API subscription.
 *
 * Binance retired the `POST/PUT/DELETE /api/v3/userDataStream` listen keys on
 * 2026-02-20; the stream now rides a WS API connection that re-subscribes on
 * every open, reconnect and 24h rotation. No keep-alive is needed.
 */
export class SpotUserWS extends WsConnection {
  private readonly signSubscription: SpotUserDataSigner;
  private readonly sessionAuthenticated: (() => boolean) | undefined;
  private readonly getListenToken: (() => string | null) | undefined;
  private subscription: Promise<number> | null = null;

  constructor(options: SpotUserWSOptions) {
    const { wsApiUrl, signSubscription, sessionAuthenticated, getListenToken, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'spotUser',
      buildUrl: () => wsApiUrl,
    });
    this.signSubscription = signSubscription;
    this.sessionAuthenticated = sessionAuthenticated;
    this.getListenToken = getListenToken;
    this.on('open', () => this.resubscribe());
    this.on('rotated', () => this.resubscribe());
  }

  /**
   * Connect and subscribe; resolves with the subscription id once Binance accepts it.
   * Subscription mode precedence: session.logon → margin listen token → signed API key.
   */
  async start(): Promise<number> {
    if (
      !this.sessionAuthenticated?.() &&
      !this.getListenToken?.() &&
      !this.signSubscription()
    ) {
      throw new Error(
        'User data stream requires a session (Ed25519), a listen token, or an API key and secret (or privateKey)',
      );
    }
    this.connect();
    await this.waitForOpen();
    return this.subscription as Promise<number>;
  }

  private resubscribe(): void {
    if (this.sessionAuthenticated?.()) {
      this.subscription = subscribeSpotUserDataSession(this);
    } else {
      const listenToken = this.getListenToken?.();
      this.subscription = listenToken
        ? subscribeSpotUserDataListenToken(this, listenToken).then(
            ({ subscriptionId }) => subscriptionId,
          )
        : subscribeSpotUserData(this, this.signSubscription);
    }
    this.subscription.catch((err: unknown) => {
      if (this.getState() === 'CLOSED' || this.getState() === 'CLOSING') return;
      this.emit('error', err);
    });
  }

  protected override handleRawMessage(text: string): void {
    const parsed = this.parseFrame(text);
    if (parsed === undefined || this.dispatchAck(parsed)) return;
    const frame = unwrapSpotUserFrame(parsed);
    if (frame === undefined) return;
    const lifecycle = (frame as { e?: unknown }).e;
    if (lifecycle === 'serverShutdown') {
      // Preemptive rollover before the shutdown time T: 'rotated' triggers the resubscribe.
      this.emit('serverShutdown', frame);
      this.rotateNow();
      return;
    }
    if (lifecycle === 'eventStreamTerminated') {
      this.emit('eventStreamTerminated', frame);
      this.resubscribe();
      return;
    }
    try {
      const event: SpotUserDataEvent = parseSpotUserDataEvent(frame);
      this.emit(event.e, event);
      this.emit('userData', event);
    } catch (err) {
      this.emit('error', err);
    }
  }
}
