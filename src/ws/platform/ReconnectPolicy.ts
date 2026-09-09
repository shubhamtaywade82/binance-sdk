import type { ReconnectPolicy } from './types.js';

/**
 * Reconnect backoff strategies.
 *
 * v2's {@link WsConnection} hard-coded `min(base * 2^attempt, max)`. The
 * platform keeps that as the default shape but makes it pluggable and adds
 * jitter: a reconnect storm (e.g. Binance restarting an edge) hits every
 * connection at once, and deterministic identical delays make the herd
 * collide on every subsequent attempt too. *Equal jitter* — half fixed, half
 * random — keeps the first retry responsive while decorrelating the herd.
 */

export interface ExponentialBackoffOptions {
  /** First-attempt delay. Default 1000ms. */
  baseMs?: number;
  /** Ceiling. Default 30000ms. */
  maxMs?: number;
  /** Random decorrelation; defaults on. Disable for deterministic tests. */
  jitter?: boolean;
  /** Injectable randomness for tests; must return [0, 1). */
  random?: () => number;
}

/**
 * Exponential backoff with equal jitter (default policy):
 * `raw = min(base * 2^attempt, max)`; returned delay is
 * `raw/2 + random() * raw/2` — always ≥ raw/2, ≤ raw.
 */
export function exponentialBackoff(options: ExponentialBackoffOptions = {}): ReconnectPolicy {
  const base = options.baseMs ?? 1_000;
  const max = options.maxMs ?? 30_000;
  const jitter = options.jitter ?? true;
  const random = options.random ?? Math.random;
  return {
    delayForMs(attempt: number): number {
      const raw = Math.min(base * 2 ** Math.max(0, attempt), max);
      if (!jitter) return raw;
      return Math.floor(raw / 2 + random() * (raw / 2));
    },
  };
}

/** Constant delay — reconnects at a fixed cadence regardless of attempt. */
export function fixedBackoff(delayMs: number): ReconnectPolicy {
  const clamped = Math.max(0, delayMs);
  return { delayForMs: () => clamped };
}

/** Linear backoff: `base * (attempt + 1)`, capped at `maxMs`. */
export function linearBackoff(options: { baseMs?: number; maxMs?: number } = {}): ReconnectPolicy {
  const base = options.baseMs ?? 1_000;
  const max = options.maxMs ?? 30_000;
  return {
    delayForMs(attempt: number): number {
      return Math.min(base * (Math.max(0, attempt) + 1), max);
    },
  };
}
