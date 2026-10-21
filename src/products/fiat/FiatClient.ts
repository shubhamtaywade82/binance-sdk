import type { CoreContext } from '../../core/context.js';
import { FiatResource } from '../../resources/FiatResource.js';
import type { ProductClient } from '../types.js';
import { buildFiatSurface, type FiatSurface } from './surface.js';

/** v3 Binance fiat product client. */
export class FiatClient implements ProductClient {
  readonly product = "fiat" as const;
  readonly core: CoreContext;

  private readonly surface: FiatSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildFiatSurface(core);
  }

  get fiat(): FiatResource {
    return this.surface.fiat;
  }

  close(): void {
    this.closed = true;
  }
}
