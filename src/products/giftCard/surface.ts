import type { CoreContext } from '../../core/context.js';
import { GiftCardResource } from '../../resources/GiftCardResource.js';

/** giftCard product surface. */
export interface GiftCardSurface {
  giftCard: GiftCardResource;
}

/** Build the giftCard surface over a shared {@link CoreContext}. */
export function buildGiftCardSurface(core: CoreContext): GiftCardSurface {
  return { giftCard: new GiftCardResource(core.http('apiRoot')) };
}
