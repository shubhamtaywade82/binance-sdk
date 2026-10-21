import type { CoreContext } from '../../core/context.js';
import { RebateResource } from '../../resources/RebateResource.js';

/** rebate product surface. */
export interface RebateSurface {
  rebate: RebateResource;
}

/** Build the rebate surface over a shared {@link CoreContext}. */
export function buildRebateSurface(core: CoreContext): RebateSurface {
  return { rebate: new RebateResource(core.http('apiRoot')) };
}
