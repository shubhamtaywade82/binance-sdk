/**
 * Agentic futures session loop — the runnable form of the intraday
 * playbook built on the SDK's agent layer.
 *
 *   scan (15m)  ->  volume-ranked watchlist; the session client's allowlist
 *                   is refreshed IN PLACE (setAllowedSymbols) so daily-loss
 *                   and breaker state survive every refresh
 *   cycle (30s)  ->  realized-PnL feed -> breaker check -> deadman refresh
 *                   -> paper exits (remaining-quantity state machine) ->
 *                   per-candidate: caps -> regime -> confluence score ->
 *                   risk-gated entry (pre-trade notional validation +
 *                   full protective package)
 *
 * Modes (fail-closed — paper is the DEFAULT):
 *   (no env)               PAPER backend; entries fill at the live mark
 *   BINANCE_TESTNET=true   testnet hosts (still paper unless AGENT_LIVE=1)
 *   AGENT_LIVE=1           live execution on the chosen environment —
 *                          and for MAINNET additionally requires BOTH:
 *                            AGENT_LIVE_CONFIRM=I-ACCEPT-LIVE-TRADING-RISK
 *                            AGENT_SYMBOLS=BTCUSDT,ETHUSDT  (explicit allowlist)
 *                          otherwise the session refuses to go live and
 *                          falls back to paper.
 *
 * Risk state (daily loss, failure streak, tripped breaker) is persisted to
 * AGENT_STATE_FILE (default .agent-risk-state.json) and restored at boot:
 *   - live boots reconstruct today's realized PnL from exchange income
 *     records (authoritative), then keep feeding it each cycle;
 *   - paper boots restore from the state file;
 *   - a tripped breaker SURVIVES restarts: clear it by waiting for the UTC
 *     day to roll (automatic) or by human review (delete the state file).
 *
 * Env: BINANCE_API_KEY, BINANCE_API_SECRET (live/testnet only).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  BinanceClient,
  RiskGateway,
  RealizedPnlFeed,
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
  toManagedPosition,
  updateHighWater,
  nextExitAction,
  applyExit,
  reconcilePositions,
  type Signal,
  type ExecutionGateway,
  type ManagedPosition,
  type PersistedRiskState,
} from '../src/index.js';

const PROFILE = DEFAULT_PROFILE;
const TESTNET = process.env.BINANCE_TESTNET === 'true';

// ---- mode resolution: paper unless live is EXPLICITLY opted into ---------
const LIVE_OPT_IN = process.env.AGENT_LIVE === '1';
const LIVE_CONFIRM = process.env.AGENT_LIVE_CONFIRM === 'I-ACCEPT-LIVE-TRADING-RISK';
const LIVE_SYMBOLS = (process.env.AGENT_SYMBOLS ?? '')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const liveRefusals: string[] = [];
if (LIVE_OPT_IN) {
  if (!TESTNET && !LIVE_CONFIRM) {
    liveRefusals.push('mainnet live requires AGENT_LIVE_CONFIRM=I-ACCEPT-LIVE-TRADING-RISK');
  }
  if (!TESTNET && LIVE_SYMBOLS.length === 0) {
    liveRefusals.push('mainnet live requires an explicit AGENT_SYMBOLS allowlist');
  }
}
const LIVE = LIVE_OPT_IN && liveRefusals.length === 0;
const PAPER = !LIVE;

const STATE_FILE = process.env.AGENT_STATE_FILE ?? '.agent-risk-state.json';

function log(tag: string, detail: unknown): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${tag}]`, typeof detail === 'string' ? detail : JSON.stringify(detail));
}

function buildClient(safety: ReturnType<typeof safetyOptions>): BinanceClient {
  return new BinanceClient({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    testnet: TESTNET,
    safety,
  });
}

function loadPersistedState(): PersistedRiskState | null {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as PersistedRiskState;
  } catch {
    return null; // no/invalid state file -> clean start
  }
}

function savePersistedState(risk: RiskGateway | undefined): void {
  if (!risk) return;
  try {
    writeFileSync(STATE_FILE, JSON.stringify(risk.persistedState()));
  } catch (err) {
    log('state.persist.error', String(err));
  }
}

async function main(): Promise<void> {
  log('boot', {
    mode: LIVE ? 'LIVE' : 'PAPER',
    testnet: TESTNET,
    liveSymbols: LIVE_SYMBOLS,
    profile: PROFILE,
    limits: safetyOptions(PROFILE, LIVE_SYMBOLS),
  });
  for (const refusal of liveRefusals) {
    log('boot.live-refused', `${refusal} — falling back to PAPER`);
  }
  if (LIVE) {
    log('boot.banner', [
      `*** LIVE EXECUTION on ${TESTNET ? 'TESTNET' : 'MAINNET'} ***`,
      `symbols: ${LIVE_SYMBOLS.join(', ')}`,
      `daily-loss breaker: 1000 quote | per-order cap: 25000 | leverage cap: ${PROFILE.maxLeverage}x`,
    ].join(' | '));
  }

  // Long-lived base client: market data, the scanner's WS. Never trades.
  const base = new BinanceClient({ testnet: TESTNET });
  await base.syncTime(); // kill -1021 before it happens

  // ONE session client for the process. The allowlist is refreshed in place
  // on every scan (policy.setAllowedSymbols) — rebuilding a client per scan
  // used to reset the daily PnL, failure streak and breaker every 15 minutes,
  // which made the configured daily-loss limit unenforceable.
  const session = buildClient(safetyOptions(PROFILE, LIVE ? LIVE_SYMBOLS : []));
  const risk = session.policy instanceof RiskGateway ? session.policy : undefined;

  // One gateway, one wallet, one ledger — rebuilt never.
  const gateway: ExecutionGateway = createAgentGateway(
    session, LIVE ? {} : { paper: true, paperBalance: 10_000 },
  );
  const rules = new SymbolRulesCache(base);

  // Restore persisted risk state (same-UTC-day snapshots only), then — live —
  // replace the day's PnL with the exchange's own income truth. A boot seed
  // already at/below the limit comes up with the breaker tripped.
  const persisted = loadPersistedState();
  if (persisted && risk) risk.restoreDailyState(persisted);
  let feed: RealizedPnlFeed | null = null;
  if (LIVE && risk) {
    feed = new RealizedPnlFeed(session, risk);
    const seeded = await feed.seedToday();
    log('boot.pnl-seed', { day: new Date().toISOString().slice(0, 10), realizedPnl: seeded });
  }
  if (risk?.riskStatus().circuitBreaker.tripped) {
    log('boot.halted', {
      reason: risk.riskStatus().circuitBreaker.reason,
      note: 'breaker restored tripped from prior session; refusing to trade. ' +
        'Wait for the UTC day to roll or clear after human review (delete the state file).',
    });
    process.exit(1);
  }

  const scanner = new WatchlistScanner(base, { profile: PROFILE });
  await scanner.start();

  base.events.on('risk.denied', (e) => log('risk.denied', e));
  base.events.on('execution.rejected', (e) => log('execution.rejected', e));
  session.events.on('execution.reconciled', (e) => log('execution.reconciled', e));

  if (LIVE) {
    // Explicit user-data-stream startup: the fill listener is only useful if
    // the stream is actually started, authenticated and kept alive.
    await session.startUserStream();
    session.futures.wsUser.on('ORDER_TRADE_UPDATE', (ev: unknown) => log('fill', ev));
  }

  const open = new Map<string, ManagedPosition>();

  let scanInFlight = false;
  const scan = async (): Promise<void> => {
    if (scanInFlight) return; // single-flight: scans never overlap
    scanInFlight = true;
    try {
      const watch = await scanner.eligibleWatchlist();
      log('scan', { eligible: watch.length, top: watch.slice(0, 5).map((w) => w.symbol) });
      const candidates = watch.map((w) => w.symbol);
      // Live trades only the intersection of the scanner's watchlist and the
      // operator's explicit allowlist; paper tracks the watchlist (the allowlist
      // fence is informational there — paper orders never reach the transport).
      const allow = LIVE ? candidates.filter((s) => LIVE_SYMBOLS.includes(s)) : candidates;
      risk?.setAllowedSymbols(allow);
      log('scan.allowlist', { count: allow.length, live: LIVE });
    } finally {
      scanInFlight = false;
    }
  };
  await scan();
  setInterval(() => void scan().catch((e) => log('scan.error', String(e))), PROFILE.scanIntervalMs);

  const dayStart = (): number => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };

  /** Paper-mode realized PnL of the most recent fill on a symbol, 0 when none. */
  const paperRealized = (symbol: string): number =>
    gateway.paperEngine.getOrderHistory(symbol).at(-1)?.realizedPnl ?? 0;

  /**
   * Paper-mode exit ledger: drive the legs the simulator cannot rest on the
   * book, through the remaining-quantity state machine. Terminal exits close
   * exactly what remains — partial exits take their fraction of the original
   * size — so no exit path can over-close and flip the position.
   */
  const managePaperExits = async (): Promise<void> => {
    for (const [symbol, pos] of open) {
      let price: number;
      try {
        price = (await base.futures.market.bookTicker(symbol)).bidPrice;
      } catch {
        continue; // price-feed hiccup — retry next cycle
      }
      updateHighWater(pos, price);

      // Drain every level the price has crossed this cycle (a gap can clear
      // TP1 and TP2 together). applyExit only runs after a real fill.
      for (let guard = 0; guard < 5; guard += 1) {
        const decision = nextExitAction(pos, price, Date.now(), PROFILE);
        if (!decision) break;
        const qty = Number(formatQtyLocal(decision.quantity));
        if (!(qty > 0)) break; // remaining rounds to zero — nothing to submit
        await gateway.placeOrder({
          symbol,
          side: pos.side === 'LONG' ? 'SELL' : 'BUY',
          type: 'MARKET',
          quantity: qty,
          intentId: `paper-exit-${symbol}-${decision.reason}-${pos.openedAt}`,
        });
        applyExit(pos, decision);
        risk?.recordRealizedPnl(paperRealized(symbol)); // paper feeds the day breaker too
        log('paper.exit', { symbol, reason: decision.reason, qty, price, remaining: pos.remaining });
        if (decision.terminal || pos.remaining <= 0) {
          open.delete(symbol);
          break;
        }
      }
    }
  };

  /** Paper quantities are plain floats — the engine applies no lot step. */
  function formatQtyLocal(qty: number): string {
    return qty.toFixed(6).replace(/\.?0+$/, '');
  }

  let cycleInFlight = false;
  const cycle = async (): Promise<void> => {
    if (cycleInFlight) {
      log('cycle.skipped', 'previous cycle still in flight');
      return; // single-flight: a slow cycle never overlaps the next
    }
    cycleInFlight = true;
    try {
      // 1. Feed realized PnL FIRST: the breaker decision below must see the
      //    day's losses as booked by the exchange (live) or the simulator (paper).
      const delta = await feed?.poll();
      if (delta !== undefined && delta !== 0) log('risk.pnl', { delta });

      // 2. Breaker check — halts on trip; the state file keeps it tripped
      //    across restarts until the UTC day rolls or a human clears it.
      const status = risk?.riskStatus();
      if (status?.circuitBreaker.tripped) {
        log('halt', { reason: status.circuitBreaker.reason, detail: status.circuitBreaker.detail });
        await emergencyFlatten(session, gateway, [...open.keys()]);
        savePersistedState(risk);
        process.exit(1); // halt state — human review required
      }

      const watch = await scanner.eligibleWatchlist();
      await refreshDeadman(session, watch.map((w) => w.symbol), PROFILE, PAPER);
      if (PAPER) await managePaperExits();

      // 3. Reconcile against the account's actual exposure: feed the position
      //    snapshot to the exposure cap, and surface positions this loop does
      //    not manage (previous process, manual trade, another bot on the key).
      //    Fresh entries on untracked symbols are refused — the agent never
      //    pyramids onto exposure whose protective orders it cannot see.
      const snapshot = await reconcilePositions(session, gateway, open);
      risk?.recordPositionNotional(snapshot.notional);
      if (snapshot.untracked.length > 0) {
        log('reconcile.untracked', {
          symbols: snapshot.untracked,
          note: 'unmanaged exchange-side exposure present; entries on these symbols are refused',
        });
      }

      // 4. Entries — within caps, on the allowlist, one per symbol, never on
      //    symbols with unmanaged exposure.
      for (const cand of watch) {
        if (open.size >= PROFILE.maxIntradayPositions) break;
        if (open.has(cand.symbol)) continue;
        if (LIVE && !LIVE_SYMBOLS.includes(cand.symbol)) continue;
        if (snapshot.notional[cand.symbol] !== undefined) continue; // untracked exposure — refuse
        const inCluster = [...open.keys()].filter((s) => clusterOf(s) === cand.cluster).length;
        if (inCluster >= PROFILE.maxPerCluster) continue;

        const regime = await classifyRegime(base, cand.symbol);
        if (regime === 'CHAOS' || regime === 'SQUEEZE') continue;

        let sig: Signal | null;
        try {
          sig = await scoreSymbol(base, cand.symbol, regime, dayStart());
        } catch (err) {
          log('score.error', { symbol: cand.symbol, err: String(err) });
          continue;
        }
        if (!sig || sig.score < PROFILE.confluenceEntry) continue;

        const equity = await currentEquity(session, gateway);
        try {
          await applyLeverage(session, cand.symbol, PROFILE.maxLeverage, PAPER);
          const res = await executeEntry(session, gateway, rules, cand.symbol, sig, equity);
          if (!res) {
            log('entry.skipped', { symbol: cand.symbol, score: sig.score });
            continue;
          }
          open.set(cand.symbol, toManagedPosition(res));
          log('entry', {
            symbol: cand.symbol, side: res.side, score: sig.score, regime,
            qty: res.quantity, entry: res.entryPrice, stop: res.stopPrice,
            legs: res.legs,
          });
        } catch (err) {
          log('entry.error', { symbol: cand.symbol, err: String(err) });
        }
      }
    } finally {
      cycleInFlight = false;
      savePersistedState(risk); // survive restarts; same-day snapshots only
    }
  };

  const runCycle = (): void => { void cycle().catch((e) => log('cycle.error', String(e))); };
  setInterval(runCycle, PROFILE.cycleIntervalMs);
  runCycle();

  process.on('SIGINT', () => {
    log('shutdown', 'SIGINT — disarming deadman, saving risk state, closing sockets');
    savePersistedState(risk);
    if (LIVE) {
      for (const s of open.keys()) {
        // Disarm the deadman so resting SL/TP/trail orders survive the exit.
        void session.futures.trading.setCountdownCancelAll(s, 0).catch(() => {});
      }
    }
    base.closeAllWebSockets();
    session.closeAllWebSockets();
    process.exit(0);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
