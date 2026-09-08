import { parseUserDataEvent, type UserDataEvent } from '../types/userdata.types.js';
import { UserWSBase, type UserWSBaseOptions } from './UserWSBase.js';

export type { UserWSBaseOptions };

export interface FuturesUserWSOptions extends UserWSBaseOptions {}

/**
 * Futures (USD-M) listenKey user-data stream.
 *
 * Lifecycle is owned by {@link UserWSBase}: one authoritative socket, detached
 * retired sockets (no reconnect races), exponential backoff, listenKey re-read
 * on every reconnect.
 */
export class FuturesUserWS extends UserWSBase {
  constructor(options: FuturesUserWSOptions) {
    super({ missingListenKeyMessage: 'No listenKey available for user data stream', ...options });
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
