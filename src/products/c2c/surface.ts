import type { CoreContext } from '../../core/context.js';
import { C2C } from '../../resources/C2C.js';

/** C2C product surface. */
export interface C2CSurface {
  c2c: C2C;
}

export function buildC2CSurface(core: CoreContext): C2CSurface {
  return { c2c: new C2C(core.http('apiRoot')) };
}
