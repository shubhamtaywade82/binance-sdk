import { EventEmitter } from 'node:events';
import {
  UserDataAccountUpdateRawSchema,
  isUserDataEvent,
  parseUserDataEvent,
  type UserDataAccountUpdateRaw,
  type UserDataEvent,
} from '../types/userdata.types.js';

/**
 * Type-safe user-data stream dispatcher + position accumulator.
 *
 * The official `binance-connector-js` and the community `binance` package
 * both surface user-data events through a single global callback (the
 * official `callbacks.message` or the community `EventEmitter('formattedMessage')`),
 * forcing algorithmic strategies to hand-roll `switch (event.e)` routers
 * and `Record<string, any>` payload narrowing. The audit's October 7
 * digest flags three improvements the SDK should ship:
 *
 *  1. **Strict discriminated union** — `BinanceUserEvent` covers Spot
 *     execution reports, USDⓈ-M `ORDER_TRADE_UPDATE`, `ACCOUNT_UPDATE`,
 *     `MARGIN_CALL`, the PM Pro `PM_PRO_ACCOUNT_UPDATE`, and an
 *     explicit `UserDataUnknownEvent` fallback so unrecognized events
 *     (GRID_UPDATE, STRATEGY_UPDATE, ALGO_UPDATE,
 *     CONDITIONAL_ORDER_TRIGGER_REJECT) route through the dispatcher
 *     rather than terminating the stream.
 *  2. **Type-safe dispatcher** — `dispatcher.on('ORDER_TRADE_UPDATE', handler)`
 *     narrows the payload to the matching TS type at compile time, with
 *     zero per-call `as` casts.
 *  3. **Position accumulator** — the dispatcher maintains an in-memory
 *     `Map<symbol_side, PositionAccumulator>` fed exclusively by
 *     `ACCOUNT_UPDATE.a.P` (the audit's October 7 digest explicitly
 *     warns against deriving net positions from fill deltas: funding
 *     fees, fee rebating, liquidation slices, and ADL events bypass
 *     `ORDER_TRADE_UPDATE`, so they would silently drift over time).
 *
 * The dispatcher owns **zero sockets** — callers feed it parsed JSON
 * (or a `Buffer`/string from the SDK's existing `BaseWS` /
 * `FuturesUserWS` / `SpotUserWS` classes), so it can be wired behind
 * any user-data source (live Binance listen-key stream, a paper
 * simulator that replays fills as `ACCOUNT_UPDATE` frames, or a
 * recorded log being replayed offline).
 *
 * ```ts
 * const dispatcher = new UserStreamDispatcher();
 * dispatcher.on('ORDER_TRADE_UPDATE', (e) => log(e.o.c, e.o.X));
 * dispatcher.on('ACCOUNT_UPDATE', () => {
 *   const pos = dispatcher.positions.get('BTCUSDT', 'BOTH');
 *   log('open size', pos?.positionAmt);
 * });
 * // FuturesUserWS (existing SDK class) already parses inbound frames;
 * // forward them to the dispatcher:
 * userWs.on('userData', (raw) => dispatcher.dispatch(raw));
 * ```
 */

/**
 * Open perpetual position snapshot, accumulated from `ACCOUNT_UPDATE`
 * frames. All financial values are **exact decimal strings** — the
 * audit's October 7 digest recommends this to avoid IEEE 754 drift
 * on collateral / margin values during long-running sessions.
 */
export interface AccumulatedPosition {
  symbol: string;
  /** `'BOTH' | 'LONG' | 'SHORT'` — perpetual position side. */
  positionSide: string;
  /** Current position size (signed by side; absolute value here). */
  positionAmt: string;
  /** Average entry price. */
  entryPrice: string;
  /** Unrealized PnL since last `ACCOUNT_UPDATE`. */
  unrealizedPnl: string;
  /** Margin type ('isolated' | 'cross' from Binance). */
  marginType?: string;
  /** Isolated margin amount, when applicable. */
  isolatedWallet?: string;
  /** Last epoch-ms this snapshot was updated. */
  updatedAt: number;
}

/**
 * A listener registered for a specific event-type literal. The generic
 * constraint keeps the payload type aligned with the discriminator, so
 * `dispatcher.on('ORDER_TRADE_UPDATE', (e) => e.o.pm)` autocompletes.
 */
export type UserEventListener<E extends UserDataEvent = UserDataEvent> = (event: E) => void;

/** Listener map keyed by event-type literal; `'*'` is the wildcard channel. */
type ListenerMap = {
  [K in UserDataEvent['e'] | '*']?: Array<(event: Extract<UserDataEvent, { e: K }>) => void>;
};

