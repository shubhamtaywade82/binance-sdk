import type { CoreContext } from '../../core/context.js';
import { C2C } from '../../resources/C2C.js';
import type { ProductClient } from '../types.js';
import { buildC2CSurface, type C2CSurface } from './surface.js';

/** v3 Binance C2C product client. */
export class C2CClient implements ProductClient {
  readonly product = 'c2c' as const;
  readonly core: CoreContext;

  private readonly surface: C2CSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildC2CSurface(core);
  }

  get c2c(): C2C {
    return this.surface.c2c;
  }

  close(): void {
    this.closed = true;
  }
}
