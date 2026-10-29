/**
 * Agentic futures trading on top of the SDK's data, risk and execution
 * layers: a volume-ranked watchlist scanner, a five-state regime
 * classifier, a confluence scorer with hard vetoes, and risk-gated
 * execution helpers with live/paper parity through the
 * {@link ../execution/Gateway.html ExecutionGateway}.
 *
 * ```ts
 * import { BinanceClient, WatchlistScanner, classifyRegime, scoreSymbol,
 *          createAgentGateway, executeEntry, safetyOptions } from '@nemesis-oss/binance-sdk';
 * ```
 */
export {
  type AgentProfile,
  DEFAULT_PROFILE,
  CLUSTERS,
  clusterOf,
  safetyOptions,
} from './config.js';
export {
  type Bar,
  ema,
  atr,
  percentile,
  sessionVwap,
  takerRatio,
} from './indicators.js';
export {
  type Regime,
  type RegimeInputs,
  classifyFromInputs,
  classifyRegime,
} from './regime.js';
export {
  type Dir,
  type Setup,
  type Signal,
  type SignalInputs,
  scoreFromInputs,
  scoreSymbol,
} from './signals.js';
export {
  type WatchlistCandidate,
  type WatchlistScannerOptions,
  WatchlistScanner,
} from './scanner.js';
export {
  type LegStatus,
  type EntryResult,
  type ExecutionEngineOptions,
  type ExecuteEntryOptions,
  type TickRules,
  createAgentGateway,
  SymbolRulesCache,
  formatPrice,
  formatQty,
  executeEntry,
  applyLeverage,
  refreshDeadman,
  currentEquity,
  emergencyFlatten,
} from './execute.js';
export {
  type ManagedPosition,
  type ExitDecision,
  toManagedPosition,
  updateHighWater,
  nextExitAction,
  applyExit,
} from './exits.js';
