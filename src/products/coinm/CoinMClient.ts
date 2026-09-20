import type { CoreContext } from '../../core/context.js';
import { ExecutionPlatform } from '../../execution/platform/ExecutionPlatform.js';
import { BookEngine } from '../../state/platform/BookEngine.js';
import type { ProductClient } from '../types.js';
import { buildCoinmSurface, type CoinMSurface } from './surface.js';

/**
 * v3 COIN-M futures product client.
 *
 * The full COIN-M product surface over a shared {@link CoreContext} —
 * identical wiring to `client.coinm` on the multi-product facade (same
 * construction path, same resources, same WS URLs), but standing alone:
 *
 * ```ts
 * const coinm = new CoinMClient(new CoreContext({ apiKey, apiSecret }));
 * await coinm.core.syncTime();                  // shared clock sync
 * const fill = await coinm.execution.placeOrder({
 *   symbol: 'BTCUSD_PERP', side: 'BUY', type: 'MARKET', quantity: 1,
 * });
 * coinm.ws.bookTicker('BTCUSD_PERP', handler);   // product WS surface
 * coinm.close();                                 // product-scoped cleanup
 * ```
 *
 * What the v3 boundary adds over the v2 `createCoinMClient()` factory: the
 * core context is caller-visible (`coinm.core`) — transports, credentials
 * and the event bus are reachable without globals, and two product clients
 * can share one context (one weight budget, one observability stream).
 */
export class CoinMClient implements ProductClient {
  readonly product = 'coinm' as const;
  readonly core: CoreContext;

  private readonly surface: CoinMSurface;
  private listenKeyValue: string | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private executionPlatformValue: ExecutionPlatform | undefined;
  private bookEngineValue: BookEngine | undefined;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildCoinmSurface(core, () => this.listenKeyValue);
  }

  get market(): CoinMSurface['market'] {
    return this.surface.market;
  }

  get account(): CoinMSurface['account'] {
    return this.surface.account;
  }

  get trading(): CoinMSurface['trading'] {
    return this.surface.trading;
  }

  /** Idempotent order placement with transport-failure reconciliation. */
  get execution(): CoinMSurface['execution'] {
    return this.surface.execution;
  }

  get userStream(): CoinMSurface['userStream'] {
    return this.surface.userStream;
  }

  get ws(): CoinMSurface['ws'] {
    return this.surface.ws;
  }

  get wsUser(): CoinMSurface['wsUser'] {
    return this.surface.wsUser;
  }

  /**
   * The v3 execution platform: managed user-data stream session, live
   * order/position feeds, and semantic retry classification. Lazily built —
   * a REST-only caller never pays for it.
   *
   * ```ts
   * await coinm.executionPlatform.startUserSession();
   * coinm.executionPlatform.orders.get('nbsdk-…');
   * coinm.executionPlatform.positions.get('BTCUSD_PERP');
   * ```
   */
  get executionPlatform(): ExecutionPlatform {
    if (!this.executionPlatformValue) {
      this.executionPlatformValue = new ExecutionPlatform({
        product: 'coinm',
        core: this.core,
        executionManager: this.surface.execution,
      });
    }
    return this.executionPlatformValue;
  }

  /**
   * The v3 state platform for COIN-M: managed local L2 books over the pooled
   * WS platform + shared REST snapshot transports. Lazily built — a
   * stream-only or REST-only caller never pays for it.
   *
   * ```ts
   * const book = await coinm.books.watch('BTCUSD_PERP');  // resolves once synced
   * book.bestBid;                                          // exact decimal strings
   * book.metrics();                                        // spread, imbalance, …
   * await coinm.books.unwatch('BTCUSD_PERP');
   * ```
   */
  get books(): BookEngine {
    if (!this.bookEngineValue) {
      this.bookEngineValue = new BookEngine({ product: 'coinm', core: this.core });
    }
    return this.bookEngineValue;
  }

  /**
   * Start the listen-key user-data stream: creates the key, schedules the
   * 30-minute keep-alive, and opens the user WS. Scoped to this product —
   * unlike the multi-product facade, no other product's sockets are touched.
   */
  async startUserStream(): Promise<string> {
    const { listenKey } = await this.surface.userStream.createListenKey();
    this.listenKeyValue = listenKey;
    this.keepAliveInterval = setInterval(() => {
      this.surface.userStream.keepAliveListenKey().catch(() => {
        /* retried on the next tick */
      });
    }, 30 * 60 * 1000);
    this.surface.wsUser.connect();
    return listenKey;
  }

  /** Close the user stream (timer, socket, and listen-key deletion). */
  closeUserStream(): void {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = null;
    this.surface.wsUser.close();
    this.surface.userStream.closeListenKey().catch(() => {
      /* best-effort cleanup */
    });
    this.listenKeyValue = null;
  }

  /** Close this product's resources. Safe to call more than once. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.executionPlatformValue?.close();
    this.bookEngineValue?.close();
    this.closeUserStream();
    this.surface.ws.close();
    this.surface.wsUser.close();
  }
}
