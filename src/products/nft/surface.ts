import type { CoreContext } from '../../core/context.js';
import { NftResource } from '../../resources/NftResource.js';

/** nft product surface. */
export interface NftSurface {
  nft: NftResource;
}

/** Build the nft surface over a shared {@link CoreContext}. */
export function buildNftSurface(core: CoreContext): NftSurface {
  return { nft: new NftResource(core.http('apiRoot')) };
}
