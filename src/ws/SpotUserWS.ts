import { parseSpotUserDataEvent, type SpotUserDataEvent } from '../types/spot.types.js';
import { UserWSBase, type UserWSBaseOptions } from './UserWSBase.js';

export type { UserWSBaseOptions };

export interface SpotUserWSOptions extends UserWSBaseOptions {}

/**
 * Spot listenKey user-data stream.
 *
 * Lifecycle is owned by {@link UserWSBase}: one authoritative socket, detached
 * retired sockets (no reconnect races), exponential backoff, listenKey re-read
 * on every reconnect.
 */
export class SpotUserWS extends UserWSBase {
  constructor(options: SpotUserWSOptions) {
    super({ missingListenKeyMessage: 'No spot listenKey available for user data stream', ...options });
  }

  protected handlePayload(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      const event: SpotUserDataEvent = parseSpotUserDataEvent(parsed);
      this.emit(event.e, event);
      this.emit('userData', event);
    } catch (err) {
      this.emit('error', err);
    }
  }
}
