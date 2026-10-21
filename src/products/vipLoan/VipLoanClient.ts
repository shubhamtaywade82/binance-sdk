import type { CoreContext } from '../../core/context.js';
import { VipLoanResource } from '../../resources/VipLoanResource.js';
import type { ProductClient } from '../types.js';
import { buildVipLoanSurface, type VipLoanSurface } from './surface.js';

/** v3 Binance vipLoan product client. */
export class VipLoanClient implements ProductClient {
  readonly product = "vipLoan" as const;
  readonly core: CoreContext;

  private readonly surface: VipLoanSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildVipLoanSurface(core);
  }

  get vipLoan(): VipLoanResource {
    return this.surface.vipLoan;
  }

  close(): void {
    this.closed = true;
  }
}
