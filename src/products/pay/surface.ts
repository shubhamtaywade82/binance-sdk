import type { CoreContext } from '../../core/context.js';
import { PayResource } from '../../resources/PayResource.js';

/** pay product surface. */
export interface PaySurface {
  pay: PayResource;
}

/** Build the pay surface over a shared {@link CoreContext}. */
export function buildPaySurface(core: CoreContext): PaySurface {
  return { pay: new PayResource(core.http('apiRoot')) };
}
