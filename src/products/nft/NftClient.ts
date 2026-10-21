import type { CoreContext } from '../../core/context.js';
import { NftResource } from '../../resources/NftResource.js';
import type { ProductClient } from '../types.js';
import { buildNftSurface, type NftSurface } from './surface.js';

/** v3 Binance nft product client. */
export class NftClient implements ProductClient {
  readonly product = "nft" as const;
  readonly core: CoreContext;

  private readonly surface: NftSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildNftSurface(core);
  }

  get nft(): NftResource {
    return this.surface.nft;
  }

  close(): void {
    this.closed = true;
  }
}
