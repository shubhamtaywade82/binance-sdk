import type { CoreContext } from '../../core/context.js';
import { MiningResource } from '../../resources/MiningResource.js';
import type { ProductClient } from '../types.js';
import { buildMiningSurface, type MiningSurface } from './surface.js';

/** v3 Binance mining product client. */
export class MiningClient implements ProductClient {
  readonly product = "mining" as const;
  readonly core: CoreContext;

  private readonly surface: MiningSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildMiningSurface(core);
  }

  get mining(): MiningResource {
    return this.surface.mining;
  }

  close(): void {
    this.closed = true;
  }
}
