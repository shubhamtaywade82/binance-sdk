import { PreflightValidationError } from '../errors/PreflightValidationError.js';

/** Minimum lead time: goodTillDate must be strictly greater than now + 600 s (verified). */
export const GTD_MIN_LEAD_MS = 600_000;
/** Upper bound for goodTillDate (verified: "smaller than 253402300799000"). */
export const GTD_MAX_TIMESTAMP_MS = 253_402_300_799_000;

export interface GoodTillDateParams {
  timeInForce: string;
  /** Epoch milliseconds. Required when timeInForce is GTD. */
  goodTillDate?: number;
  /** Current epoch milliseconds, supplied by the caller so the check is deterministic. */
  nowMs: number;
}

/**
 * Resolve the goodTillDate to send. Only GTD orders use it. For any other
 * timeInForce this returns `undefined`, and the caller should not send the field.
 *
 * For GTD: the value is required, must be an integer no greater than
 * {@link GTD_MAX_TIMESTAMP_MS}, and is truncated to whole seconds (Binance keeps
 * second precision and ignores the ms part). The truncated value must still be
 * more than {@link GTD_MIN_LEAD_MS} after `nowMs`.
 */
export function resolveGoodTillDate(params: GoodTillDateParams): number | undefined {
  if (params.timeInForce !== 'GTD') return undefined;
  if (!Number.isSafeInteger(params.nowMs)) {
    throw new PreflightValidationError('INVALID_INPUT', 'nowMs must be an integer epoch-ms value');
  }
  const requested = params.goodTillDate;
  if (requested === undefined || !Number.isSafeInteger(requested)) {
    throw new PreflightValidationError(
      'GTD_REQUIRED',
      'goodTillDate (integer epoch ms) is required when timeInForce is GTD',
    );
  }
  if (requested > GTD_MAX_TIMESTAMP_MS) {
    throw new PreflightValidationError('GTD_RANGE', `goodTillDate ${requested} exceeds ${GTD_MAX_TIMESTAMP_MS}`, {
      goodTillDate: requested,
    });
  }
  const truncated = Math.floor(requested / 1000) * 1000;
  if (!(truncated > params.nowMs + GTD_MIN_LEAD_MS)) {
    throw new PreflightValidationError(
      'GTD_LEAD_TIME',
      `goodTillDate ${truncated} must be greater than now + ${GTD_MIN_LEAD_MS} ms (now ${params.nowMs})`,
      { goodTillDate: truncated, nowMs: params.nowMs, minLeadMs: GTD_MIN_LEAD_MS },
    );
  }
  return truncated;
}
