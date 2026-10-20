import type { CoreContext } from '../../core/context.js';
import { Alpha } from '../../resources/Alpha.js';

/** Alpha product surface. */
export interface AlphaSurface {
  alpha: Alpha;
}

export function buildAlphaSurface(core: CoreContext): AlphaSurface {
  return { alpha: new Alpha(core.http('bapi')) };
}
