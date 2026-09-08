import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';
import { parseSpotUserDataEvent, type SpotUserDataEvent } from '../types/spot.types.js';

export { type WsConnectionState };

export interface SpotUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  baseUserUrl: string;
  getListenKey: () => string | null;
}

/**
 * Spot user-data stream.
 *
 * Refactored onto {@link WsConnection}: race-free reconnection, explicit
 * lifecycle states, and proactive rotation before Binance's 24h stream limit.
 */
export class SpotUserWS extends WsConnection {
  private readonly getListenKey: () => string | null;

  constructor(options: SpotUserWSOptions) {
    const { baseUserUrl, getListenKey, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'spotUser',
      buildUrl: () => {
        const listenKey = getListenKey();
        return listenKey ? `${baseUserUrl}/${listenKey}` : null;
      },
    });
    this.getListenKey = getListenKey;
  }

  /**
   * Start (or restart) the user-data stream. Emits the historical `error`
   * event when no listenKey is available yet, matching the legacy contract.
   */
  override connect(): void {
    if (!this.getListenKey()) {
      this.emit('error', new Error('No spot listenKey available for user data stream'));
      return;
    }
    super.connect();
  }

  protected override handleRawMessage(text: string): void {
    const parsed = this.parseFrame(text);
    if (parsed === undefined) return;
    try {
      const event: SpotUserDataEvent = parseSpotUserDataEvent(parsed);
      this.emit(event.e, event);
      this.emit('userData', event);
    } catch (err) {
      this.emit('error', err);
    }
  }
}
