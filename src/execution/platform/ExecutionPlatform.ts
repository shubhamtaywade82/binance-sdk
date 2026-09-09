import type { HttpClient } from '../../client/HttpClient.js';
import type { CoreContext } from '../../core/context.js';
import type { ExecutionManager } from '../ExecutionManager.js';
import type { PaperExecutionAdapter } from '../paper.js';
import type { PaperTradingEngine } from '../../paper/PaperTradingEngine.js';
import { classifyRetrySafety } from './RetrySafety.js';
import { reconcileExecutionPlatform, type ReconcileOptions } from './Reconciler.js';
import { createUserEventParser } from './normalize.js';
import { OrderTracker } from './OrderTracker.js';
import { PositionTracker } from './PositionTracker.js';
import { UserStreamSession, type UserStreamSessionOptions } from './UserStreamSession.js';
import { PaperSession } from './PaperSession.js';
import type { ListenKeyApi, ReconciliationSummary, RetryClassification } from './types.js';

/** Session tuning accepted by {@link ExecutionPlatform.startUserSession}. */
export type UserSessionTuning = Pick<
  UserStreamSessionOptions,
  | 'keepAliveIntervalMs'
  | 'keepAliveFailuresBeforeRotation'
  | 'reconnectAttemptsBeforeRotation'
  | 'connection'
  | 'socketFactory'
>;

/** Paper backend wiring: which simulator sits in the "server" seat. */
export interface PaperBackendOptions {
  /** The simulator whose fills the session replays as user-data frames. */
  engine: PaperTradingEngine;
  /** Report source — the adapter orders flow through. */
  adapter: PaperExecutionAdapter;
}

/** Either session flavor a platform can hold: live (listen key) or paper. */
export type PlatformUserSession = UserStreamSession | PaperSession;

/** Options for {@link ExecutionPlatform}. */
export interface ExecutionPlatformOptions {
  /** Product the platform serves — decides listen-key REST routes and WS URL. */
  product: 'usdm' | 'spot';
  /**
   * Shared runtime: REST hosts (listen-key calls), resolved endpoints (user
   * WS URL) and the observability bus. Same context every product client
   * holds — one weight budget, one event stream.
   */
  core: Pick<CoreContext, 'endpoints' | 'events' | 'http'>;
  /**
   * Execution manager to auto-attach when a session starts: its intent ledger
   * then tracks live fills from the stream (`setUserStream`), and detaches
   * when the session closes.
   */
  executionManager?: ExecutionManager;
  /** Order-record retention; default 5000. */
  maxTrackedOrders?: number;
  /**
   * Paper backend wiring. When set, the platform runs in paper mode:
   * `startUserSession()` opens a {@link PaperSession} (no listen key, no
   * socket) that replays simulator fills as user-data frames, and
   * `reconcile()` folds the simulator's own state. See
   * {@link createPaperExecutionPlatform} for the assembled runtime.
   */
  paper?: PaperBackendOptions;
}

/**
 * v3 execution platform — one product's live trading state.
 *
 * Milestone 3 composition root: a managed user-data stream session, the
 * order/position feeds it drives, and the semantic retry classifier, all over
 * a shared {@link CoreContext}. The raw API layer (`trading.createOrder`) and
 * the intent layer (`execution.placeOrder`) stay where they were; the platform
 * adds the *account view* — what is live right now, fed by the exchange
 * itself:
 *
 * ```ts
 * const usdm = new USDMClient(core);
 * await usdm.executionPlatform.startUserSession();
 *
 * await usdm.execution.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', … });
 * // execution ledger now updates from the stream, and:
 * usdm.executionPlatform.orders.get('nbsdk-…');      // live OrderRecord
 * usdm.executionPlatform.positions.get('BTCUSDT');  // live PositionRecord
 * usdm.executionPlatform.classify(err).safety;       // 'reconciliation-required'
 * ```
 *
 * Milestone 4 adds two capabilities on the same boundary:
 *  - **`reconcile()`** — a REST snapshot (open orders + position risk) folded
 *    into the trackers: the startup gap-fill for orders that existed before
 *    the stream went live, and the recovery pass after a disconnect.
 *  - **paper mode** — with the `paper` option (see
 *    {@link createPaperExecutionPlatform}) the session, trackers and
 *    reconcile semantics run against the local simulator instead.
 *
 * Standalone use (any product wiring, custom listen-key backends for tests):
 *
 * ```ts
 * const platform = new ExecutionPlatform({ product: 'usdm', core });
 * ```
 */
export class ExecutionPlatform {
  readonly product: 'usdm' | 'spot';
  readonly orders: OrderTracker;
  readonly positions: PositionTracker;

  private readonly core: ExecutionPlatformOptions['core'];
  private readonly executionManager?: ExecutionManager;
  private readonly paperBackend?: PaperBackendOptions;
  private sessionValue: PlatformUserSession | null = null;

  constructor(options: ExecutionPlatformOptions) {
    this.product = options.product;
    this.core = options.core;
    this.executionManager = options.executionManager;
    this.paperBackend = options.paper;
    this.orders = new OrderTracker({ events: options.core.events, maxRecords: options.maxTrackedOrders });
    this.positions = new PositionTracker({ events: options.core.events });
  }

  /** The live user-data stream session, or null before `startUserSession`. */
  get userSession(): PlatformUserSession | null {
    return this.sessionValue;
  }

  /**
   * The live session when it is a listen-key session (REST-wired products).
   * Null in paper mode — the paper session carries no listen key.
   */
  get liveUserSession(): UserStreamSession | null {
    return this.sessionValue instanceof UserStreamSession ? this.sessionValue : null;
  }

