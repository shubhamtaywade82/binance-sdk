import type { CoreContext } from '../../core/context.js';
import { Convert } from '../../resources/Convert.js';
import type { ProductClient } from '../types.js';
import { buildConvertSurface, type ConvertSurface } from './surface.js';

/** v3 Binance Convert SAPI product client. */
export class ConvertClient implements ProductClient {
  readonly product = 'convert' as const;
  readonly core: CoreContext;

  private readonly surface: ConvertSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildConvertSurface(core);
  }

  get convert(): Convert {
    return this.surface.convert;
  }

  close(): void {
    this.closed = true;
  }
}
