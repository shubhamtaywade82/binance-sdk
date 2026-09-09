import { EventEmitter } from 'node:events';
import type { EventBus } from '../../core/events.js';
import type { PaperExecutionAdapter } from '../paper.js';
import type { PaperTradingEngine } from '../../paper/PaperTradingEngine.js';
import type { ExecutionReportShape, UserStreamLike } from '../adapter.js';
import type { UserSessionState } from './types.js';

/**
 * v3 paper backend — the simulator behind the execution-platform boundary.
 *
 * Milestone 3's execution platform gave live trading a managed session and
 * order/position feeds. Milestone 4 puts the **paper simulator behind the
 * same boundary**: a {@link PaperSession} emits the exact user-data frames a
 * live session would (`ORDER_TRADE_UPDATE` for fills, `ACCOUNT_UPDATE` for
 * the position the fill produced), so the platform's trackers, the
 * `waitForTerminal()` promise API and the reconciliation semantics behave
 * *identically* whether orders route to the exchange or to the simulator.
 * Strategy code written against the paper platform runs unchanged live.
 */

/** Options for {@link PaperSession}. */
export interface PaperSessionOptions {
  /** The simulator whose fills become user-data frames. */
  engine: PaperTradingEngine;
  /** Report source — the adapter orders flow through (one per engine). */
  adapter: PaperExecutionAdapter;
  /** Observability bus; `execution.session.*` events mirror the live session. */
  events?: EventBus;
  /** Called once when the session is closed by the user (or `close()`). */
  onClose?: () => void;
}

/**
 * A user-data stream session with no network: simulator fills, replayed as
 * exchange-shaped user-data frames.
 *
 * The contract is the one the platform (and the execution manager) already
 * consume: `start()` goes live, `close()` is terminal, frames arrive on
 * `userData`. There is no listen key, no keep-alive, no rotation — nothing to
 * rotate, because the "server" is an in-process {@link PaperTradingEngine}.
 * Fill → frame translation is synchronous: by the time `placeOrder()` resolves,
 * the trackers have already folded the fill.
 *
 * ```ts
 * const session = new PaperSession({ engine, adapter });
 * await session.start();
 * session.on('userData', (event) => {
 *   // { e: 'ORDER_TRADE_UPDATE', … } / { e: 'ACCOUNT_UPDATE', … }
 * });
 * ```
 */
export class PaperSession extends EventEmitter implements UserStreamLike {
  private readonly engine: PaperTradingEngine;
  private readonly adapter: PaperExecutionAdapter;
  private readonly sessionEvents?: EventBus;
  private readonly onClose?: () => void;
  private sessionStateValue: UserSessionState = 'idle';
  private readonly reportListener: (report: ExecutionReportShape) => void;

  constructor(options: PaperSessionOptions) {
    super();
    this.setMaxListeners(0);
    this.engine = options.engine;
    this.adapter = options.adapter;
    this.sessionEvents = options.events;
    this.onClose = options.onClose;
    this.reportListener = (report) => this.onFill(report);
  }

  /** Consumer-visible lifecycle: `idle` → `live` → `closed`. */
  get sessionState(): UserSessionState {
    return this.sessionStateValue;
  }

  /** Alias for {@link sessionState} — reads naturally next to book/tracker states. */
  get state(): UserSessionState {
    return this.sessionStateValue;
  }

  /**
   * The listen key a live session would carry — always null here: the
   * simulator *is* the server, there is nothing to register.
   */
  get listenKey(): string | null {
    return null;
  }

  /** True while simulator fills flow into `userData`. */
  get isLive(): boolean {
    return this.sessionStateValue === 'live';
  }

  /**
   * Session-contract member: resolve once frames are being delivered. For a
   * live paper session that is immediate — the simulator delivers
   * synchronously, there is no socket handshake to wait for.
   */
  waitForOpen(_timeoutMs?: number): Promise<void> {
    if (this.isLive) return Promise.resolve();
    if (this.sessionStateValue === 'closed') {
      return Promise.reject(new Error('PaperSession: closed'));
    }
    return new Promise<void>((resolve, reject) => {
      const onLive = (): void => {
        cleanup();
        resolve();
      };
      const onClose = (): void => {
        cleanup();
        reject(new Error('PaperSession: closed before live'));
      };
      const cleanup = (): void => {
        this.off('sessionState', onLive);
        this.off('close', onClose);
      };
      this.on('sessionState', onLive);
      this.on('close', onClose);
    });
  }