  /** True when the platform runs against the paper simulator. */
  get isPaper(): boolean {
    return this.paperBackend !== undefined;
  }

  /** True once a session has been started (cheap, no I/O). */
  hasUserSession(): boolean {
    return this.sessionValue !== null;
  }

  /**
   * Start the managed user-data stream: create the listen key, connect, run
   * the 30-minute keep-alive, rotate on failure. The platform's order and
   * position feeds go live immediately, and the attached execution manager
   * (when one was provided) begins tracking live fills.
   *
   * In paper mode there is nothing to connect: the returned
   * {@link PaperSession} replays simulator fills as user-data frames through
   * the exact same `userData` contract — the trackers go live identically.
   */
  async startUserSession(tuning?: UserSessionTuning): Promise<PlatformUserSession> {
    if (this.sessionValue) return this.sessionValue;
    if (this.paperBackend) {
      const session = new PaperSession({
        engine: this.paperBackend.engine,
        adapter: this.paperBackend.adapter,
        events: this.core.events,
        onClose: () => {
          this.executionManager?.setUserStream(null);
        },
      });
      this.attachSession(session);
      await session.start();
      return session;
    }
    const session = new UserStreamSession({
      product: this.product,
      listenKeyApi: createListenKeyApi(this.product, this.core),
      userStreamUrl:
        this.product === 'spot' ? this.core.endpoints.wsSpotUser : this.core.endpoints.wsUser,
      events: this.core.events,
      parseEvent: createUserEventParser(this.product),
      keepAliveIntervalMs: tuning?.keepAliveIntervalMs,
      keepAliveFailuresBeforeRotation: tuning?.keepAliveFailuresBeforeRotation,
      reconnectAttemptsBeforeRotation: tuning?.reconnectAttemptsBeforeRotation,
      connection: tuning?.connection,
      socketFactory: tuning?.socketFactory,
      onClose: () => {
        this.executionManager?.setUserStream(null);
      },
    });
    this.attachSession(session);
    try {
      await session.start();
    } catch (err) {
      session.close();
      this.sessionValue = null;
      throw err;
    }
    return session;
  }

  /** Classify an error for retry semantics — see {@link classifyRetrySafety}. */
  classify(error: unknown): RetryClassification {
    return classifyRetrySafety(error);
  }

  /**
   * Fold a REST snapshot of the account into the trackers — the gap-fill the
   * user stream cannot provide: orders that existed *before* the session went
   * live, and the authoritative position state after any disconnect.
   *
   * Live mode pulls `GET /fapi/v1/openOrders` (or per-symbol Spot
   * `openOrders`) and `GET /fapi/v2/positionRisk` over the shared core
   * transports; paper mode folds the simulator's own book. Returns how many
   * views were folded; every fold emits the same `order.updated` /
   * `position.updated` events stream folds do.
   *
   * ```ts
   * await platform.startUserSession();
   * const summary = await platform.reconcile();   // startup gap-fill
   * summary.orders; summary.positions;
   * ```
   */
  async reconcile(options?: ReconcileOptions): Promise<ReconciliationSummary> {
    return reconcileExecutionPlatform(
      {
        product: this.product,
        core: this.core,
        paper: this.paperBackend,
        orders: this.orders,
        positions: this.positions,
      },
      options,
    );
  }

  /** Close the session (stop keep-alive, disconnect, delete the key). Trackers keep their records. */
  close(): void {
    this.sessionValue?.close();
    this.sessionValue = null;
  }

  // -------------------------------------------------------------------------

  /** Shared wiring for both session flavors: feed the trackers, remember it. */
  private attachSession(session: PlatformUserSession): void {
    session.on('userData', (event: unknown) => {
      this.orders.applyUserEvent(event);
      this.positions.applyUserEvent(event);
    });
    this.sessionValue = session;
    this.executionManager?.setUserStream(session);
  }
}

/**
 * Build the product's listen-key REST API over a shared `HttpClient` — the
 * same hosts and security modes the v2 resources use (USDⓈ-M `/fapi/v1/listenKey`
 * on the fapi root, Spot `/api/v3/userDataStream`), so weight accounting and
 * observability stay unified.
 */
function createListenKeyApi(
  product: 'usdm' | 'spot',
  core: ExecutionPlatformOptions['core'],
): ListenKeyApi {
  const http: HttpClient = product === 'spot' ? core.http('spot') : core.http('fapiRoot');

  const requireKey = (raw: unknown): string => {
    const key = (raw as { listenKey?: unknown })?.listenKey;
    if (typeof key !== 'string' || key === '') {
      throw new Error(`listen-key response missing listenKey for ${product}`);
    }
    return key;
  };

  if (product === 'spot') {
    return {
      create: async () => requireKey(await http.post('/userDataStream', undefined, 'apiKey')),
      keepAlive: async (listenKey) => {
        await http.put('/userDataStream', { listenKey }, 'apiKey');
      },
      close: async (listenKey) => {
        await http.delete('/userDataStream', { listenKey }, 'apiKey');
      },
    };
  }
  return {
    create: async () => requireKey(await http.post('/fapi/v1/listenKey', undefined, 'apiKey')),
    keepAlive: async () => {
      // The fapi keep-alive renews the key bound to the API key, no payload.
      await http.put('/fapi/v1/listenKey', undefined, 'apiKey');
    },
    close: async () => {
      await http.delete('/fapi/v1/listenKey', undefined, 'apiKey');
    },
  };
}
