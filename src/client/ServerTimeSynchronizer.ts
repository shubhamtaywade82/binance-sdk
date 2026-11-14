/**
 * Clock synchronisation for signed requests.
 *
 * Verified: `recvWindow` defaults to 5000 ms and the server accepts a request when
 * `timestamp < serverTime + 1000 && serverTime - timestamp <= recvWindow`. The WS
 * API caps recvWindow at 60000. A timestamp-rejected request (-1021) is safe to
 * retry once after a resync, because the signature is recomputed with a fresh
 * timestamp.
 *
 * Method: offset = serverTime − midpoint(requestSent, responseReceived). The
 * midpoint assumes symmetric network delay, so RTT is the error bound. The sample
 * with the smallest RTT is used, and samples above `maxRttMs` are rejected.
 */

import { BinanceApiError } from '../errors/BinanceApiError.js';
import { PreflightValidationError } from '../errors/PreflightValidationError.js';

export const RECV_WINDOW_DEFAULT_MS = 5_000;
export const RECV_WINDOW_MAX_MS = 60_000;
export const TIMESTAMP_ERROR_CODE = -1021;

export interface TimeSample {
  /** Local epoch ms just before the time request was sent. */
  requestSentAtMs: number;
  /** Server epoch ms from the time endpoint response. */
  serverTimeMs: number;
  /** Local epoch ms when the response was received. */
  responseReceivedAtMs: number;
}

export interface ServerTimeSynchronizerOptions {
  /** Samples with a longer round trip than this are rejected. Default 5000 ms. */
  maxRttMs?: number;
  /** How long a sync stays valid. Default 5 minutes. */
  maxSampleAgeMs?: number;
  /** Clock injection. Default: `Date.now`. */
  now?: () => number;
}

interface StoredSample {
  rttMs: number;
  offsetMs: number;
  acceptedAtMs: number;
}

export class ServerTimeSynchronizer {
  private readonly maxRttMs: number;
  private readonly maxSampleAgeMs: number;
  private readonly now: () => number;
  private best: StoredSample | undefined;

  constructor(options: ServerTimeSynchronizerOptions = {}) {
    this.maxRttMs = options.maxRttMs ?? 5_000;
    this.maxSampleAgeMs = options.maxSampleAgeMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Record a sample. Returns the sample's RTT and offset when accepted, or null when
   * it is rejected (negative RTT, RTT above the limit, or non-finite values). A
   * rejected sample never changes the current offset.
   */
  addSample(sample: TimeSample): { rttMs: number; offsetMs: number } | null {
    const { requestSentAtMs, serverTimeMs, responseReceivedAtMs } = sample;
    if (![requestSentAtMs, serverTimeMs, responseReceivedAtMs].every(Number.isFinite)) return null;
    const rttMs = responseReceivedAtMs - requestSentAtMs;
    if (rttMs < 0 || rttMs > this.maxRttMs) return null;

    const midpoint = requestSentAtMs + Math.floor(rttMs / 2);
    const offsetMs = serverTimeMs - midpoint;
    const acceptedAtMs = this.now();
    // Keep the lowest-RTT sample. A fresher sample with the same RTT wins.
    if (!this.best || rttMs <= this.best.rttMs || !this.isFresh(this.best, acceptedAtMs)) {
      this.best = { rttMs, offsetMs, acceptedAtMs };
    }
    return { rttMs, offsetMs };
  }

  get isSynced(): boolean {
    return this.best !== undefined && this.isFresh(this.best, this.now());
  }

  /** Current offset (server − local). Throws when no fresh sample exists. */
  get offsetMs(): number {
    if (!this.isSynced || !this.best) {
      throw new PreflightValidationError('INVALID_INPUT', 'clock is not synchronised with the server; call sync first');
    }
    return this.best.offsetMs;
  }

  /** Server-aligned epoch ms for a signed request timestamp. */
  serverTimeNow(): number {
    return this.now() + this.offsetMs;
  }

  private isFresh(sample: StoredSample, at: number): boolean {
    return at - sample.acceptedAtMs <= this.maxSampleAgeMs;
  }
}

/** Validate a recvWindow. Undefined uses the default. Above the cap is rejected. */
export function resolveRecvWindow(value: number | undefined): number {
  if (value === undefined) return RECV_WINDOW_DEFAULT_MS;
  if (!Number.isFinite(value) || value <= 0 || value > RECV_WINDOW_MAX_MS) {
    throw new PreflightValidationError(
      'INVALID_INPUT',
      `recvWindow must be in (0, ${RECV_WINDOW_MAX_MS}] ms, got ${value}`,
      { recvWindow: value },
    );
  }
  return value;
}

export function isTimestampError(error: unknown): boolean {
  return error instanceof BinanceApiError && error.code === TIMESTAMP_ERROR_CODE;
}

/**
 * Run a signed request with a server-aligned timestamp. On -1021 the clock is
 * resynchronised and the request is retried exactly once. The retry gets a fresh
 * timestamp and signature, so it cannot replay the rejected request.
 */
export async function withTimestampRetry<T>(
  run: (timestampMs: number) => Promise<T>,
  resync: () => Promise<void>,
  synchronizer: Pick<ServerTimeSynchronizer, 'serverTimeNow'>,
): Promise<T> {
  try {
    return await run(Math.floor(synchronizer.serverTimeNow()));
  } catch (error) {
    if (!isTimestampError(error)) throw error;
    await resync();
    return run(Math.floor(synchronizer.serverTimeNow()));
  }
}
