import type { CoreContext } from '../../core/context.js';
import { SimpleEarnResource } from '../../resources/SimpleEarnResource.js';

/** simpleEarn product surface. */
export interface SimpleEarnSurface {
  simpleEarn: SimpleEarnResource;
}

/** Build the simpleEarn surface over a shared {@link CoreContext}. */
export function buildSimpleEarnSurface(core: CoreContext): SimpleEarnSurface {
  return { simpleEarn: new SimpleEarnResource(core.http('apiRoot')) };
}