  /**
   * Start the session: attach the fill listener. Idempotent; no I/O — the
   * listen-key create/connect/keep-alive dance has no paper equivalent.
   */
  async start(): Promise<PaperSession> {
    if (this.sessionStateValue === 'closed') {
      throw new Error('PaperSession: already closed');
    }
    if (this.isLive) return this;
    this.adapter.onReport(this.reportListener);
    this.sessionStateValue = 'live';
    this.emit('sessionState', 'live');
    this.sessionEvents?.scoped('execution').emit('session.live', {
      product: 'paper',
      backend: 'paper',
    });
    return this;
  }

  /** Close the session (detach the fill listener). Terminal; safe repeatedly. */
  close(): void {
    if (this.sessionStateValue === 'closed') return;
    this.sessionStateValue = 'closed';
    this.emit('sessionState', 'closed');
    this.sessionEvents?.scoped('execution').emit('session.closed', {
      product: 'paper',
      backend: 'paper',
    });
    this.onClose?.();
    this.emit('close');
    this.removeAllListeners();
  }

  // -------------------------------------------------------------------------

  /** Translate one simulator fill into the frames a live session would send. */
  private onFill(report: ExecutionReportShape): void {
    if (!this.isLive) return;
    const symbol = report.symbol;
    if (!symbol) return;
    const now = Date.now();
    this.emit('userData', paperOrderTradeUpdateFrame(report, now));
    // The position the fill produced, exactly like Binance: only changed
    // positions ride an ACCOUNT_UPDATE.
    const position = this.engine.getPosition(symbol);
    this.emit('userData', paperAccountUpdateFrame(symbol, position, now));
  }
}

/**
 * Simulator fill → USDⓈ-M `ORDER_TRADE_UPDATE` frame. Field-for-field the
 * live shape (`o.c`, `o.X`, `o.z`, `o.ap`, …), decimal strings everywhere —
 * `OrderTracker.applyUserEvent` cannot tell it from a real fill.
 */
export function paperOrderTradeUpdateFrame(
  report: ExecutionReportShape,
  atMs: number = Date.now(),
): Record<string, unknown> {
  return {
    e: 'ORDER_TRADE_UPDATE',
    E: atMs,
    T: atMs,
    o: {
      s: report.symbol ?? '',
      c: report.clientOrderId,
      i: report.orderId,
      S: report.side ?? '',
      ot: report.orderType ?? '',
      o: report.orderType ?? '',
      f: 'GTC',
      q: report.originalQty ?? report.executedQty ?? '0',
      p: '0',
      ap: report.avgPrice ?? '0',
      X: report.status,
      x: 'TRADE',
      z: report.executedQty ?? '0',
      L: report.lastPrice ?? '0',
      l: report.lastQty ?? '0',
      n: report.commission ?? '0',
      N: report.commissionAsset ?? 'USDT',
      t: report.orderId,
      T: atMs,
      ps: 'BOTH',
      R: false,
      paper: true,
    },
  };
}

/**
 * Simulator position → USDⓈ-M `ACCOUNT_UPDATE` frame. One-way mode semantics
 * (`ps: 'BOTH'`) with a *signed* amount, the way Binance reports it: a short
 * is a negative `pa`, never a separate flag.
 */
export function paperAccountUpdateFrame(
  symbol: string,
  position: { side: string; quantity: number; entryPrice: number; unrealizedPnl: number } | undefined,
  atMs: number = Date.now(),
): Record<string, unknown> {
  const side = position?.side === 'LONG' || position?.side === 'SHORT' ? position.side : 'NONE';
  const amount = position?.quantity ?? 0;
  const signedAmount = side === 'SHORT' ? -amount : amount;
  return {
    e: 'ACCOUNT_UPDATE',
    E: atMs,
    T: atMs,
    a: {
      m: 'ORDER',
      B: [],
      P: [
        {
          s: symbol,
          ps: 'BOTH',
          pa: decimalString(signedAmount),
          ep: decimalString(position?.entryPrice ?? 0),
          up: decimalString(position?.unrealizedPnl ?? 0),
          mt: 'cross',
          iw: '0',
          paper: true,
        },
      ],
    },
  };
}

/**
 * Format a simulator float as a clean decimal string. The simulator's
 * internal arithmetic is IEEE-754 (by design — it is a model, not a ledger),
 * so raw `String(number)` would leak representation noise (`0.1 + 0.2` →
 * `0.30000000000000004`). Twelve significant digits strips that noise while
 * staying far finer than any Binance tick; the boundary stays decimal-exact
 * from here on (trackers, `Decimal`, ledger math).
 */
export function decimalString(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(12)));
}
