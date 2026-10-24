import type { CoreContext } from '../../core/context.js';
import { PayResource } from '../../resources/PayResource.js';
import type { ProductClient } from '../types.js';
import { buildPaySurface, type PaySurface } from './surface.js';

/** v3 Binance pay product client. */
export class PayClient implements ProductClient {
  readonly product = "pay" as const;
  readonly core: CoreContext;

  private readonly surface: PaySurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildPaySurface(core);
  }

  get pay(): PayResource {
    return this.surface.pay;
  }

  close(): void {
    this.closed = true;
  }
}
