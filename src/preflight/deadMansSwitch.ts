import { BinanceError } from '../errors/BinanceError.js';

export type DeadMansSwitchState = 'DISARMED' | 'ARMED';

export interface DeadMansSwitchTimers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Minimal process-like signal source (`process` satisfies it). */
export interface DeadMansSwitchSignalSource {
  on(event: NodeJS.Signals, listener: () => void): unknown;
  off(event: NodeJS.Signals, listener: () => void): unknown;
}

export interface DeadMansSwitchOptions {
  /** Symbols to protect. countdownCancelAll is issued per symbol. */
  symbols: readonly string[];
  /**
   * Countdown sent on every heartbeat. When it elapses without a refresh, Binance
   * cancels that symbol's open orders. Positive integer milliseconds.
   */
  countdownMs: number;
  /** Heartbeat period. Must be a positive integer below countdownMs. Default: floor(countdownMs / 3). */
  heartbeatMs?: number;
  /**
   * Issues countdownCancelAll for one symbol. Same contract as
   * `futures.trading.setCountdownCancelAll(symbol, countdownTime)`.
   */
  send: (symbol: string, countdownMs: number) => Promise<unknown>;
  /** Called for each failed heartbeat. Heartbeat failures never throw from the timer. */
  onError?: (error: unknown, symbol: string) => void;
  timers?: DeadMansSwitchTimers;
  /**
   * Stop heartbeats on SIGINT/SIGTERM, then re-raise the signal so the default
   * action still runs. Stopping does NOT send countdown 0: the countdown keeps
   * running and cancels resting orders once it elapses. Default: false.
   */
  handleSignals?: boolean;
  signalSource?: DeadMansSwitchSignalSource;
  /** Re-raises a signal after handlers are removed. Default: `process.kill(process.pid, signal)`. */
  reraise?: (signal: NodeJS.Signals) => void;
}

export interface DeadMansSwitchHeartbeatResult {
  symbol: string;
  ok: boolean;
  error?: unknown;
}

export class DeadMansSwitchError extends BinanceError {
  readonly failures: readonly DeadMansSwitchHeartbeatResult[];

  constructor(message: string, failures: readonly DeadMansSwitchHeartbeatResult[]) {
    super(message);
    this.name = 'DeadMansSwitchError';
    this.failures = failures;
  }
}

const SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

/**
 * Heartbeat daemon for exchange-side order cancellation. The exchange cancels a
 * symbol's open orders when no countdownCancelAll refresh arrives within the
 * countdown, so a crashed or hung process cannot leave orders resting unattended.
 *
 * Lifecycle:
 * - {@link arm} issues the first heartbeat for every symbol. If any fails, it
 *   throws and stays DISARMED. Trading must not start blind.
 * - Heartbeats then repeat every heartbeatMs.
 * - {@link stop} halts heartbeats only. The countdown then expires and cancels orders.
 * - {@link disarm} halts heartbeats and sends countdown 0 to cancel the countdown
 *   explicitly. Resting orders then stay live. Use it only for a deliberate hand-off.
 */
export class DeadMansSwitch {
  private state: DeadMansSwitchState = 'DISARMED';
  private handle: unknown;
  private signalListeners: Array<{ signal: NodeJS.Signals; listener: () => void }> = [];

  private readonly symbols: readonly string[];
  private readonly countdownMs: number;
  private readonly heartbeatMs: number;
  private readonly send: (symbol: string, countdownMs: number) => Promise<unknown>;
  private readonly onError?: (error: unknown, symbol: string) => void;
  private readonly timers: DeadMansSwitchTimers;
  private readonly handleSignals: boolean;
  private readonly signalSource: DeadMansSwitchSignalSource | undefined;
  private readonly reraise: (signal: NodeJS.Signals) => void;

