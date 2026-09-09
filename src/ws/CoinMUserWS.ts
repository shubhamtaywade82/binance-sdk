import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';
import {
  parseUserDataEvent,
  type UserDataEvent,
} from '../types/userdata.types.js';

export { type WsConnectionState };

export interface CoinMUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  baseUserUrl: string;
  getListenKey: () => string | null;
}

/**
 * COIN-M user data events (ACCOUNT_UPDATE, ORDER_TRADE_UPDATE, MARGIN_CALL) share the same
 * event shape as USD-M's, so the USD-M parser/types are reused as-is.
 *
 * Refactored onto {@link WsConnection}: race-free reconnection, explicit
 * lifecycle states, and proactive rotation before Binance's 24h stream limit.
 */
export class CoinMUserWS extends WsConnection {
  private readonly getListenKey: () => string | null;

  constructor(options: CoinMUserWSOptions) {
    const { baseUserUrl, getListenKey, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'coinmUser',
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
      this.emit('error', new Error('No COIN-M listenKey available for user data stream'));
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
}
