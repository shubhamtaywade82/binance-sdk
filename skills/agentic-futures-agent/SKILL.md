---
name: agentic-futures-agent
description: "Autonomous USD-M futures trading session on binance-sdk: volume-ranked watchlist scanner, five-state regime classifier, confluence scorer with hard vetoes, and risk-gated execution with a full protective package. Run paper-first (AGENT_PAPER=1); mainnet requires explicit user CONFIRM."
metadata:
  version: 1.0.0
  author: shubhamtaywade82
  category: trading
  market: USD-M Futures
  auth-required: true
  symbols: [BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, BNUSDT, AVAXUSDT, DOGEUSDT]
  risk: high
license: MIT
---

# Agentic Futures Agent

Run a complete autonomous intraday futures session through the SDK's `src/agent/` layer:
scan -> classify -> score -> execute, with circuit breakers, a deadman switch and
live/paper parity. The agent modules are importable from `@nemesis-oss/binance-sdk`;
`examples/agentic-futures.ts` is the full session loop.

⚠️ **Autonomous mainnet trading requires explicit user opt-in.** Always start with
`AGENT_PAPER=1` (simulator backend, entries fill at the live mark) and promote through
testnet before any live session. The aggressive profile (2.5% risk/trade, 20x cap,
10% daily-loss breaker) is a deliberate posture the user must confirm.

## Pipeline

1. **Scan** — `WatchlistScanner` ranks perpetuals by 24h quote volume from one
   `!ticker@arr` subscription, then gates via REST: PERPETUAL + TRADING, spread <= 5 bps,
   >= 50M USDT 24h volume, >= 20M USDT open interest. Returns top-50 with clusters.
2. **Regime** — `classifyRegime(symbol)`: TREND_UP / TREND_DOWN / RANGE / SQUEEZE / CHAOS
   from 15m EMA(20/50) structure, the ATR percentile, funding z-score and the 12h OI slope.
   CHAOS and SQUEEZE skip the symbol.
3. **Score** — `scoreSymbol(symbol, regime, dayStartMs)`: confluence 0-95 across EMA
   structure (20), VWAP side (15), book imbalance (10), taker flow (15), OI shift (15),
   funding posture (10), crowd skew (10). Book imbalance against the trade is a hard veto;
   stops wider than 1.2 ATR refuse the signal. Enter at >= 70 (>= 85 = high conviction).
4. **Execute** — `executeEntry` sizes via `ops.sizePosition` (riskAmount = equity x
   risk%), then places through the idempotent `ExecutionGateway`:
   MARKET entry -> STOP_MARKET hard stop (`closePosition`, MARK_PRICE) -> 40% at +1R and
   30% at +2R reduce-only LIMITs -> TRAILING_STOP_MARKET runner at +2.5R (1% callback).
   Fails closed: a rejected hard stop flattens the fresh position.

## Safety rails (enforced in code, not prompts)

- Session client rebuilt per scan with `safety: safetyOptions(PROFILE, watchlist)` — the
  RiskGateway allowlist, notional caps, `maxDailyLoss` breaker and denied withdrawals.
- `refreshDeadman` re-arms a 300s countdown-cancel-all every cycle; `emergencyFlatten`
  reacts to a tripped breaker (halt + human review).
- Caps: 4 intraday positions, 2 per correlation cluster (BTC-BETA / L1 / MEME / AI / OTHER).
- Paper mode (`createAgentGateway(client, { paper: true })`): entries fill at the live
  mark; protective legs are `PAPER_UNSIMULATED` and the session loop drives exits from
  the returned entry/stop/tp levels. Paper positions post full notional as margin.

## Running the session loop

```bash
AGENT_PAPER=1 npm run example:agent                 # stage 1: paper, no keys needed
BINANCE_TESTNET=true npm run example:agent          # stage 2: testnet (keys required)
npm run example:agent                               # stage 4: live (explicit opt-in)
```

Tune every gate, cap and threshold through `AgentProfile` (`DEFAULT_PROFILE` is the
aggressive intraday reference). Exports: `WatchlistScanner`, `classifyRegime`,
`classifyFromInputs`, `scoreSymbol`, `scoreFromInputs`, `executeEntry`,
`createAgentGateway`, `SymbolRulesCache`, `refreshDeadman`, `emergencyFlatten`,
`currentEquity`, `safetyOptions`, `clusterOf`, `CLUSTERS`, `DEFAULT_PROFILE`.
