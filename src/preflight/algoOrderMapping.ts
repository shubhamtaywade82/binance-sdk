import { PreflightValidationError } from '../errors/PreflightValidationError.js';

/**
 * Maps order parameters onto the POST /fapi/v1/algoOrder schema. The field list is the
 * vendored spec's New Algo Order parameters. Renames: newClientOrderId → clientAlgoId,
 * stopPrice → triggerPrice, activationPrice → activatePrice.
 *
 * Fail closed: a field the algo endpoint does not accept is rejected here, not sent.
 * algoType defaults to CONDITIONAL. The vendored UM algo spec allows only that value; the
 * USDⓈ-M futures value is not stated in the vendored spec, so callers can override it.
 */

export const ALGO_ORDER_FIELDS: ReadonlySet<string> = new Set([
  'algoType',
  'symbol',
  'side',
  'positionSide',
  'type',
  'timeInForce',
  'quantity',
  'price',
  'triggerPrice',
  'workingType',
  'priceMatch',
  'closePosition',
  'priceProtect',
  'reduceOnly',
  'activatePrice',
  'callbackRate',
  'clientAlgoId',
  'newOrderRespType',
  'selfTradePreventionMode',
  'goodTillDate',
]);

const RENAMES: Readonly<Record<string, string>> = {
  newClientOrderId: 'clientAlgoId',
  stopPrice: 'triggerPrice',
  activationPrice: 'activatePrice',
};

export function toAlgoOrderParams(
  params: Readonly<Record<string, unknown>>,
  options: { algoType?: string } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { algoType: options.algoType ?? 'CONDITIONAL' };
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const target = RENAMES[key] ?? key;
    if (!ALGO_ORDER_FIELDS.has(target)) {
      throw new PreflightValidationError(
        'ORDER_TYPE_ROUTE',
        `field "${key}" is not accepted by the algo order endpoint`,
        { field: key },
      );
    }
    out[target] = value;
  }
  return out;
}
