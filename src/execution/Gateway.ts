import { PaperTradingEngine } from '../paper/PaperTradingEngine.js';
import { ExecutionManager } from './ExecutionManager.js';
import { PaperExecutionAdapter } from './paper.js';
import type { Execution } from './types.js';

/** Where an order routed through the gateway executes. */
export type ExecutionBackend = 'live' | 'paper';

export interface ExecutionGatewayOptions {
  /** The live (exchange-backed) execution manager. */
  live: ExecutionManager;
  /**
   * Paper simulator engine the paper backend routes through. When omitted a
   * fresh engine (10,000 quote balance, instant fills) is created.
   */
  paperEngine?: PaperTradingEngine;
  /** Backend used when a call does not specify one. Default 'live'. */
  defaultBackend?: ExecutionBackend;
}

export interface PlaceOrderOptions {
  backend?: ExecutionBackend;
}

/**
 * Routes orders to the live exchange or the paper simulator behind one
 * interface, so strategy code never branches on backend:
 *
 * ```ts
 * const gateway = client.createExecutionGateway({ defaultBackend: 'paper' });
 * await gateway.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01 });
 * await gateway.placeOrder({ ...order }, { backend: 'live' }); // one live order
 * gateway.paperEngine.getAccountInfo();                          // inspect the simulation
 * ```
 *
 * Both backends return the identical {@link Execution} envelope and maintain
 * independent ledgers; `listExecutions('paper')` never mixes with live orders.
 */
export class ExecutionGateway {
  readonly live: ExecutionManager;
  readonly paper: ExecutionManager;
  private readonly paperAdapter: PaperExecutionAdapter;
  private readonly defaultBackend: ExecutionBackend;

  constructor(options: ExecutionGatewayOptions) {
    this.live = options.live;
    const engine = options.paperEngine ?? new PaperTradingEngine();
    this.paperAdapter = new PaperExecutionAdapter(engine);
    this.paper = new ExecutionManager(this.paperAdapter, {
      clientOrderIdPrefix: 'paper',
    });
    this.defaultBackend = options.defaultBackend ?? 'live';
  }

  /** The paper simulator engine (account, positions, order history). */
  get paperEngine(): PaperTradingEngine {
    return this.paperAdapter.simulator;
  }

  /** Backend used when a call does not specify one. */
  get backend(): ExecutionBackend {
    return this.defaultBackend;
  }

  private resolve(backend?: ExecutionBackend): ExecutionManager {
    return (backend ?? this.defaultBackend) === 'paper' ? this.paper : this.live;
  }

  /** Idempotent order placement on the chosen backend. */
  async placeOrder(
    params: Parameters<ExecutionManager['placeOrder']>[0],
    options: PlaceOrderOptions = {},
  ): Promise<Execution> {
    return this.resolve(options.backend).placeOrder(params);
  }

  /** Idempotent cancel on the chosen backend. */
  async cancelOrder(
    symbol: string,
    options: Parameters<ExecutionManager['cancelOrder']>[1] & PlaceOrderOptions = {},
  ): Promise<Execution> {
    const { backend, ...cancelOptions } = options;
    return this.resolve(backend).cancelOrder(symbol, cancelOptions);
  }

  /** Force a reconciliation pass for an intent on a backend. */
  async reconcile(intentId: string, backend?: ExecutionBackend): Promise<Execution> {
    return this.resolve(backend).reconcile(intentId);
  }

  getExecution(intentId: string, backend?: ExecutionBackend): Execution | undefined {
    return this.resolve(backend).getExecution(intentId);
  }

  listExecutions(backend?: ExecutionBackend): Execution[] {
    return this.resolve(backend).listExecutions();
  }

  /** Scoped view of one backend, for callers that prefer a direct manager. */
  use(backend: ExecutionBackend): ExecutionManager {
    return this.resolve(backend);
  }
}
