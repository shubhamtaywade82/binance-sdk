import type { HttpClient } from '../../client/HttpClient.js';
import type { CoreContext } from '../../core/context.js';
import type { ExecutionManager } from '../ExecutionManager.js';
import { classifyRetrySafety } from './RetrySafety.js';
import { createUserEventParser } from './normalize.js';
import { OrderTracker } from './OrderTracker.js';
import { PositionTracker } from './PositionTracker.js';
import { UserStreamSession, type UserStreamSessionOptions } from './UserStreamSession.js';
import type { ListenKeyApi, RetryClassification } from './types.js';

/** Session tuning accepted by {@link ExecutionPlatform.startUserSession}. */
export type UserSessionTuning = Pick<
  UserStreamSessionOptions,
  | 'keepAliveIntervalMs'
  | 'keepAliveFailuresBeforeRotation'
  | 'reconnectAttemptsBeforeRotation'
  | 'connection'
  | 'socketFactory'
>;

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
  private sessionValue: UserStreamSession | null = null;

  constructor(options: ExecutionPlatformOptions) {
    this.product = options.product;
    this.core = options.core;
    this.executionManager = options.executionManager;
    this.orders = new OrderTracker({ events: options.core.events, maxRecords: options.maxTrackedOrders });
    this.positions = new PositionTracker({ events: options.core.events });
  }

  /** The live user-data stream session, or null before `startUserSession`. */
  get userSession(): UserStreamSession | null {
    return this.sessionValue;
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
   */
  async startUserSession(tuning?: UserSessionTuning): Promise<UserStreamSession> {
    if (this.sessionValue) return this.sessionValue;
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
    session.on('userData', (event: unknown) => {
      this.orders.applyUserEvent(event);
      this.positions.applyUserEvent(event);
    });
    this.sessionValue = session;
    try {
      await session.start();
      this.executionManager?.setUserStream(session);
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

  /** Close the session (stop keep-alive, disconnect, delete the key). Trackers keep their records. */
  close(): void {
    this.sessionValue?.close();
    this.sessionValue = null;
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
