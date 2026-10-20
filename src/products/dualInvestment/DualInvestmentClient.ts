import type { CoreContext } from '../../core/context.js';
import { DualInvestment } from '../../resources/DualInvestment.js';
import type { ProductClient } from '../types.js';
import { buildDualInvestmentSurface, type DualInvestmentSurface } from './surface.js';

/** v3 Binance Dual Investment product client. */
export class DualInvestmentClient implements ProductClient {
  readonly product = 'dualInvestment' as const;
  readonly core: CoreContext;

  private readonly surface: DualInvestmentSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildDualInvestmentSurface(core);
  }

  get dualInvestment(): DualInvestment {
    return this.surface.dualInvestment;
  }

  close(): void {
    this.closed = true;
  }
}
