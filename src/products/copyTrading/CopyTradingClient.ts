import type { CoreContext } from '../../core/context.js';
import { CopyTrading } from '../../resources/CopyTrading.js';
import type { ProductClient } from '../types.js';
import { buildCopyTradingSurface, type CopyTradingSurface } from './surface.js';

/** v3 Binance Copy Trading product client. */
export class CopyTradingClient implements ProductClient {
  readonly product = 'copyTrading' as const;
  readonly core: CoreContext;

  private readonly surface: CopyTradingSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildCopyTradingSurface(core);
  }

  get copyTrading(): CopyTrading {
    return this.surface.copyTrading;
  }

  close(): void {
    this.closed = true;
  }
}
