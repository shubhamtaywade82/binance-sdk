import type { CoreContext } from '../../core/context.js';
import { CopyTrading } from '../../resources/CopyTrading.js';

/** Copy Trading product surface. */
export interface CopyTradingSurface {
  copyTrading: CopyTrading;
}

export function buildCopyTradingSurface(core: CoreContext): CopyTradingSurface {
  return { copyTrading: new CopyTrading(core.http('apiRoot')) };
}