/**
 * Type-safe dispatcher + position accumulator for Binance user-data
 * streams. Routes parsed payloads to typed `.on(eventType, handler)`
 * listeners, optionally accumulating open perpetual position state
 * from `ACCOUNT_UPDATE` frames (the audit's canonical ground-truth
 * source — never derived from fill deltas).
 */
export class UserStreamDispatcher {
  private readonly listeners: ListenerMap = Object.create(null);
  private readonly wildcardListeners: Array<(event: UserDataEvent) => void> = [];
  private readonly positions = new Map<string, AccumulatedPosition>();

  /**
   * Register a typed listener for one event type. The dispatcher
   * narrows the payload to the matching `Extract<UserDataEvent, { e: K }>`
   * shape at compile time — no `as` casts required at the call site.
   *
   * ```ts
   * dispatcher.on('ORDER_TRADE_UPDATE', (e) => {
   *   if (e.o.pm === 'OPPONENT_5') { /* passive match book-handling }
   * });
   * dispatcher.on('PM_PRO_ACCOUNT_UPDATE', (e) => updateRiskGateway(e));
   * dispatcher.on('GRID_UPDATE' as never, (e: UserDataUnknownEvent) => log(e));
   * ```
   *
   * Returning a disposer function (à la Node's `EventEmitter.off`)
   * keeps the API ergonomic without leaking listeners in long-lived
   * sessions.
   */
  on<K extends UserDataEvent['e']>(
    eventType: K,
    handler: (event: Extract<UserDataEvent, { e: K }>) => void,
  ): () => void;

  /**
   * Wildcard listener — receives every parsed event, including the
   * `UserDataUnknownEvent` fallback. Useful for structured logging,
   * audit sinks, or replay harnesses that need to observe the full
   * stream without per-type branching.
   */
  on(eventType: '*', handler: (event: UserDataEvent) => void): () => void;

