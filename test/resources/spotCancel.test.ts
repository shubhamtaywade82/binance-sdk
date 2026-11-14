import { describe, expect, it, vi } from 'vitest';
import { BinanceApiError } from '../../src/errors/BinanceApiError.js';
import { BinanceCancelRestrictionFailedError } from '../../src/errors/BinanceCancelRestrictionFailedError.js';
import { SpotTrading } from '../../src/resources/SpotTrading.js';
import type { HttpClient } from '../../src/client/HttpClient.js';

const orderReply = {
  symbol: 'BTCUSDT', orderId: 7, orderListId: -1, clientOrderId: 'c', price: '60000', origQty: '0.1',
  executedQty: '0', cummulativeQuoteQty: '0', status: 'CANCELED', timeInForce: 'GTC', type: 'LIMIT',
  side: 'BUY', stopPrice: '0', icebergQty: '0', time: 1, updateTime: 2, isWorking: true,
  workingTime: 1, origQuoteOrderQty: '0', selfTradePreventionMode: 'NONE',
};

describe('SpotTrading.cancelOrder', () => {
  it('keeps orderId and drops origClientOrderId when both are given', async () => {
    const http = { delete: vi.fn(async (_path: string, _params: Record<string, unknown>) => orderReply) };
    await new SpotTrading(http as unknown as HttpClient).cancelOrder('BTCUSDT', {
      orderId: 7, origClientOrderId: 'c', cancelRestrictions: 'ONLY_NEW',
    });
    expect(http.delete.mock.calls[0]?.[1]).toEqual({ symbol: 'BTCUSDT', orderId: 7, cancelRestrictions: 'ONLY_NEW' });
  });

  it('sends origClientOrderId when no orderId is given', async () => {
    const http = { delete: vi.fn(async (_path: string, _params: Record<string, unknown>) => orderReply) };
    await new SpotTrading(http as unknown as HttpClient).cancelOrder('BTCUSDT', { origClientOrderId: 'c' });
    expect(http.delete.mock.calls[0]?.[1]).toEqual({ symbol: 'BTCUSDT', origClientOrderId: 'c' });
  });

  it('re-throws a -2011 reply as BinanceCancelRestrictionFailedError', async () => {
    const http = {
      delete: vi.fn(async () => {
        throw new BinanceApiError('Order was not canceled due to cancel restrictions.', -2011, 400, {
          endpoint: '/order', method: 'DELETE',
        });
      }),
    };
    const error = await new SpotTrading(http as unknown as HttpClient)
      .cancelOrder('BTCUSDT', { orderId: 7, cancelRestrictions: 'ONLY_PARTIALLY_FILLED' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BinanceCancelRestrictionFailedError);
    expect((error as BinanceCancelRestrictionFailedError).code).toBe(-2011);
  });

  it('leaves other errors untouched', async () => {
    const http = { delete: vi.fn(async () => { throw new BinanceApiError('Unknown order sent.', -2013, 400); }) };
    const error = await new SpotTrading(http as unknown as HttpClient).cancelOrder('BTCUSDT', { orderId: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BinanceApiError);
    expect(error).not.toBeInstanceOf(BinanceCancelRestrictionFailedError);
  });
});
