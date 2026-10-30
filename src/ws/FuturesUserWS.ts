import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';
import { parseUserDataEvent, type UserDataEvent } from '../types/userdata.types.js';
import {
  buildPrivateStreamUrl,
  isKnownUserDataEvent,
  type PrivateUrlStyle,
} from './privateUrl.js';

export { type WsConnectionState };

export interface FuturesUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  /**
   * USDⓈ-M private base URL (`wss://fstream.binance.com/private`). Legacy
   * bases ending in `/ws` are tolerated — the builder does not append a
   * second `/ws` segment.
   */
  baseUserUrl: string;
  getListenKey: () => string | null;
  /**
   * Event names to subscribe via the `events` query parameter
   * (e.g. `['ORDER_TRADE_UPDATE', 'ACCOUNT_UPDATE']`). Omit to receive every
   * event type for the listen key (pre-migration behavior). Multiple names are
   * joined with `/` per the documented private-stream contract.
   */
  privateEvents?: readonly string[];
  /** Listen-key placement; default `'query'` (migration-notice format). */
  privateUrlStyle?: PrivateUrlStyle;
}

/**
 * USD-M futures user-data stream.
 *
 * Refactored onto {@link WsConnection}: the listenKey URL is rebuilt on every
 * (re)connect, reconnects are race-free, the lifecycle is an explicit state
 * machine, and the connection is proactively rotated before Binance's 24h
 * stream limit (with the same listenKey, per Binance docs).
 *
 * v3.5.1 — 2026 WebSocket routing migration: the stream connects to the
 * `/private` base with the listen key and event subscription as query
 * parameters (`…/private/ws?listenKey=<key>&events=A/B`), not the legacy
 * `/public/ws/<listenKey>` path form that was decommissioned 2026-04-23.
 * Unknown-but-typed events (new upstream event types) surface as
 * `unknownEvent` + `userData` instead of errors, so they can never crash the
 * stream processor.
 */
export class FuturesUserWS extends WsConnection {
  private readonly getListenKey: () => string | null;
  private readonly baseUserUrl: string;
  private readonly privateEvents?: readonly string[];
  private readonly privateUrlStyle: PrivateUrlStyle;

  constructor(options: FuturesUserWSOptions) {
    const { baseUserUrl, getListenKey, privateEvents, privateUrlStyle, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'futuresUser',
      buildUrl: () =>
        buildPrivateStreamUrl({
          baseUrl: baseUserUrl,
          listenKey: getListenKey(),
          events: privateEvents,
          style: privateUrlStyle,
        }),
    });
    this.baseUserUrl = baseUserUrl;
    this.getListenKey = getListenKey;
    this.privateEvents = privateEvents;
    this.privateUrlStyle = privateUrlStyle ?? 'query';
  }

  /**
   * Start (or restart) the user-data stream. Emits the historical `error`
   * event when no listenKey is available yet, matching the legacy contract.
   */
  override connect(): void {
    if (!this.getListenKey()) {
      this.emit('error', new Error('No listenKey available for user data stream'));
      return;
    }
    super.connect();
  }

  protected override handleRawMessage(text: string): void {
    const parsed = this.parseFrame(text);
    if (parsed === undefined) return;
    try {
      const event: UserDataEvent = parseUserDataEvent(parsed);
      // Unknown-but-typed frames flow through as passthrough events; they
      // surface separately (observability) but never crash the processor.
      if (!isKnownUserDataEvent(event.e)) {
        this.emit('unknownEvent', event);
      }
      this.emit(event.e, event);
      this.emit('userData', event);
    } catch (err) {
      this.emit('error', err);
    }
  }

  /** The user-data stream base URL this instance was configured with. */
  getUserStreamBase(): string {
    return this.baseUserUrl;
  }
}
