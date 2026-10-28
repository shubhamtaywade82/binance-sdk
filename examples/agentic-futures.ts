/**
 * Agentic futures session loop — the runnable form of the intraday
 * playbook built on the SDK's agent layer.
 *
 *   scan (15m)  ->  volume-ranked watchlist; on live, the session client
 *                   is rebuilt with a fresh RiskGateway allowlist fence
 *   cycle (30s) ->  breaker check -> deadman refresh -> per-candidate:
 *                   caps -> regime -> confluence score -> risk-gated entry
 *                   with the full protective package (live) or the paper
 *                   ledger (paper)
 *
 * Modes:
 *   AGENT_PAPER=1           paper backend — entries fill at the live mark,
 *                           exits are driven by this loop's ledger
 *   BINANCE_TESTNET=true    testnet REST/WS hosts
 *   (neither)               LIVE trading with the aggressive profile
 *
 * Env: BINANCE_API_KEY, BINANCE_API_SECRET (live/testnet only).
 */
import {
  BinanceClient,
  WatchlistScanner,
  classifyRegime,
  scoreSymbol,
  createAgentGateway,
  SymbolRulesCache,
  executeEntry,
  refreshDeadman,
  emergencyFlatten,
  currentEquity,
  applyLeverage,
  clusterOf,
  DEFAULT_PROFILE,
  safetyOptions,
  type Signal,
  type EntryResult,
  type ExecutionGateway,
} from '../src/index.js';

const PROFILE = DEFAULT_PROFILE;
const PAPER = process.env.AGENT_PAPER === '1';
const TESTNET = process.env.BINANCE_TESTNET === 'true';

interface OpenPosition extends EntryResult {
  openedAt: number;
  tp1Done: boolean;
  tp2Done: boolean;
  /** Extremum since entry, for the paper-mode trailing stop. */
  highWater: number;
}

