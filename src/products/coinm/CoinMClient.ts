import type { CoreContext } from '../../core/context.js';
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
 * const quote = await coinm.market.markPrice('BTCUSD_PERP');
 * coinm.ws.bookTicker('BTCUSD_PERP', handler);   // product WS surface
 * coinm.close();                                 // product-scoped cleanup
 * ```
 *
 * What the v3 boundary adds over the v2 `createCoinMClient()` factory: the
 * core context is caller-visible (`coinm.core`) — transports, credentials
 * and the event bus are reachable without globals, and two product clients
 * can share one context (one weight budget, one observability stream).
 *
 * **Note on the v3 execution platform / state engine:** COIN-M does not yet
 * have its own `ExecutionPlatform` or `BookEngine` — those modules are
 * currently wired for `'usdm' | 'spot'` only. The full surface (`market`,
 * `account`, `trading`, `execution`, `userStream`, `ws`, `wsUser`) is here
 * and runs over the shared transports; the managed user-data session and
 * the L2 book engine for COIN-M are the next follow-up. Until then, the
 * manual `startUserStream()` path (listen key + 30-minute keep-alive +
 * user WS) is the way to consume COIN-M user data through this client.
 */
export class CoinMClient implements ProductClient {
  readonly product = 'coinm' as const;
  readonly core: CoreContext;

  private readonly surface: CoinMSurface;
  private listenKeyValue: string | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
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
    this.closeUserStream();
    this.surface.ws.close();
    this.surface.wsUser.close();
  }
}
