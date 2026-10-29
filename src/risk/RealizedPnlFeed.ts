/**
 * Realized-PnL feed from exchange income records → {@link RiskGateway}.
 *
 * `maxDailyLoss` only functions if the gateway is *fed* realized PnL. This
 * module polls `GET /fapi/v1/income` — the exchange's own, append-only ledger
 * — and records deduplicated deltas into the gateway's daily accumulator:
 *
 *  - **Deduplication** is per income row (`tranId`), so polling the same rows
 *    twice records nothing the second time. The day's watermark also bounds
 *    re-fetches to the current UTC day.
 *  - **Boot reconstruction** (`seedToday`) *replaces* the day's accumulator
 *    with the exchange's sum for today, so a process restart reconstructs
 *    the daily-loss state from authoritative records rather than from
 *    process-local memory. A boot seed that is already at/below the limit
 *    comes up with the breaker tripped (see {@link RiskGateway.restoreDailyState}).
 *  - **Incremental polls** (`poll`) record only rows not yet seen, so the
 *    breaker reacts to losses booked by *any* path — this process, a previous
 *    process, or a manual terminal trade — within one poll interval.
 *
 * ```ts
 * const feed = new RealizedPnlFeed(client, gateway);
 * await feed.seedToday();          // boot: reconstruct today's realized PnL
 * // then, once per agent cycle:
 * await feed.poll();
 * ```
 */
import type { BinanceClient } from '../client/BinanceClient.js';
import type { RiskGateway } from './RiskGateway.js';

export interface RealizedPnlFeedOptions {
  /**
   * Income types summed into the daily-loss accumulator, one request each.
   * Default `['REALIZED_PNL']`. Add `'COMMISSION'` / `'FUNDING_FEE'` for a
   * stricter all-in loss definition.
   */
  incomeTypes?: string[];
  /** Assets counted (the endpoint returns one row per asset). Default `['USDT']`. */
  assets?: string[];
  /** Page size per income request. Default (and exchange maximum) 1000. */
  pageSize?: number;
}

function utcDayStartMs(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True when `row` is inside the current UTC day (poll window). */
function inCurrentDay(row: { time: number }): boolean {
  return row.time >= utcDayStartMs();
}

export class RealizedPnlFeed {
  private readonly client: BinanceClient;
  private readonly gateway: RiskGateway;
  private readonly incomeTypes: string[];
  private readonly assets: ReadonlySet<string>;
  private readonly pageSize: number;
  /** UTC day the `seen` dedup set belongs to. */
  private day = utcDay();
  /** Income rows already recorded/seeded for the current UTC day. */
  private readonly seen = new Set<number>();

  constructor(client: BinanceClient, gateway: RiskGateway, options: RealizedPnlFeedOptions = {}) {
    this.client = client;
    this.gateway = gateway;
    this.incomeTypes = options.incomeTypes ?? ['REALIZED_PNL'];
    this.assets = new Set(options.assets ?? ['USDT']);
    this.pageSize = Math.min(options.pageSize ?? 1000, 1000);
  }

  /**
   * Boot-time reconstruction: replace the gateway's daily accumulator with the
   * exchange's own sum of today's income. Call once at startup, before any
   * trading; call `poll()` afterwards.
   *
   * @returns the seeded day total (quote currency).
   */
  async seedToday(): Promise<number> {
    const rows = await this.fetchToday();
    for (const row of rows) this.seen.add(row.tranId);
    const total = rows.reduce((sum, row) => sum + row.income, 0);
    this.gateway.restoreDailyState({ day: utcDay(), dailyPnl: total });
    return total;
  }

  /**
   * Incremental poll: record the sum of every income row not yet seen this UTC
   * day into the gateway. Idempotent — re-polling the same ledger records nothing.
   *
   * @returns the delta recorded this poll (0 when nothing new).
   */
  async poll(): Promise<number> {
    const today = utcDay();
    if (today !== this.day) {
      // UTC day rolled since the last poll: the gateway auto-rolls its counters
      // on the next record; the dedup window must roll with it.
      this.seen.clear();
      this.day = today;
    }
    const rows = await this.fetchToday();
    const fresh = rows.filter((row) => !this.seen.has(row.tranId));
    for (const row of fresh) this.seen.add(row.tranId);
    const delta = fresh.reduce((sum, row) => sum + row.income, 0);
    if (delta !== 0) this.gateway.recordRealizedPnl(delta);
    return delta;
  }

  /** Fetch every income row of the current UTC day (newest-first, paged). */
  private async fetchToday(): Promise<Array<{ tranId: number; income: number; time: number; asset: string }>> {
    const collected: Array<{ tranId: number; income: number; time: number; asset: string }> = [];
    for (const incomeType of this.incomeTypes) {
      let endTime: number | undefined;
      // Income returns newest-first; page backwards while pages come back full.
      for (;;) {
        const page = await this.client.futures.account.incomeHistory({
          incomeType,
          startTime: utcDayStartMs(),
          endTime,
          limit: this.pageSize,
        });
        const relevant = page.filter((row) => this.assets.has(row.asset));
        collected.push(...relevant.map((row) => ({
          tranId: row.tranId,
          income: row.income,
          time: row.time,
          asset: row.asset,
        })));
        if (page.length < this.pageSize) break;
        const oldest = page.at(-1)?.time;
        if (oldest === undefined || !inCurrentDay({ time: oldest })) break;
        if (endTime === oldest) break; // degenerate: exchange repeating the boundary row
        endTime = oldest - 1;
      }
    }
    return collected;
  }
}
