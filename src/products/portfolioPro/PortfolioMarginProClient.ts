import type { CoreContext } from '../../core/context.js';
import { PortfolioMarginPro } from '../../resources/PortfolioMarginPro.js';
import type { ProductClient } from '../types.js';
import { buildPortfolioMarginProSurface, type PortfolioMarginProSurface } from './surface.js';

/** v3 Binance Portfolio Margin Pro product client. */
export class PortfolioMarginProClient implements ProductClient {
  readonly product = 'portfolioPro' as const;
  readonly core: CoreContext;

  private readonly surface: PortfolioMarginProSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildPortfolioMarginProSurface(core);
  }

  get account(): PortfolioMarginPro {
    return this.surface.account;
  }

  close(): void {
    this.closed = true;
  }
}
