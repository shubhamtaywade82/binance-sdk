import type { CoreContext } from '../../core/context.js';
import { FiatResource } from '../../resources/FiatResource.js';

/** fiat product surface. */
export interface FiatSurface {
  fiat: FiatResource;
}

/** Build the fiat surface over a shared {@link CoreContext}. */
export function buildFiatSurface(core: CoreContext): FiatSurface {
  return { fiat: new FiatResource(core.http('apiRoot')) };
}
