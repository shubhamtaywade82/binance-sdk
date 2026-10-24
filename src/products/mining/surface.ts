import type { CoreContext } from '../../core/context.js';
import { MiningResource } from '../../resources/MiningResource.js';

/** mining product surface. */
export interface MiningSurface {
  mining: MiningResource;
}

/** Build the mining surface over a shared {@link CoreContext}. */
export function buildMiningSurface(core: CoreContext): MiningSurface {
  return { mining: new MiningResource(core.http('apiRoot')) };
}
