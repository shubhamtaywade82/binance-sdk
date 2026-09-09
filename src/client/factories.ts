import { BinanceClient, type BinanceClientOptions } from './BinanceClient.js';

/**
 * Standalone product clients.
 *
 * `BinanceClient` is the full multi-product surface; these factories give
 * focused callers just their product plus the shared lifecycle helpers
 * (`syncTime`, `close`), constructed from the same client underneath — no
 * duplicated wiring, no divergent behavior:
 *
 * ```ts
 * import { createSpotClient, createUSDMClient } from '@nemesis-oss/binance-sdk';
 *
 * const spot = createSpotClient({ apiKey, apiSecret });
 * await spot.syncTime();
 * const books = await spot.market.depth('BTCUSDT', 20);
 * spot.close();
 *
 * const usdm = createUSDMClient({ apiKey, apiSecret });
 * await usdm.execution.placeOrder({ symbol: 'BTCUSDT', ... });
 * ```
 */

/** The spot product surface plus shared lifecycle helpers. */
export type SpotClient = BinanceClient['spot'] & {
  /** Sync local clocks against every REST host (mitigates -1021). */
  syncTime(): Promise<void>;
  /** Close all websockets and user streams created for this client. */
  close(): void;
  /** Rate-limit usage snapshots, per REST host. */
  getRateLimitUsage(): ReturnType<BinanceClient['getRateLimitUsage']>;
};

/** The USDⓈ-M futures product surface plus shared lifecycle helpers. */
export type USDMClient = BinanceClient['futures'] & {
  syncTime(): Promise<void>;
  close(): void;
  getRateLimitUsage(): ReturnType<BinanceClient['getRateLimitUsage']>;
};

/** The COIN-M futures product surface plus shared lifecycle helpers. */
export type CoinMClient = BinanceClient['coinm'] & {
  syncTime(): Promise<void>;
  close(): void;
  getRateLimitUsage(): ReturnType<BinanceClient['getRateLimitUsage']>;
};

function lifecycle(client: BinanceClient) {
  return {
    syncTime: (): Promise<void> => client.syncTime(),
    close: (): void => client.closeAllWebSockets(),
    getRateLimitUsage: (): ReturnType<BinanceClient['getRateLimitUsage']> =>
      client.getRateLimitUsage(),
  };
}

/** A spot-only client (market, account, trading, execution, ws, wsApi). */
export function createSpotClient(options: BinanceClientOptions = {}): SpotClient {
  const client = new BinanceClient(options);
  return { ...client.spot, ...lifecycle(client) };
}

/** A USDⓈ-M futures-only client (market, data, account, trading, ops, execution, ws, wsApi). */
export function createUSDMClient(options: BinanceClientOptions = {}): USDMClient {
  const client = new BinanceClient(options);
  return { ...client.futures, ...lifecycle(client) };
}

/** A COIN-M futures-only client (market, account, trading, ws). */
export function createCoinMClient(options: BinanceClientOptions = {}): CoinMClient {
  const client = new BinanceClient(options);
  return { ...client.coinm, ...lifecycle(client) };
}
