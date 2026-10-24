import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';

export { type WsConnectionState };

export interface PortfolioMarginUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  baseUserUrl: string;
  getListenKey: () => string | null;
}

/**
 * Binance Portfolio Margin user-data WebSocket stream.
 *
 * User stream URL: `wss://fstream.binance.com/pm/ws/<listenKey>`
 *
 * The PM listen-key produces a unified event stream covering UM Futures,
 * CM Futures, and Margin events under one listen-key.
 *
 * Events emitted (Binance Portfolio Margin user-data event types):
 *   - `ACCOUNT_UPDATE`              — UM/CM/Margin account balance / position change
 *   - `ORDER_TRADE_UPDATE`          — UM/CM order status change / fill
 *   - `MARGIN_CALL`                 — margin-call notification
 *   - `CONDITIONAL_ORDER_TRIGGER`   — conditional order trigger event
 *   - `STRATEGY_UPDATE`             — strategy order status change
 *   - `userData`                    — every event (catch-all)
 */
export class PortfolioMarginUserWS extends WsConnection {
  private readonly getListenKey: () => string | null;
  private readonly baseUserUrl: string;

  constructor(options: PortfolioMarginUserWSOptions) {
    const { baseUserUrl, getListenKey, ...connectionOptions } = options;
    super({
      ...connectionOptions,
      name: connectionOptions.name ?? 'portfolioMarginUser',
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
      this.emit('error', new Error('No listenKey available for Portfolio Margin user data stream'));
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
