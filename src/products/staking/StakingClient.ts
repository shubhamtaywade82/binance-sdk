import type { CoreContext } from '../../core/context.js';
import { StakingResource } from '../../resources/StakingResource.js';
import type { ProductClient } from '../types.js';
import { buildStakingSurface, type StakingSurface } from './surface.js';

/** v3 Binance staking product client. */
export class StakingClient implements ProductClient {
  readonly product = "staking" as const;
  readonly core: CoreContext;

  private readonly surface: StakingSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildStakingSurface(core);
  }

  get staking(): StakingResource {
    return this.surface.staking;
  }

  close(): void {
    this.closed = true;
  }
}
