import type { WsConnectionOptions, WsConnectionState } from './WsConnection.js';
import { WsConnection } from './WsConnection.js';
import {
  isKnownPmUserEvent,
  parsePmUserEvent,
  type PmUserEvent,
} from '../types/pmUserdata.types.js';

export { type WsConnectionState };

export interface PortfolioMarginUserWSOptions extends Omit<WsConnectionOptions, 'buildUrl'> {
  baseUserUrl: string;
  getListenKey: () => string | null;
}

/**
 * Binance Portfolio Margin user-data WebSocket stream.
 *
 * User stream URL: `wss://fstream.binance.com/pm/ws/<listenKey>` — pass
 * `wss://fstream.binance.com/pm-classic` as {@link baseUserUrl} for the
 * Portfolio Margin Pro stream (listenKey via `POST /fapi/v1/listenKey`).
 *
 * The PM listen-key produces a unified event stream covering UM Futures,
 * CM Futures, and Margin events under one listen-key.
 *
 * Modelled events (strictly validated via `parsePmUserEvent`, fields
 * preserved):
 *   - `PM_PRO_ACCOUNT_UPDATE` — PM-Pro account asset status push (every 5 s)
 *   - `riskLevelChange`       — risk-ratio (uniMMR) degradation guidance
 *   - `openOrderLoss`         — account-level open order loss in USD
 *                               (aggregated `o` string since 2026-11-23)
 *   - `ALGO_UPDATE`           — algo order update (`ao.ia` trailing-stop flag)
 *
 * Unmodelled events (e.g. `ACCOUNT_UPDATE`, `ORDER_TRADE_UPDATE`,
 * `STRATEGY_UPDATE`) surface through the unknown-but-typed passthrough: the
 * full raw frame is preserved and emitted under its own name plus
 * `userData`, and additionally as `unknownEvent` for observability, so a new
 * upstream event can never crash the stream processor.
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
      const parsed = this.parseFrame(text) as { e?: string; [key: string]: unknown } | undefined;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.e !== 'string') {
        // Not a user-data event frame (e.g. protocol payloads); legacy contract.
        this.emit('raw', parsed);
        return;
      }
      const event: PmUserEvent = parsePmUserEvent(parsed);
      if (!isKnownPmUserEvent(event.e)) {
        this.emit('unknownEvent', event);
      }
      this.emit(event.e, event);
      this.emit('userData', event);
    } catch (err) {
      this.emit('error', err);
    }
  }

  getUserStreamBase(): string {
    return this.baseUserUrl;
  }
}
