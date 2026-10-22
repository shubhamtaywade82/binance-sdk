import type { EventBus } from '../core/events.js';
import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';

export { type WsConnectionState };

export interface OptionsUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  baseUserUrl: string;
  getListenKey: () => string | null;
}

/**
 * Binance Options user-data WebSocket stream.
 *
 * User stream URL: `wss://nbstream.binance.com/eoptions/ws/<listenKey>`
 *
 * Events emitted (Binance Options user-data event types):
 *   - `ACCOUNT_UPDATE`   — account balance / position change
 *   - `ORDER_TRADE_UPDATE` — order status change / fill
 *   - `TRADE_UPDATE`     — trade execution
 *   - `MMP_CHANGE`       — Market Maker Protection state change
 *   - `userData`         — every event (catch-all)
 */
export class OptionsUserWS extends WsConnection {
  private readonly getListenKey: () => string | null;
  private readonly baseUserUrl: string;

  constructor(options: OptionsUserWSOptions) {
    const { baseUserUrl, getListenKey, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'optionsUser',
      buildUrl: () => {
        const listenKey = getListenKey();
        return listenKey ? `${baseUserUrl}/${listenKey}` : null;
      },
    });
    this.baseUserUrl = baseUserUrl;
    this.getListenKey = getListenKey;
  }

  override connect(): void {
    if (!this.getListenKey()) {
      this.emit('error', new Error('No listenKey available for Options user data stream'));
      return;
    }
    super.connect();
  }

  protected override handleRawMessage(text: string): void {
    try {
      const parsed = JSON.parse(text) as { e?: string; [key: string]: unknown };
      if (parsed && typeof parsed === 'object' && typeof parsed.e === 'string') {
        this.emit(parsed.e, parsed);
        this.emit('userData', parsed);
      } else {
        this.emit('raw', parsed);
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  getUserStreamBase(): string {
    return this.baseUserUrl;
  }
}