  constructor(options: DeadMansSwitchOptions) {
    if (options.symbols.length === 0) {
      throw new RangeError('DeadMansSwitch: at least one symbol is required');
    }
    if (!Number.isSafeInteger(options.countdownMs) || options.countdownMs <= 0) {
      throw new RangeError(`DeadMansSwitch: countdownMs must be a positive integer, got ${options.countdownMs}`);
    }
    const heartbeatMs = options.heartbeatMs ?? Math.floor(options.countdownMs / 3);
    if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0 || heartbeatMs >= options.countdownMs) {
      throw new RangeError(
        `DeadMansSwitch: heartbeatMs must be a positive integer below countdownMs (${options.countdownMs}), got ${heartbeatMs}`,
      );
    }
    this.symbols = [...options.symbols];
    this.countdownMs = options.countdownMs;
    this.heartbeatMs = heartbeatMs;
    this.send = options.send;
    this.onError = options.onError;
    this.timers = options.timers ?? {
      setInterval: (callback, ms) => setInterval(callback, ms),
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    };
    this.handleSignals = options.handleSignals ?? false;
    this.signalSource = options.signalSource ?? (this.handleSignals ? process : undefined);
    this.reraise = options.reraise ?? ((signal) => process.kill(process.pid, signal));
  }

  get currentState(): DeadMansSwitchState {
    return this.state;
  }

  /** Issue the first heartbeat for every symbol, then start the periodic timer. */
  async arm(): Promise<void> {
    if (this.state === 'ARMED') return;
    const results = await this.heartbeat();
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      throw new DeadMansSwitchError(
        `DeadMansSwitch failed to arm for ${failures.map((f) => f.symbol).join(', ')}`,
        failures,
      );
    }
    this.state = 'ARMED';
    this.handle = this.timers.setInterval(() => {
      void this.heartbeat();
    }, this.heartbeatMs);
    if (this.handleSignals && this.signalSource) this.attachSignals(this.signalSource);
  }

  /** Stop heartbeats. Orders are cancelled by the exchange when the countdown elapses. */
  stop(): void {
    if (this.handle !== undefined) {
      this.timers.clearInterval(this.handle);
      this.handle = undefined;
    }
    this.detachSignals();
    this.state = 'DISARMED';
  }

  /** Stop heartbeats, then send countdown 0 for every symbol, which cancels the countdown itself. */
  async disarm(): Promise<DeadMansSwitchHeartbeatResult[]> {
    this.stop();
    return this.broadcast(0);
  }

  /** Send one heartbeat to every symbol. Never throws. Failures are reported and passed to onError. */
  heartbeat(): Promise<DeadMansSwitchHeartbeatResult[]> {
    return this.broadcast(this.countdownMs);
  }

  private async broadcast(countdownMs: number): Promise<DeadMansSwitchHeartbeatResult[]> {
    // The async wrapper turns a synchronous throw from `send` into a rejection, so
    // allSettled sees every symbol and the timer callback can never reject.
    const settled = await Promise.allSettled(
      this.symbols.map(async (symbol) => this.send(symbol, countdownMs)),
    );
    return settled.map((outcome, i) => {
      const symbol = this.symbols[i] as string;
      if (outcome.status === 'fulfilled') return { symbol, ok: true };
      this.safeReport(outcome.reason, symbol);
      return { symbol, ok: false, error: outcome.reason };
    });
  }

  private safeReport(error: unknown, symbol: string): void {
    try {
      this.onError?.(error, symbol);
    } catch {
      // A throwing reporter must not break the heartbeat loop.
    }
  }

  private attachSignals(source: DeadMansSwitchSignalSource): void {
    this.detachSignals();
    for (const signal of SIGNALS) {
      const listener = (): void => {
        this.stop();
        this.detachSignals();
        this.reraise(signal);
      };
      source.on(signal, listener);
      this.signalListeners.push({ signal, listener });
    }
  }

  private detachSignals(): void {
    if (!this.signalSource) return;
    for (const { signal, listener } of this.signalListeners) {
      this.signalSource.off(signal, listener);
    }
    this.signalListeners = [];
  }
}