function log(tag: string, detail: unknown): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${tag}]`, typeof detail === 'string' ? detail : JSON.stringify(detail));
}

function buildClient(safety?: ReturnType<typeof safetyOptions>): BinanceClient {
  return new BinanceClient({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: TESTNET,
    ...(safety ? { safety } : {}),
  });
}

async function main(): Promise<void> {
  log('boot', { paper: PAPER, testnet: TESTNET, profile: PROFILE });

  // Long-lived base client: market data, the scanner's WS, paper gateway.
  const base = new BinanceClient({ testnet: TESTNET });
  await base.syncTime(); // kill -1021 before it happens

  // Paper gateway persists across scans (one wallet, one ledger). The live
  // gateway is rebuilt with each session client so the fresh watchlist
  // allowlist is enforced inside every mutating call.
  const paperGateway = PAPER
    ? createAgentGateway(base, { paper: true, paperBalance: 10_000 })
    : null;
  const rules = new SymbolRulesCache(base);

  const scanner = new WatchlistScanner(base, { profile: PROFILE });
  await scanner.start();

  base.events.on('risk.denied', (e) => log('risk.denied', e));
  base.events.on('execution.rejected', (e) => log('execution.rejected', e));

  let session: BinanceClient | null = null;
  let gateway: ExecutionGateway | null = paperGateway;
  const open = new Map<string, OpenPosition>();

  const scan = async (): Promise<void> => {
    const watch = await scanner.eligibleWatchlist();
    log('scan', { eligible: watch.length, top: watch.slice(0, 5).map((w) => w.symbol) });
    if (PAPER) return; // paper gateway already wired; no allowlist to renew

    session = buildClient(safetyOptions(PROFILE, watch.map((w) => w.symbol)));
    session.events.on('execution.reconciled', (e) => log('execution.reconciled', e));
    session.futures.wsUser.on('ORDER_TRADE_UPDATE', (ev: unknown) => log('fill', ev));
    gateway = createAgentGateway(session);
  };
  await scan();
  setInterval(() => void scan().catch((e) => log('scan.error', String(e))), PROFILE.scanIntervalMs);

  const dayStart = (): number => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };

  /** Paper-mode exit ledger: the legs the simulator cannot rest on the book. */
  const managePaperExits = async (): Promise<void> => {
    if (!gateway) return;
    for (const [symbol, pos] of open) {
      let price: number;
      try {
        price = (await base.futures.market.bookTicker(symbol)).bidPrice;
      } catch {
        continue; // price-feed hiccup — retry next cycle
      }
      const long = pos.side === 'LONG';
      pos.highWater = long
        ? Math.max(pos.highWater, price)
        : Math.min(pos.highWater, price);

      const stopHit = long ? price <= pos.stopPrice : price >= pos.stopPrice;
      const tp1Hit = !pos.tp1Done && (long ? price >= pos.tp1Price : price <= pos.tp1Price);
      const tp2Hit = !pos.tp2Done && (long ? price >= pos.tp2Price : price <= pos.tp2Price);
      const trailHit = pos.tp2Done
        && (long
          ? price <= pos.highWater * (1 - PROFILE.trailCallbackPct / 100)
          : price >= pos.highWater * (1 + PROFILE.trailCallbackPct / 100));
      const timedOut = Date.now() - pos.openedAt > PROFILE.timeStopHours * 3_600_000;

      const closeFraction = async (fraction: number, reason: string): Promise<void> => {
        const qty = Number(pos.quantity) * fraction;
        if (!(qty > 0)) return;
        await gateway!.placeOrder({
          symbol,
          side: long ? 'SELL' : 'BUY',
          type: 'MARKET',
          quantity: qty,
          intentId: `paper-exit-${symbol}-${reason}-${pos.openedAt}`,
        });
        log('paper.exit', { symbol, reason, fraction, price });
      };

      if (stopHit || timedOut) {
        await closeFraction(1, timedOut ? 'time-stop' : 'stop');
        open.delete(symbol);
      } else {
        if (tp1Hit) { await closeFraction(0.4, 'tp1'); pos.tp1Done = true; }
        if (tp2Hit) { await closeFraction(0.3, 'tp2'); pos.tp2Done = true; }
        if (trailHit) { await closeFraction(1, 'trail'); open.delete(symbol); }
      }
    }
  };

  const cycle = async (): Promise<void> => {
    if (!gateway) return;
    const act = session ?? base; // paper sessions act through the base client

    const risk = session?.getRiskStatus();
    if (risk?.circuitBreaker?.tripped) {
      log('halt', { reason: risk.circuitBreaker.reason, detail: risk.circuitBreaker.detail });
      await emergencyFlatten(act, gateway, [...open.keys()]);
      process.exit(1); // halt state — human review required
    }

    const watch = await scanner.eligibleWatchlist();
    await refreshDeadman(act, watch.map((w) => w.symbol), PROFILE, PAPER);
    if (PAPER) await managePaperExits();

    for (const cand of watch) {
      if (open.size >= PROFILE.maxIntradayPositions) break;
      if (open.has(cand.symbol)) continue;
      const inCluster = [...open.keys()].filter((s) => clusterOf(s) === cand.cluster).length;
      if (inCluster >= PROFILE.maxPerCluster) continue;

      const regime = await classifyRegime(act, cand.symbol);
      if (regime === 'CHAOS' || regime === 'SQUEEZE') continue;

      let sig: Signal | null;
      try {
        sig = await scoreSymbol(act, cand.symbol, regime, dayStart());
      } catch (err) {
        log('score.error', { symbol: cand.symbol, err: String(err) });
        continue;
      }
      if (!sig || sig.score < PROFILE.confluenceEntry) continue;

      const equity = await currentEquity(act, gateway);
      try {
        await applyLeverage(act, cand.symbol, PROFILE.maxLeverage, PAPER);
        const res = await executeEntry(act, gateway, rules, cand.symbol, sig, equity);
        if (!res) {
          log('entry.skipped', { symbol: cand.symbol, score: sig.score });
          continue;
        }
        open.set(cand.symbol, {
          ...res,
          openedAt: Date.now(),
          tp1Done: false,
          tp2Done: false,
          highWater: res.entryPrice,
        });
        log('entry', {
          symbol: cand.symbol, side: res.side, score: sig.score, regime,
          qty: res.quantity, entry: res.entryPrice, stop: res.stopPrice,
          legs: res.legs,
        });
      } catch (err) {
        log('entry.error', { symbol: cand.symbol, err: String(err) });
      }
    }
  };

  const runCycle = (): void => { void cycle().catch((e) => log('cycle.error', String(e))); };
  setInterval(runCycle, PROFILE.cycleIntervalMs);
  runCycle();

  process.on('SIGINT', () => {
    log('shutdown', 'SIGINT — disarming deadman, closing sockets');
    if (!PAPER && session) {
      for (const s of open.keys()) {
        // Disarm the deadman so resting SL/TP/trail orders survive the exit.
        void session.futures.trading.setCountdownCancelAll(s, 0).catch(() => {});
      }
    }
    base.closeAllWebSockets();
    process.exit(0);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
