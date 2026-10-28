/**
 * Agentic futures trading — configuration.
 *
 * The profile is the single source of truth for every module in
 * `src/agent/`: the scanner's eligibility gates, the confluence
 * thresholds, position caps and the deadman window. `safetyOptions()`
 * derives a {@link RiskGatewayOptions} fence from the profile and the
 * live watchlist, so a session client can never trade outside the
 * allowlist the scanner produced.
 */
import type { RiskGatewayOptions } from '../risk/RiskGateway.js';

/** Tunable aggressive intraday profile (see docs for the worked 10k-USDT example). */
export interface AgentProfile {
  /** Watchlist refresh cadence (ms). */
  scanIntervalMs: number;
  /** Decision-loop cadence (ms). */
  cycleIntervalMs: number;
  /** Size of the dynamic volume-ranked watchlist. */
  watchlistSize: number;
  /** 24h quote volume floor (USDT) for watchlist eligibility. */
  minQuoteVolume24h: number;
  /** Open-interest floor (USDT notional) for watchlist eligibility. */
  minOpenInterestUsd: number;
  /** Top-of-book spread ceiling (bps) for watchlist eligibility. */
  maxSpreadBps: number;
  /** Confluence score required for an intraday entry (0-100). */
  confluenceEntry: number;
  /** Confluence score required for a swing entry (0-100). */
  confluenceSwing: number;
  /** Equity risked per trade, in percent. */
  riskPerTradePct: number;
  /** Equity risked per high-conviction trade (confluence >= 85). */
  riskPerTradePctHighConviction: number;
  /** Cap applied when sizing (and via setLeverage) — not a safety option. */
  maxLeverage: number;
  /** Maximum concurrent intraday positions. */
  maxIntradayPositions: number;
  /** Maximum concurrent swing positions. */
  maxSwingPositions: number;
  /** Maximum concurrent positions per correlation cluster. */
  maxPerCluster: number;
  /** Deadman (countdown-cancel-all) window, refreshed every cycle (ms). */
  deadmanMs: number;
  /** Trailing-stop callback (%) for the runner after +2R. */
  trailCallbackPct: number;
  /** Wider trailing callback (%) after +3R. */
  trailCallbackWidePct: number;
  /** Intraday dead-trade eviction (hours). */
  timeStopHours: number;
}

/**
 * Aggressive intraday profile. Every value here is a deliberate choice, not a
 * default: 2.5% risk per trade with a 20x leverage cap and a 10% daily-loss
 * circuit breaker is an *aggressive* posture (see the playbook, ch. 9).
 */
export const DEFAULT_PROFILE: AgentProfile = {
  scanIntervalMs: 15 * 60_000,
  cycleIntervalMs: 30_000,
  watchlistSize: 50,
  minQuoteVolume24h: 50_000_000,
  minOpenInterestUsd: 20_000_000,
  maxSpreadBps: 5,
  confluenceEntry: 70,
  confluenceSwing: 80,
  riskPerTradePct: 2.5,
  riskPerTradePctHighConviction: 3.0,
  maxLeverage: 20,
  maxIntradayPositions: 4,
  maxSwingPositions: 2,
  maxPerCluster: 2,
  deadmanMs: 300_000,
  trailCallbackPct: 1.0,
  trailCallbackWidePct: 1.5,
  timeStopHours: 4,
};

/**
 * Coarse correlation clusters for the `maxPerCluster` cap. Symbols not listed
 * fall into `'OTHER'`. Extend to match your own correlation view — the caps
 * only bite for symbols the map actually clusters.
 */
export const CLUSTERS: Record<string, readonly string[]> = {
  'BTC-BETA': ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'],
  'L1': ['SOLUSDT', 'AVAXUSDT', 'SUIUSDT', 'APTUSDT', 'NEARUSDT'],
  'MEME': ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'WIFUSDT'],
  'AI': ['TAOUSDT', 'FETUSDT', 'RNDRUSDT', 'ARKMUSDT'],
};

/** The cluster a symbol belongs to (`'OTHER'` when unclustered). */
export function clusterOf(symbol: string): string {
  for (const [name, members] of Object.entries(CLUSTERS)) {
    if (members.includes(symbol)) return name;
  }
  return 'OTHER';
}

/**
 * RiskGateway fence for a session: the watchlist becomes the hard symbol
 * allowlist, and the profile's notional / daily-loss / failure caps become
 * circuit breakers enforced inside every mutating call. Withdrawals are
 * always denied.
 */
export function safetyOptions(profile: AgentProfile, watchlist: string[]): RiskGatewayOptions {
  return {
    allowedSymbols: watchlist,
    maxNotionalPerOrder: 25_000,
    maxOpenNotional: 24_000,
    maxDailyLoss: 1_000,
    maxConsecutiveFailures: 5,
    allowWithdrawals: false,
    // NOTE: leverage is *not* a RiskGateway option in this SDK; the profile's
    // maxLeverage cap is applied via futures.trading.setLeverage and passed to
    // ops.sizePosition when sizing.
  };
}
