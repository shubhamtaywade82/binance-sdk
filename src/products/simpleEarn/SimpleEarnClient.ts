import type { CoreContext } from '../../core/context.js';
import { SimpleEarnResource } from '../../resources/SimpleEarnResource.js';
import type { ProductClient } from '../types.js';
import { buildSimpleEarnSurface, type SimpleEarnSurface } from './surface.js';

/** v3 Binance simpleEarn product client. */
export class SimpleEarnClient implements ProductClient {
  readonly product = "simpleEarn" as const;
  readonly core: CoreContext;

  private readonly surface: SimpleEarnSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildSimpleEarnSurface(core);
  }

  get simpleEarn(): SimpleEarnResource {
    return this.surface.simpleEarn;
  }

  close(): void {
    this.closed = true;
  }
}
