import { PreflightValidationError } from '../errors/PreflightValidationError.js';

export type PositionSide = 'BOTH' | 'LONG' | 'SHORT';

export interface PositionModeGuardOptions {
  /**
   * Maximum age of the last `setDualSidePosition` call before the cached mode is
   * treated as unknown. Omit for no expiry. A stale mode fails closed.
   */
  maxAgeMs?: number;
  /** Clock injection for deterministic tests. Default: `Date.now`. */
  now?: () => number;
}

/**
 * Caches the account's position mode and validates `positionSide` before an
 * order is sent. Hedge mode (dualSidePosition = true) requires LONG or SHORT.
 * One-way mode requires BOTH or no value. An unknown or stale mode throws,
 * because guessing the mode would produce a -4061 rejection at best.
 *
 * The caller must sync the mode from the exchange (e.g. from
 * GET /fapi/v1/positionSide/dual) and feed it in with `setDualSidePosition`.
 */
export class PositionModeGuard {
  private dualSidePosition: boolean | undefined;
  private syncedAtMs: number | undefined;
  private readonly maxAgeMs: number | undefined;
  private readonly now: () => number;

  constructor(options: PositionModeGuardOptions = {}) {
    this.maxAgeMs = options.maxAgeMs;
    this.now = options.now ?? Date.now;
  }

  setDualSidePosition(dualSidePosition: boolean): void {
    this.dualSidePosition = dualSidePosition;
    this.syncedAtMs = this.now();
  }

  /** Whether the cached mode is fresh enough to validate against. */
  private isFresh(): boolean {
    if (this.dualSidePosition === undefined || this.syncedAtMs === undefined) return false;
    if (this.maxAgeMs === undefined) return true;
    return this.now() - this.syncedAtMs <= this.maxAgeMs;
  }

  /**
   * Validate and normalize `positionSide`. Returns the value to send. In one-way
   * mode an omitted value becomes `BOTH`.
   */
  resolvePositionSide(positionSide?: PositionSide): PositionSide {
    if (!this.isFresh()) {
      throw new PreflightValidationError(
        'POSITION_MODE_UNKNOWN',
        'account position mode is unknown or stale; sync it with setDualSidePosition() first',
      );
    }
    if (this.dualSidePosition) {
      if (positionSide !== 'LONG' && positionSide !== 'SHORT') {
        throw new PreflightValidationError(
          'POSITION_SIDE_MISMATCH',
          `hedge mode requires positionSide LONG or SHORT, got ${positionSide ?? 'undefined'}`,
          { positionSide: positionSide ?? null, mode: 'HEDGE' },
        );
      }
      return positionSide;
    }
    if (positionSide === 'LONG' || positionSide === 'SHORT') {
      throw new PreflightValidationError(
        'POSITION_SIDE_MISMATCH',
        `one-way mode requires positionSide BOTH or omitted, got ${positionSide}`,
        { positionSide, mode: 'ONE_WAY' },
      );
    }
    return 'BOTH';
  }
}
