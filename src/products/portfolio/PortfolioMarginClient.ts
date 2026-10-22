import type { CoreContext } from '../../core/context.js';
import type { ProductClient } from '../types.js';
import { buildPortfolioMarginSurface, type PortfolioMarginSurface } from './surface.js';

/**
 * v3 Binance Portfolio Margin product client.
 *
 * Exposes the full PM surface (account, UM, CM, margin, portfolio,
 * userStream) over a shared {@link CoreContext}. Same wiring as
 * `client.portfolioMargin` on the multi-product facade.
 *
 * ```ts
 * const pm = new PortfolioMarginClient(new CoreContext({ apiKey, apiSecret }));
 * await pm.core.syncTime();
 * const summary = await pm.account.account();
 * const order = await pm.um.placeOrder({ symbol: 'BTCUSDT', ... });
 * pm.close();
 * ```
 */
export class PortfolioMarginClient implements ProductClient {
  readonly product = 'portfolio' as const;
  readonly core: CoreContext;

  private readonly surface: PortfolioMarginSurface;
  private listenKeyValue: string | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildPortfolioMarginSurface(core);
  }

  get account(): PortfolioMarginSurface['account'] {
    return this.surface.account;
  }

  get um(): PortfolioMarginSurface['um'] {
    return this.surface.um;
  }

  get cm(): PortfolioMarginSurface['cm'] {
    return this.surface.cm;
  }

  get margin(): PortfolioMarginSurface['margin'] {
    return this.surface.margin;
  }

  get portfolio(): PortfolioMarginSurface['portfolio'] {
    return this.surface.portfolio;
  }

  get userStream(): PortfolioMarginSurface['userStream'] {
    return this.surface.userStream;
  }

  /** Wave 8 — Portfolio Margin user-data WebSocket stream. */
  get wsUser(): PortfolioMarginSurface['wsUser'] {
    return this.surface.wsUser;
  }

  /** Start the PM listen-key user-data stream (creates key + 30-min keep-alive). */
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

  /** Close the user stream (timer + listen-key deletion). */
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
  }
}
