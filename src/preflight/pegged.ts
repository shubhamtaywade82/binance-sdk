import { PreflightValidationError } from '../errors/PreflightValidationError.js';

/**
 * Pegged-order pre-flight (spot). Verified against the vendored spot newOrder
 * Postman descriptions: `pegPriceType` is `PRIMARY_PEG` or `MARKET_PEG`,
 * `pegOffsetType` is only `PRICE_LEVEL`, and `pegOffsetValue` has a maximum of 100.
 *
 * Not enforced because the docs I could reach do not state them: the minimum
 * offset, a required offset-type/value pair, a MARKET_PEG + LIMIT_MAKER block, and
 * whether price is optional.
 */

export const PEG_PRICE_TYPES = ['PRIMARY_PEG', 'MARKET_PEG'] as const;
export type PegPriceType = (typeof PEG_PRICE_TYPES)[number];
export const PEG_OFFSET_TYPES = ['PRICE_LEVEL'] as const;
export type PegOffsetType = (typeof PEG_OFFSET_TYPES)[number];
export const PEG_OFFSET_VALUE_MAX = 100;

export interface PeggedOrderParams {
  pegPriceType?: string;
  pegOffsetType?: string;
  pegOffsetValue?: number;
}

export interface PeggedOrderResult {
  pegPriceType?: PegPriceType;
  pegOffsetType?: PegOffsetType;
  pegOffsetValue?: number;
}

export function validatePeggedOrder(params: PeggedOrderParams): PeggedOrderResult {
  const result: PeggedOrderResult = {};

  if (params.pegPriceType !== undefined) {
    if (!(PEG_PRICE_TYPES as readonly string[]).includes(params.pegPriceType)) {
      throw new PreflightValidationError(
        'PEGGED_ORDER',
        `pegPriceType must be one of ${PEG_PRICE_TYPES.join(', ')}, got ${params.pegPriceType}`,
        { pegPriceType: params.pegPriceType },
      );
    }
    result.pegPriceType = params.pegPriceType as PegPriceType;
  }

  if (params.pegOffsetType !== undefined) {
    if (!(PEG_OFFSET_TYPES as readonly string[]).includes(params.pegOffsetType)) {
      throw new PreflightValidationError(
        'PEGGED_ORDER',
        `pegOffsetType must be ${PEG_OFFSET_TYPES.join(' or ')}, got ${params.pegOffsetType}`,
        { pegOffsetType: params.pegOffsetType },
      );
    }
    result.pegOffsetType = params.pegOffsetType as PegOffsetType;
  }

  if (params.pegOffsetValue !== undefined) {
    const value = params.pegOffsetValue;
    if (!Number.isInteger(value) || value < 0 || value > PEG_OFFSET_VALUE_MAX) {
      throw new PreflightValidationError(
        'PEGGED_ORDER',
        `pegOffsetValue must be an integer in [0, ${PEG_OFFSET_VALUE_MAX}], got ${value}`,
        { pegOffsetValue: value },
      );
    }
    result.pegOffsetValue = value;
  }

  return result;
}
