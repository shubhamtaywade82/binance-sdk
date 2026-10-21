import type { CoreContext } from '../../core/context.js';
import { VipLoanResource } from '../../resources/VipLoanResource.js';

/** vipLoan product surface. */
export interface VipLoanSurface {
  vipLoan: VipLoanResource;
}

/** Build the vipLoan surface over a shared {@link CoreContext}. */
export function buildVipLoanSurface(core: CoreContext): VipLoanSurface {
  return { vipLoan: new VipLoanResource(core.http('apiRoot')) };
}
