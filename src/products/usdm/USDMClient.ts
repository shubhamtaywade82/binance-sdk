import type { CoreContext } from '../../core/context.js';
import { ExecutionPlatform } from '../../execution/platform/ExecutionPlatform.js';
import { BookEngine } from '../../state/platform/BookEngine.js';
import type { ProductClient } from '../types.js';
import { buildUsdmSurface, type UsdmSurface } from './namespace.js';

/**
 * v3 USDⓈ-M futures product client.
 *
 * The full product surface over a shared {@link CoreContext} — identical
 * wiring to `client.futures` on the multi-product facade (same construction
 * path, same `ExecutionManager`, same WS URLs), but standing alone:
 *
 * ```ts
 * const usdm = new USDMClient(new CoreContext({ apiKey, apiSecret }));
 * await usdm.core.syncTime();                  // shared clock sync
 * const fill = await usdm.execution.placeOrder({
 *   symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01',
 * });
 * usdm.ws.bookTicker('BTCUSDT', handler);      // product WS surface
 * usdm.close();                                // product-scoped cleanup
 * ```
 *
 * What the v3 boundary adds over the v2 `createUSDMClient()` factory: the
 * core context is caller-visible (`usdm.core`) — transports, credentials
 * and the event bus are reachable without globals, and two product clients
 * can share one context (one weight budget, one observability stream).
 */
export class USDMClient implements ProductClient {
  readonly product = 'usdm' as const;
  readonly core: CoreContext;

  private readonly surface: UsdmSurface;
  private listenKeyValue: string | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private executionPlatformValue: ExecutionPlatform | undefined;
  private bookEngineValue: BookEngine | undefined;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildUsdmSurface(core, () => this.listenKeyValue);
  }

  get market(): UsdmSurface['market'] {
    return this.surface.market;
  }

  get data(): UsdmSurface['data'] {
    return this.surface.data;
  }

  get account(): UsdmSurface['account'] {
    return this.surface.account;
  }

  get trading(): UsdmSurface['trading'] {
    return this.surface.trading;
  }

  get ops(): UsdmSurface['ops'] {
    return this.surface.ops;
  }

  /** Idempotent order placement with transport-failure reconciliation. */
  get execution(): UsdmSurface['execution'] {
    return this.surface.execution;
  }

  get userStream(): UsdmSurface['userStream'] {
    return this.surface.userStream;
  }

  get ws(): UsdmSurface['ws'] {
    return this.surface.ws;
  }

  get wsUser(): UsdmSurface['wsUser'] {
    return this.surface.wsUser;
  }

  get wsApi(): UsdmSurface['wsApi'] {
    return this.surface.wsApi;
  }

  /**
   * The v3 execution platform: managed user-data stream session, live
   * order/position feeds, and semantic retry classification. Lazily built —
   * a REST-only caller never pays for it.
   *
   * ```ts
   * await usdm.executionPlatform.startUserSession();
   * usdm.executionPlatform.orders.get('nbsdk-…');
   * usdm.executionPlatform.positions.get('BTCUSDT');
   * ```
   */
  get executionPlatform(): ExecutionPlatform {
    if (!this.executionPlatformValue) {
      this.executionPlatformValue = new ExecutionPlatform({
        product: 'usdm',
        core: this.core,
        executionManager: this.surface.execution,
      });
    }
    return this.executionPlatformValue;
  }

  /**
   * The v3 state platform for USDⓈ-M: managed local L2 books over the pooled
   * WS platform + shared REST snapshot transports. Lazily built — a
   * stream-only or REST-only caller never pays for it.
   *
   * ```ts
   * const book = await usdm.books.watch('BTCUSDT');  // resolves once synced
   * book.bestBid;                                     // exact decimal strings
   * book.metrics();                                   // spread, imbalance, …
   * await usdm.books.unwatch('BTCUSDT');
   * ```
   */
  get books(): BookEngine {
    if (!this.bookEngineValue) {
      this.bookEngineValue = new BookEngine({ product: 'usdm', core: this.core });
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
