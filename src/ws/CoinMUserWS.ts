import { parseUserDataEvent, type UserDataEvent } from '../types/userdata.types.js';
import { UserWSBase, type UserWSBaseOptions } from './UserWSBase.js';

export type { UserWSBaseOptions };

export interface CoinMUserWSOptions extends UserWSBaseOptions {}

/**
 * COIN-M user data events (ACCOUNT_UPDATE, ORDER_TRADE_UPDATE, MARGIN_CALL) share the same
 * event shape as USD-M's, so the USD-M parser/types are reused as-is.
 *
 * Lifecycle is owned by {@link UserWSBase}: one authoritative socket, detached
 * retired sockets (no reconnect races), exponential backoff, listenKey re-read
 * on every reconnect.
 */
export class CoinMUserWS extends UserWSBase {
  constructor(options: CoinMUserWSOptions) {
    super({ missingListenKeyMessage: 'No COIN-M listenKey available for user data stream', ...options });
  }

  protected handlePayload(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      const event: UserDataEvent = parseUserDataEvent(parsed);
      this.emit(event.e, event);
      this.emit('userData', event);
    } catch (err) {
      this.emit('error', err);
    }
  }
}
