import type { CoreContext } from '../../core/context.js';
import { DualInvestment } from '../../resources/DualInvestment.js';

/** Dual Investment product surface. */
export interface DualInvestmentSurface {
  dualInvestment: DualInvestment;
}

export function buildDualInvestmentSurface(core: CoreContext): DualInvestmentSurface {
  return { dualInvestment: new DualInvestment(core.http('apiRoot')) };
}
