import type { EventBus } from '../core/events.js';
import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';
import { parseUserDataEvent, type UserDataEvent } from '../types/userdata.types.js';

export { type WsConnectionState };

export interface FuturesUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  baseUserUrl: string;
  getListenKey: () => string | null;
}

/**
 * USD-M futures user-data stream.
 *
 * Refactored onto {@link WsConnection}: the listenKey URL is rebuilt on every
 * (re)connect, reconnects are race-free, the lifecycle is an explicit state
 * machine, and the connection is proactively rotated before Binance's 24h
 * stream limit (with the same listenKey, per Binance docs).
 */
export class FuturesUserWS extends WsConnection {
  private readonly getListenKey: () => string | null;
  private readonly baseUserUrl: string;

  constructor(options: FuturesUserWSOptions) {
    const { baseUserUrl, getListenKey, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'futuresUser',
      buildUrl: () => {
        const listenKey = getListenKey();
        return listenKey ? `${baseUserUrl}/${listenKey}` : null;
      },
    });
    this.baseUserUrl = baseUserUrl;
    this.getListenKey = getListenKey;
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
