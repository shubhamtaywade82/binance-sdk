import type { CoreContext } from '../../core/context.js';
import { Alpha } from '../../resources/Alpha.js';
import type { ProductClient } from '../types.js';
import { buildAlphaSurface, type AlphaSurface } from './surface.js';

/** v3 Binance Alpha product client. */
export class AlphaClient implements ProductClient {
  readonly product = 'alpha' as const;
  readonly core: CoreContext;

  private readonly surface: AlphaSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildAlphaSurface(core);
  }

  get alpha(): Alpha {
    return this.surface.alpha;
  }

  close(): void {
    this.closed = true;
  }
}
