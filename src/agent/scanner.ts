/**
 * Agentic futures trading — the top-N dynamic watchlist scanner.
 *
 * Ranking comes from the `!ticker@arr` all-market WS stream (one
 * subscription, every symbol's 24h quote volume); eligibility gates are
 * checked over REST per candidate: PERPETUAL + TRADING status, spread
 * ceiling, 24h quote-volume floor and an open-interest notional floor.
 * Candidates that pass carry their correlation cluster for the cap logic.
 */
import type { BinanceClient } from '../client/BinanceClient.js';
import type { WsTicker24hrPayload } from '../types/ws.types.js';
import { clusterOf, DEFAULT_PROFILE, type AgentProfile } from './config.js';

/** A watch-eligible symbol with the metrics that admitted it. */
export interface WatchlistCandidate {
  symbol: string;
  cluster: string;
  quoteVolume: number;
  spreadBps: number;
  oiUsd: number;
}

/** Minimal ticker view the scanner keeps per symbol. */
interface MiniTicker {
  symbol: string;
  quoteVolume: number;
}

export interface WatchlistScannerOptions {
  profile?: AgentProfile;
}

export class WatchlistScanner {
  private readonly profile: AgentProfile;
  private readonly tickers = new Map<string, MiniTicker>();
  private subscribed = false;

  constructor(
    private readonly client: BinanceClient,
    options: WatchlistScannerOptions = {},
  ) {
    this.profile = options.profile ?? DEFAULT_PROFILE;
  }

  /**
   * Subscribe to the all-market ticker array. Every `!ticker@arr` frame
   * refreshes the local volume ranking; `subscribe()` resolves only after
   * the server acknowledges the subscription.
   */
  async start(): Promise<void> {
    if (this.subscribed) return;
    this.client.futures.ws.on('message', (stream: string, payload: unknown) => {
      if (stream !== '!ticker@arr') return;
      this.ingestTickers(
        (payload as WsTicker24hrPayload[]).map((t) => ({
          symbol: t.s,
          quoteVolume: t.q,
        })),
      );
    });
    await this.client.futures.ws.subscribe([this.client.futures.ws.allMarketTickers()]);
    this.subscribed = true;
  }

  /** Stop receiving ranking updates. */
  stop(): void {
    if (!this.subscribed) return;
    void this.client.futures.ws.unsubscribe([this.client.futures.ws.allMarketTickers()]);
    this.subscribed = false;
  }

  /**
   * Feed ticker snapshots into the ranking map. Public so tests (and
   * offline callers) can drive the scanner without a WS connection.
   */
  ingestTickers(tickers: Array<{ symbol: string; quoteVolume: number }>): void {
    for (const t of tickers) {
      if (!(t.quoteVolume >= 0)) continue;
      this.tickers.set(t.symbol, { symbol: t.symbol, quoteVolume: t.quoteVolume });
    }
  }

  /** Current volume ranking snapshot (top `watchlistSize` perpetuals, ungated). */
  async topByVolume(): Promise<MiniTicker[]> {
    const info = await this.client.futures.market.exchangeInfo();
    const perp = new Set(
      info.symbols
        .filter((s) =>
          (s as { contractType?: string }).contractType === 'PERPETUAL'
          && s.status === 'TRADING')
        .map((s) => s.symbol),
    );
    return [...this.tickers.values()]
      .filter((t) => perp.has(t.symbol))
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, this.profile.watchlistSize);
  }

  /**
   * The gated watchlist: volume-ranked perpetuals that also clear the
   * spread, quote-volume and open-interest floors. Ordered by volume rank.
   * Symbols whose gate checks error are skipped, not fatal — one bad
   * symbol never blocks a scan.
   */
  async eligibleWatchlist(): Promise<WatchlistCandidate[]> {
    const top = await this.topByVolume();
    const out: WatchlistCandidate[] = [];
    for (const t of top) {
      try {
        const [book, oi] = await Promise.all([
          this.client.futures.market.bookTicker(t.symbol),
          this.client.futures.data.openInterest(t.symbol),
        ]);
        const mid = (book.bidPrice + book.askPrice) / 2;
        const spreadBps = mid > 0 ? ((book.askPrice - book.bidPrice) / mid) * 10_000 : Infinity;
        const oiUsd = oi.openInterest * mid;
        if (
          t.quoteVolume >= this.profile.minQuoteVolume24h
          && spreadBps <= this.profile.maxSpreadBps
          && oiUsd >= this.profile.minOpenInterestUsd
        ) {
          out.push({
            symbol: t.symbol,
            cluster: clusterOf(t.symbol),
            quoteVolume: t.quoteVolume,
            spreadBps,
            oiUsd,
          });
        }
      } catch {
        // Gate data unavailable for this symbol — skip it this scan.
      }
    }
    return out;
  }
}
