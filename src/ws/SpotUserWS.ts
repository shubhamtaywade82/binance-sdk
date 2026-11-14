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
  private subscription: Promise<number> | null = null;

  constructor(options: SpotUserWSOptions) {
    const { wsApiUrl, signSubscription, sessionAuthenticated, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'spotUser',
      buildUrl: () => wsApiUrl,
    });
    this.signSubscription = signSubscription;
    this.sessionAuthenticated = sessionAuthenticated;
    this.on('open', () => this.resubscribe());
    this.on('rotated', () => this.resubscribe());
  }

  /** Connect and subscribe; resolves with the subscription id once Binance accepts it. */
  async start(): Promise<number> {
    if (!this.sessionAuthenticated?.() && !this.signSubscription()) {
      throw new Error('Spot user data stream requires an API key and secret (or privateKey)');
    }
    this.connect();
    await this.waitForOpen();
    return this.subscription as Promise<number>;
  }

  private resubscribe(): void {
    this.subscription = this.sessionAuthenticated?.()
      ? subscribeSpotUserDataSession(this)
      : subscribeSpotUserData(this, this.signSubscription);
    this.subscription.catch((err: unknown) => this.emit('error', err));
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
