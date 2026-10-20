import type { CoreContext } from '../../core/context.js';
import { AlgoFutures, AlgoSpot } from '../../resources/Algo.js';
import type { ProductClient } from '../types.js';
import { buildAlgoSurface, type AlgoSurface } from './surface.js';

/** v3 Binance Algo SAPI product client. */
export class AlgoClient implements ProductClient {
  readonly product = 'algo' as const;
  readonly core: CoreContext;

  private readonly surface: AlgoSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildAlgoSurface(core);
  }

  get spot(): AlgoSpot {
    return this.surface.spot;
  }

  get futures(): AlgoFutures {
    return this.surface.futures;
  }

  close(): void {
    this.closed = true;
  }
}
