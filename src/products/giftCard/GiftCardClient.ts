import type { CoreContext } from '../../core/context.js';
import { GiftCardResource } from '../../resources/GiftCardResource.js';
import type { ProductClient } from '../types.js';
import { buildGiftCardSurface, type GiftCardSurface } from './surface.js';

/** v3 Binance giftCard product client. */
export class GiftCardClient implements ProductClient {
  readonly product = "giftCard" as const;
  readonly core: CoreContext;

  private readonly surface: GiftCardSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildGiftCardSurface(core);
  }

  get giftCard(): GiftCardResource {
    return this.surface.giftCard;
  }

  close(): void {
    this.closed = true;
  }
}
