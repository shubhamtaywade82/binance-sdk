import type { CoreContext } from '../../core/context.js';
import { RebateResource } from '../../resources/RebateResource.js';
import type { ProductClient } from '../types.js';
import { buildRebateSurface, type RebateSurface } from './surface.js';

/** v3 Binance rebate product client. */
export class RebateClient implements ProductClient {
  readonly product = "rebate" as const;
  readonly core: CoreContext;

  private readonly surface: RebateSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildRebateSurface(core);
  }

  get rebate(): RebateResource {
    return this.surface.rebate;
  }

  close(): void {
    this.closed = true;
  }
}
