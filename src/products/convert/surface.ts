import type { CoreContext } from '../../core/context.js';
import { Convert } from '../../resources/Convert.js';

/** Convert SAPI product surface. */
export interface ConvertSurface {
  /** SAPI convert endpoints (RFQ, accept quote, limit orders, trade flow). */
  convert: Convert;
}

/** Build the Convert SAPI surface over a shared {@link CoreContext}. */
export function buildConvertSurface(core: CoreContext): ConvertSurface {
  return { convert: new Convert(core.http('apiRoot')) };
}
