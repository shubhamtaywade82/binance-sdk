import type { CoreContext } from '../../core/context.js';
import { ExecutionManager } from '../ExecutionManager.js';
import { PaperExecutionAdapter } from '../paper.js';
import { PaperTradingEngine, type PaperTradingOptions } from '../../paper/PaperTradingEngine.js';
import { FuturesMarket } from '../../resources/FuturesMarket.js';
import { ExecutionPlatform } from './ExecutionPlatform.js';

/**
 * v3 paper execution platform — the assembled paper runtime.
 *
 * See `PaperSession.ts` for the session that replays simulator fills as
 * user-data frames; this module is the one-call wiring of the whole stack:
 * simulator + adapter + execution manager + execution platform, over one
 * shared {@link CoreContext}. Use {@link createPaperExecutionPlatform}.
 */

/** Options for {@link createPaperExecutionPlatform}. */
export interface PaperExecutionPlatformOptions extends PaperTradingOptions {
  /**
   * Report source wiring: pass an adapter when one already routes this engine
   * (e.g. an existing gateway); a fresh one is built otherwise. The platform
   * registers its own listener — since M4, paper reports fan out to every
   * listener, so an execution manager over the same adapter keeps working.
   */
  adapter?: PaperExecutionAdapter;
}

/** The assembled paper execution platform. */
export interface PaperExecutionPlatform {
  /** Execution platform in paper mode — session, trackers, classify, reconcile. */
  platform: ExecutionPlatform;
  /** Paper-backed execution manager: idempotent place/cancel/reconcile. */
  execution: ExecutionManager;
  /** The simulator engine (account, positions, order history). */
  engine: PaperTradingEngine;
  /** The adapter orders flow through. */
  adapter: PaperExecutionAdapter;
}

/**
 * Build a complete paper trading runtime over a shared {@link CoreContext}:
 * simulator + adapter + execution manager + execution platform, all wired.
 *
 * This is "paper as a first-class execution backend": the same
 * {@link ExecutionPlatform} boundary live trading uses, with the simulator in
 * the server seat. Market prices come through the shared core transports
 * (testnet/demo envs and request mocks apply), so a paper run is the live
 * run with the matching engine swapped out.
 *
 * ```ts
 * const core = new CoreContext({ apiKey, apiSecret });
 * const paper = createPaperExecutionPlatform(core, { initialBalance: 25_000 });
 *
 * await paper.platform.startUserSession();      // no network — local session
 * const fill = await paper.execution.placeOrder({
 *   symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01',
 * });
 * // the fill is already folded — same API as live:
 * paper.platform.orders.get(fill.clientOrderId);   // OrderRecord (status: FILLED)
 * paper.platform.positions.get('BTCUSDT');         // PositionRecord (signed amount)
 * ```
 */
export function createPaperExecutionPlatform(
  core: CoreContext,
  options: PaperExecutionPlatformOptions = {},
): PaperExecutionPlatform {
  const { adapter: providedAdapter, market, ...engineOptions } = options;
  // Bind the simulator's price feed to the shared core: same environment,
  // same transports, same request mocks as the rest of the context.
  const engineMarket = market ?? new FuturesMarket(core.http('fapi'));
  const engine = new PaperTradingEngine({ ...engineOptions, market: engineMarket });
  const adapter = providedAdapter ?? new PaperExecutionAdapter(engine);
  const execution = new ExecutionManager(adapter, {
    clientOrderIdPrefix: 'paper',
    events: core.events,
  });
  const platform = new ExecutionPlatform({
    product: 'usdm',
    core,
    executionManager: execution,
    paper: { engine, adapter },
  });
  return { platform, execution, engine, adapter };
}
