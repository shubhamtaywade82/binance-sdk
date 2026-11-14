import {
  ceilRatio,
  compareFixed,
  formatFixed,
  isOnStep,
  normalizeFixed,
} from '../core/fixedpoint.js';
import { PreflightValidationError } from '../errors/PreflightValidationError.js';
import { parseInput } from './shared.js';

/** LOT_SIZE rules that Binance applies to `icebergQty` exactly as to `quantity`. */
export interface IcebergLotRules {
  stepSize: string | number;
  minQty: string | number;
  /** `undefined` or `Infinity` means no upper cap. */
  maxQty?: string | number;
}

export interface IcebergOrderParams {
  quantity: string | number;
  icebergQty: string | number;
  lot: IcebergLotRules;
  /** `ICEBERG_PARTS.limit`. Omit when the symbol has no such filter. */
  partsLimit?: number;
}

export interface IcebergOrderResult {
  /** Canonical slice quantity to send. */
  icebergQty: string;
  /** Number of slices: CEIL(quantity / icebergQty). */
  parts: number;
}

/**
 * Iceberg pre-flight. Verified against Binance's filter docs:
 * - an iceberg order has icebergQty > 0;
 * - icebergQty obeys LOT_SIZE (step, min, max) like quantity;
 * - parts = CEIL(quantity / icebergQty) must not exceed ICEBERG_PARTS.limit.
 *
 * Not enforced here (not verified against the filter docs): a required
 * timeInForce of GTC for iceberg orders, and a per-slice notional floor.
 */
export function validateIcebergOrder(params: IcebergOrderParams): IcebergOrderResult {
  const quantity = parseInput(params.quantity, 'quantity');
  const slice = parseInput(params.icebergQty, 'icebergQty');
  if (slice.units <= 0n) {
    throw new PreflightValidationError('ICEBERG_QTY', 'icebergQty must be > 0', {
      icebergQty: String(params.icebergQty),
    });
  }
  if (compareFixed(slice, quantity) > 0) {
    throw new PreflightValidationError('ICEBERG_QTY', 'icebergQty must not exceed quantity', {
      icebergQty: String(params.icebergQty),
      quantity: String(params.quantity),
    });
  }

  const step = normalizeFixed(parseInput(params.lot.stepSize, 'stepSize'));
  if (step.units <= 0n) {
    throw new PreflightValidationError('INVALID_INPUT', 'LOT_SIZE stepSize must be > 0');
  }
  if (!isOnStep(slice, step)) {
    throw new PreflightValidationError('ICEBERG_LOT', `icebergQty ${String(params.icebergQty)} is not on stepSize ${String(params.lot.stepSize)}`);
  }
  const minQty = parseInput(params.lot.minQty, 'minQty');
  if (compareFixed(slice, minQty) < 0) {
    throw new PreflightValidationError('ICEBERG_LOT', `icebergQty ${String(params.icebergQty)} is below minQty ${String(params.lot.minQty)}`);
  }
  const maxQty = params.lot.maxQty;
  const hasMaxCap = maxQty !== undefined && !(typeof maxQty === 'number' && !Number.isFinite(maxQty));
  if (hasMaxCap && compareFixed(slice, parseInput(maxQty, 'maxQty')) > 0) {
    throw new PreflightValidationError('ICEBERG_LOT', `icebergQty ${String(params.icebergQty)} exceeds maxQty ${String(maxQty)}`);
  }

  const parts = ceilRatio(quantity, slice);
  if (parts > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PreflightValidationError('ICEBERG_PARTS', 'iceberg slice count exceeds safe integer range');
  }
  if (params.partsLimit !== undefined && parts > BigInt(params.partsLimit)) {
    throw new PreflightValidationError(
      'ICEBERG_PARTS',
      `iceberg order would have ${parts} parts, above the ICEBERG_PARTS limit of ${params.partsLimit}`,
      { parts: parts.toString(), limit: params.partsLimit },
    );
  }

  const canonical = normalizeFixed(slice);
  return {
    icebergQty: formatFixed(canonical, canonical.scale),
    parts: Number(parts),
  };
}
