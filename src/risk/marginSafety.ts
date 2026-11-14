import { parseFixed } from '../core/fixedpoint.js';
import type { UserDataMarginCall } from '../types/userdata.types.js';

/**
 * Isolated-margin top-ups and a margin-call hook.
 *
 * `POST /fapi/v1/positionMargin` takes `symbol`, `positionSide`, `amount`, and `type`,
 * where type 1 adds margin and type 2 reduces it (verified in the vendored spec).
 * The post function is injected, so the caller controls signing and transport.
 */

export type IsolatedMarginPositionSide = 'BOTH' | 'LONG' | 'SHORT';

export interface IsolatedMarginRequest {
  symbol: string;
  /** Exact positive decimal amount, in the margin asset. */
  amount: string | number;
  positionSide?: IsolatedMarginPositionSide;
}

export type PostSigned = (path: string, params: Record<string, unknown>) => Promise<unknown>;

export class IsolatedMarginSupervisor {
  constructor(private readonly post: PostSigned) {}

  add(request: IsolatedMarginRequest): Promise<unknown> {
    return this.adjust(1, request);
  }

  reduce(request: IsolatedMarginRequest): Promise<unknown> {
    return this.adjust(2, request);
  }

  private adjust(type: 1 | 2, request: IsolatedMarginRequest): Promise<unknown> {
    if (request.symbol.trim() === '') throw new RangeError('symbol is required');
    const amount = parseFixed(request.amount);
    if (amount.units <= 0n) {
      throw new RangeError(`margin amount must be > 0, got ${String(request.amount)}`);
    }
    const params: Record<string, unknown> = { symbol: request.symbol, amount: String(request.amount), type };
    if (request.positionSide !== undefined) params.positionSide = request.positionSide;
    return this.post('/fapi/v1/positionMargin', params);
  }
}

export interface MarginCallSentinelOptions {
  /** Runs when a margin call arrives, e.g. cancel resting orders and alert. */
  onMarginCall: (event: UserDataMarginCall) => Promise<unknown> | unknown;
  /** Suppresses repeats within this window. Default 5 seconds. */
  cooldownMs?: number;
  now?: () => number;
}

/**
 * Runs the margin-call hook at most once per cooldown window, so a burst of
 * MARGIN_CALL frames cannot repeat a cancel-all. The handler's failures propagate to
 * the caller, which decides whether to retry.
 */
export class MarginCallSentinel {
  private lastFiredAt = Number.NEGATIVE_INFINITY;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(private readonly options: MarginCallSentinelOptions) {
    this.cooldownMs = options.cooldownMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  async handle(event: UserDataMarginCall): Promise<'TRIGGERED' | 'COOLDOWN'> {
    const at = this.now();
    if (at - this.lastFiredAt < this.cooldownMs) return 'COOLDOWN';
    this.lastFiredAt = at;
    await this.options.onMarginCall(event);
    return 'TRIGGERED';
  }
}