  // Implementation signature — TypeScript merges the overloads above.
  on(
    eventType: UserDataEvent['e'] | '*',
    handler: ((event: UserDataEvent) => void) | ((event: never) => void),
  ): () => void {
    if (eventType === '*') {
      this.wildcardListeners.push(handler as (event: UserDataEvent) => void);
      return () => {
        const idx = this.wildcardListeners.indexOf(handler as (event: UserDataEvent) => void);
        if (idx >= 0) this.wildcardListeners.splice(idx, 1);
      };
    }
    const bucket = (this.listeners as Record<string, Array<(event: never) => void>>)[eventType] ?? [];
    bucket.push(handler as (event: never) => void);
    (this.listeners as Record<string, Array<(event: never) => void>>)[eventType] = bucket;
    return () => {
      const list = (this.listeners as Record<string, Array<(event: never) => void>>)[eventType];
      if (!list) return;
      const idx = list.indexOf(handler as (event: never) => void);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) {
        delete (this.listeners as Record<string, Array<(event: never) => void>>)[eventType];
      }
    };
  }

  /**
   * Dispatch a parsed user-data event to all matching listeners,
   * update the position accumulator when the event is an
   * `ACCOUNT_UPDATE`, and fan out to wildcard listeners.
   *
   * Accepts a raw `unknown` (parsed JSON, a `Buffer` from the SDK's
   * `BaseWS`, or a string) — the dispatcher parses through
   * {@link parseUserDataEvent}, which routes unrecognized event types
   * to a typed `UserDataUnknownEvent` instead of throwing. The
   * position accumulator additionally parses the raw frame through
   * the decimal-preserving {@link UserDataAccountUpdateRawSchema} so
   * exact strings (`'64500.00'`) survive — `String(Number(...))` would
   * silently drop trailing zeros.
   */
  dispatch(raw: unknown): void {
    const event = parseUserDataEvent(raw);
    this.routeEvent(event, raw);
  }

  /**
   * Dispatch a pre-parsed event. Useful for replay harnesses or
   * callers that want to run their own discriminator before the
   * dispatcher sees the event. The raw input is taken alongside the
   * parsed event so the position accumulator can re-parse through
   * the decimal-preserving Raw schema; pass `undefined` to skip
   * accumulator updates.
   */
  dispatchParsed(event: UserDataEvent, raw?: unknown): void {
    this.routeEvent(event, raw);
  }

  /**
   * Read-only view of the in-memory position accumulator. Ground truth
   * comes exclusively from `ACCOUNT_UPDATE.a.P` frames; the dispatcher
   * never modifies positions in response to fill deltas.
   */
  getPosition(
    symbol: string,
    positionSide: 'BOTH' | 'LONG' | 'SHORT' | string = 'BOTH',
  ): AccumulatedPosition | undefined {
    return this.positions.get(`${symbol}_${positionSide}`);
  }

  /** All accumulated positions, keyed by `symbol_side`. */
  listPositions(): AccumulatedPosition[] {
    return [...this.positions.values()];
  }

  /** Drop the position accumulator (does not detach listeners). */
  clearPositions(): void {
    this.positions.clear();
  }

  /** Remove every listener (does not clear positions). */
  removeAllListeners(): void {
    for (const key of Object.keys(this.listeners)) {
      delete (this.listeners as Record<string, unknown>)[key];
    }
    this.wildcardListeners.length = 0;
  }

  /** Counts of registered listeners per channel (testing / observability). */
  listenerCounts(): { typed: number; wildcard: number; positions: number } {
    let typed = 0;
    for (const key of Object.keys(this.listeners)) {
      typed += (this.listeners as Record<string, unknown[]>)[key].length;
    }
    return { typed, wildcard: this.wildcardListeners.length, positions: this.positions.size };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private routeEvent(event: UserDataEvent, raw?: unknown): void {
    // Update the position accumulator BEFORE firing listeners, so
    // listeners that read `dispatcher.getPosition(...)` in their handler
    // see the post-update state.
    if (isUserDataEvent(event, 'ACCOUNT_UPDATE') && raw !== undefined) {
      this.applyAccountUpdate(raw);
    }
    // Fan out to typed listeners (compile-time-narrowed payload).
    const bucket = (this.listeners as Record<string, Array<(event: UserDataEvent) => void>>)[event.e];
    if (bucket) {
      for (const handler of bucket) handler(event);
    }
    // Fan out to wildcard listeners (full payload union).
    for (const handler of this.wildcardListeners) handler(event);
  }

  private applyAccountUpdate(raw: unknown): void {
    // AUDIT (2026-10-07): ground truth comes exclusively from a.P.
    // Never derive net positions from ORDER_TRADE_UPDATE fill deltas —
    // funding fees, fee rebating, liquidation slices, and ADL events
    // bypass the standard fill message, so a fill-derived accumulator
    // would silently drift over time.
    //
    // Parse through the decimal-preserving Raw schema so exact strings
    // (`'64500.00'`) survive — the public UserDataAccountUpdateSchema
    // uses .transform(Number) for backward-compat with downstream
    // consumers, but that would silently drop trailing zeros when
    // re-stringified for the accumulator.
    const parsed = UserDataAccountUpdateRawSchema.parse(raw) as UserDataAccountUpdateRaw;
    for (const p of parsed.a.P) {
      const key = `${p.s}_${p.ps}`;
      this.positions.set(key, {
        symbol: p.s,
        positionSide: p.ps,
        positionAmt: p.pa,
        entryPrice: p.ep,
        unrealizedPnl: p.up,
        marginType: p.mt,
        isolatedWallet: p.iw,
        updatedAt: Date.now(),
      });
    }
  }
}

// Re-export the parser + discriminator so consumers importing from the
// dispatcher module get the typed surface in one place. (The schemas and
// event-type unions live in `src/types/userdata.types.ts` and are
// re-exported via the package barrel — we avoid re-exporting them here to
// prevent duplicate-declaration conflicts.)
export { isUserDataEvent, parseUserDataEvent };

/** Emitted by `EventEmitter`-shaped consumers when forwarding raw frames. */
export const USER_DATA_EVENT = 'userData' as const;
export type UserDataEventName = typeof USER_DATA_EVENT;

/**
 * Adapter that lets the dispatcher receive frames from any
 * `EventEmitter`-shaped user-data stream (the SDK's existing
 * `FuturesUserWS`, `SpotUserWS`, `CoinMUserWS` classes — all of which
 * emit `'userData'` with the parsed JSON payload).
 *
 * Returns a disposer that detaches the listener from the source AND
 * the dispatcher. Designed for `try/finally` cleanup in long-running
 * trading sessions.
 *
 * ```ts
 * const stop = attachUserStreamDispatcher(userWs, dispatcher);
 * try { /* ... } finally { stop(); }
 * ```
 */
export function attachUserStreamDispatcher(
  source: Pick<EventEmitter, 'on' | 'off'>,
  dispatcher: UserStreamDispatcher,
  options: { eventName?: string } = {},
): () => void {
  const eventName = options.eventName ?? USER_DATA_EVENT;
  const listener = (raw: unknown): void => {
    dispatcher.dispatch(raw);
  };
  source.on(eventName, listener as (event: unknown) => void);
  return () => {
    source.off(eventName, listener as (event: unknown) => void);
  };
}
