import type { CoreContext } from '../../core/context.js';
import type { ProductClient } from '../types.js';
import { buildOptionsSurface, type OptionsSurface } from './surface.js';

/**
 * v3 Binance Options product client.
 *
 * The full Options product surface over a shared {@link CoreContext} —
 * identical wiring to `client.options` on the multi-product facade (same
 * construction path, same resources), but standing alone:
 *
 * ```ts
 * const options = new OptionsClient(new CoreContext({ apiKey, apiSecret }));
 * await options.core.syncTime();
 * const info = await options.market.exchangeInfo();
 * const order = await options.trading.placeOrder({ symbol: 'BTC-240329-50000-C', ... });
 * options.close();
 * ```
 */
export class OptionsClient implements ProductClient {
  readonly product = 'options' as const;
  readonly core: CoreContext;

  private readonly surface: OptionsSurface;
  private listenKeyValue: string | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildOptionsSurface(core);
  }

  get market(): OptionsSurface['market'] {
    return this.surface.market;
  }

  get account(): OptionsSurface['account'] {
    return this.surface.account;
  }

  get trading(): OptionsSurface['trading'] {
    return this.surface.trading;
  }

  get mmp(): OptionsSurface['mmp'] {
    return this.surface.mmp;
  }

  get block(): OptionsSurface['block'] {
    return this.surface.block;
  }

  get userStream(): OptionsSurface['userStream'] {
    return this.surface.userStream;
  }

  /**
   * Start the listen-key user-data stream: creates the key, schedules the
   * 30-minute keep-alive. Returns the listenKey for opening the WS connection.
   */
  async startUserStream(): Promise<string> {
    const { listenKey } = await this.surface.userStream.createListenKey();
    this.listenKeyValue = listenKey;
    this.keepAliveInterval = setInterval(() => {
      this.surface.userStream.keepAliveListenKey().catch(() => {
        /* retried on the next tick */
      });
    }, 30 * 60 * 1000);
    return listenKey;
  }

  /** Close the user stream (timer + listen-key deletion). */
  closeUserStream(): void {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = null;
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
  }
}
