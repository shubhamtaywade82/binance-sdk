import type { CoreContext } from '../../core/context.js';
import { Algo, AlgoFutures, AlgoSpot } from '../../resources/Algo.js';

/** Algo SAPI product surface. */
export interface AlgoSurface {
  /** Spot TWAP/VP algo orders. */
  spot: AlgoSpot;
  /** Futures TWAP/VP algo orders. */
  futures: AlgoFutures;
}

/** Build the Algo surface over a shared {@link CoreContext}. */
export function buildAlgoSurface(core: CoreContext): AlgoSurface {
  const algo = new Algo(core.http('apiRoot'));
  return { spot: algo.spot, futures: algo.futures };
}
