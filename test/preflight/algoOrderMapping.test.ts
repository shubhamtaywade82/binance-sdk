import { describe, expect, it } from 'vitest';
import { PreflightValidationError } from '../../src/errors/PreflightValidationError.js';
import { toAlgoOrderParams } from '../../src/preflight/algoOrderMapping.js';

describe('toAlgoOrderParams', () => {
  it('defaults algoType to CONDITIONAL and renames the plain-order fields', () => {
    expect(
      toAlgoOrderParams({
        symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET', stopPrice: '59000',
        newClientOrderId: 'sl-1', workingType: 'MARK_PRICE', closePosition: true,
      }),
    ).toEqual({
      algoType: 'CONDITIONAL', symbol: 'BTCUSDT', side: 'SELL', type: 'STOP_MARKET',
      triggerPrice: '59000', clientAlgoId: 'sl-1', workingType: 'MARK_PRICE', closePosition: true,
    });
  });

  it('renames activationPrice to activatePrice and keeps callbackRate', () => {
    const out = toAlgoOrderParams({ symbol: 'BTCUSDT', side: 'SELL', type: 'TRAILING_STOP_MARKET', activationPrice: '105', callbackRate: '1' });
    expect(out).toMatchObject({ activatePrice: '105', callbackRate: '1' });
    expect(out).not.toHaveProperty('activationPrice');
  });

  it('drops undefined and null values', () => {
    expect(toAlgoOrderParams({ symbol: 'BTCUSDT', reduceOnly: undefined, price: null })).toEqual({
      algoType: 'CONDITIONAL', symbol: 'BTCUSDT',
    });
  });

  it('honours a caller-supplied algoType', () => {
    expect(toAlgoOrderParams({ symbol: 'BTCUSDT' }, { algoType: 'OTHER' })).toMatchObject({ algoType: 'OTHER' });
  });

  it('rejects a field the algo endpoint does not accept, rather than sending it', () => {
    expect(() => toAlgoOrderParams({ symbol: 'BTCUSDT', icebergQty: '1' })).toThrow(PreflightValidationError);
    try {
      toAlgoOrderParams({ symbol: 'BTCUSDT', icebergQty: '1' });
    } catch (err) {
      expect((err as PreflightValidationError).rule).toBe('ORDER_TYPE_ROUTE');
    }
  });
});
