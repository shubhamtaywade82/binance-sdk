/**
 * Startup/per-cycle reconciliation between the session loop's ledger and the
 * account's actual exposure.
 *
 * The v3.3 example kept open positions in an in-memory map that was never
 * reconciled against the exchange: positions from a previous process, or
 * opened outside the SDK (manual terminal trades, another bot sharing the
 * key), were invisible — the caps counted them as zero and the loop could
 * pyramid onto exposure it did not control.
 *
 * `reconcilePositions` snapshots the account's open positions (live:
 * `GET /fapi/v3/positionRisk`; paper: the simulator's ledger), reports the
 * aggregate notional per symbol for the exposure cap, and names the symbols
 * whose exposure the loop does NOT track. The loop refuses fresh entries on
 * those symbols (fail-closed: the agent never stacks onto positions whose
 * protective orders it cannot see) while their own resting orders keep
 * managing them.
 */
import type { BinanceClient } from '../client/BinanceClient.js';
import type { ExecutionGateway } from '../execution/Gateway.js';

export interface PositionSnapshot {
  /** Open notional per symbol (quote currency), every currently-held position. */
  notional: Record<string, number>;
  /** Symbols holding exposure this loop does not manage (not in `tracked`). */
  untracked: string[];
}

/** True when `symbol` holds exposure the loop already manages. */
function isTracked(
  symbol: string,
  tracked: ReadonlyMap<string, unknown> | ReadonlySet<string>,
): boolean {
  return tracked instanceof Map ? tracked.has(symbol) : tracked.has(symbol);
}

/**
 * Snapshot every open position on the account (or the simulator) and classify
 * each as tracked / untracked by the session loop.
 */
export async function reconcilePositions(
  client: BinanceClient,
  gateway: ExecutionGateway,
  tracked: ReadonlyMap<string, unknown> | ReadonlySet<string>,
): Promise<PositionSnapshot> {
  const notional: Record<string, number> = {};

  if (gateway.backend === 'paper') {
    for (const pos of gateway.paperEngine.getOpenPositions()) {
      notional[pos.symbol] = Math.abs(pos.quantity) * pos.entryPrice;
    }
  } else {
    const risks = await client.futures.account.positionRiskV3();
    for (const p of risks) {
      if (p.positionAmt === 0) continue;
      notional[p.symbol] = Math.abs(p.notional);
    }
  }

  const untracked = Object.keys(notional).filter((symbol) => !isTracked(symbol, tracked));
  return { notional, untracked };
}
