import type { CoreContext } from '../../core/context.js';
import { StakingResource } from '../../resources/StakingResource.js';

/** staking product surface. */
export interface StakingSurface {
  staking: StakingResource;
}

/** Build the staking surface over a shared {@link CoreContext}. */
export function buildStakingSurface(core: CoreContext): StakingSurface {
  return { staking: new StakingResource(core.http('apiRoot')) };
}
