import { EventEmitter } from 'node:events';

/**
 * Structured, JSON-serializable observability events for every SDK subsystem.
 *
 * The legacy SDK had scattered ad-hoc logs and silent `catch {}` blocks; callers
 * had no way to answer "what happened to my order" or "why did the WS reconnect".
 * This bus makes the SDK's internal lifecycle a first-class observable surface
 * (a prerequisite for agent-driven trading, where the caller must be able to
 * audit every state transition).
 *
 * Design rules:
 *  - every payload is a plain object safe for JSON.stringify / NDJSON export
 *  - no events are emitted per market-data message (subscribe to the stream
 *    itself for data; the bus carries lifecycle and control-plane events only)
 *  - events are namespaced by the emitting subsystem, e.g. `http.request.end`,
 *    `ws.spotUser.state`, `execution.reconciled`, `risk.denied`
 *
 * Filters:
 *  - `bus.on('*', fn)`        — everything
 *  - `bus.on('ws.', fn)`      — prefix filter (trailing dot)
 *  - `bus.on('ws.state', fn)` — exact event name
 */

export interface SdkEvent {
  /** Wall-clock time the event was emitted (ms since epoch). */
  readonly ts: number;
  /** Sequence number, strictly increasing across the whole bus tree. */
  readonly seq: number;
  /** Emitting subsystem, e.g. `http`, `ws:spotMarket`, `execution`, `risk`. */
  readonly scope: string;
  /** Event name, e.g. `http.request.end`, `ws.state`, `execution.reconciled`. */
  readonly name: string;
  readonly payload: Record<string, unknown>;
}

export type SdkEventListener = (event: Readonly<SdkEvent>) => void;

export interface EventBusOptions {
  /** Keep the last N events retrievable via `history()`; default 0 (disabled). */
  historySize?: number;
  /** Scope label; only set internally via `scoped()`. */
  scope?: string;
}

interface Registry {
  exact: Map<string, Set<SdkEventListener>>;
  prefix: Map<string, Set<SdkEventListener>>;
  wildcard: Set<SdkEventListener>;
  history: SdkEvent[];
  seq: number;
  historySize: number;
}

export class EventBus {
  private readonly registry: Registry;
  private readonly emitter = new EventEmitter();
  private readonly children = new Map<string, EventBus>();
  private readonly scope: string;

  constructor(options: EventBusOptions = {}) {
    this.scope = options.scope ?? '';
    this.registry = {
      exact: new Map(),
      prefix: new Map(),
      wildcard: new Set(),
      history: [],
      seq: 0,
      historySize: options.historySize ?? 0,
    };
    this.emitter.setMaxListeners(0);
  }

  private parent: EventBus | null = null;

  /**
   * Subscribe. `filter` may be `'*'` (all events), a trailing-dot prefix such
   * as `'ws.'` or `'execution.'`, or an exact event name like `'ws.state'`.
   */
  on(filter: string, listener: SdkEventListener): this {
    if (filter === '*' || filter === '') {
      this.registry.wildcard.add(listener);
    } else if (filter.endsWith('.')) {
      let set = this.registry.prefix.get(filter);
      if (!set) {
        set = new Set();
        this.registry.prefix.set(filter, set);
      }
      set.add(listener);
    } else {
      let set = this.registry.exact.get(filter);
      if (!set) {
        set = new Set();
        this.registry.exact.set(filter, set);
      }
      set.add(listener);
    }
    return this;
  }

  once(filter: string, listener: SdkEventListener): this {
    const onceWrapper: SdkEventListener = (event) => {
      this.off(filter, onceWrapper);
      listener(event);
    };
    return this.on(filter, onceWrapper);
  }

  off(filter: string, listener: SdkEventListener): this {
    if (filter === '*' || filter === '') {
      this.registry.wildcard.delete(listener);
    } else if (filter.endsWith('.')) {
      this.registry.prefix.get(filter)?.delete(listener);
    } else {
      this.registry.exact.get(filter)?.delete(listener);
    }
    return this;
  }

  /** Publish an event tagged with this bus's scope. */
  emit(name: string, payload: Record<string, unknown> = {}): void {
    const root = this.parent ?? this;
    const event: SdkEvent = {
      ts: Date.now(),
      seq: ++root.registry.seq,
      scope: this.scope,
      name,
      payload,
    };
    if (root.registry.historySize > 0) {
      root.registry.history.push(event);
      if (root.registry.history.length > root.registry.historySize) {
        root.registry.history.shift();
      }
    }
    this.publish(event);
  }

  private publish(event: SdkEvent): void {
    for (const listener of this.registry.exact.get(event.name) ?? []) {
      try {
        listener(event);
      } catch {
        /* listener errors must never break the publisher */
      }
    }
    for (const [prefix, listeners] of this.registry.prefix) {
      if (event.name.startsWith(prefix)) {
        for (const listener of listeners) {
          try {
            listener(event);
          } catch {
            /* ignore */
          }
        }
      }
    }
    for (const listener of this.registry.wildcard) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
    if (this.parent) this.parent.publish(event);
  }

  /**
   * Derive a child bus whose emissions are automatically tagged with `scope`
   * and also delivered to this bus's own subscribers.
   */
  scoped(scope: string): EventBus {
    const existing = this.children.get(scope);
    if (existing) return existing;
    const child = new EventBus({ scope, historySize: this.registry.historySize });
    child.parent = this;
    this.children.set(scope, child);
    return child;
  }

  /** Last N events when the root bus was constructed with `historySize`. */
  history(): readonly SdkEvent[] {
    const root = this.parent ?? this;
    return [...root.registry.history];
  }

  clearHistory(): void {
    const root = this.parent ?? this;
    root.registry.history.length = 0;
  }
}

/** Minimal structured logger interface the SDK accepts. */
export interface SdkLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

/** Route severity by event-name suffix into any logger implementation. */
export function forwardEventsToLogger(bus: EventBus, logger: SdkLogger): void {
  bus.on('*', (event) => {
    const line = `[binance-sdk] ${event.scope} ${event.name}`;
    const meta = event.payload;
    const tail = event.name.split('.').pop() ?? '';
    if (tail === 'error' || tail === 'denied' || tail === 'failed') {
      logger.error?.(line, meta);
    } else if (tail === 'warn' || tail === 'reconnecting' || tail === 'stale' || tail === 'desync') {
      logger.warn?.(line, meta);
    } else {
      logger.info?.(line, meta);
    }
  });
}
