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

describe('SpotTrading pegged validation and allocations', () => {
  it('rejects an invalid pegPriceType before sending anything', async () => {
    const http = { post: vi.fn(async () => ({})) };
    await expect(
      new SpotTrading(http as unknown as HttpClient).createOrder({ symbol: 'BTCUSDT', pegPriceType: 'LIMIT' }),
    ).rejects.toMatchObject({ rule: 'PEGGED_ORDER' });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('sends a valid pegged order with the validated fields', async () => {
    const http = { post: vi.fn(async (_path: string, _body: Record<string, unknown>): Promise<unknown> => ({})) };
    await new SpotTrading(http as unknown as HttpClient)
      .createOrder({ symbol: 'BTCUSDT', pegPriceType: 'PRIMARY_PEG', pegOffsetType: 'PRICE_LEVEL', pegOffsetValue: '5' })
      .catch(() => undefined);
    expect(http.post.mock.calls[0]?.[1]).toMatchObject({ pegPriceType: 'PRIMARY_PEG', pegOffsetType: 'PRICE_LEVEL', pegOffsetValue: 5 });
  });

  it('parses SOR allocation records and keeps tradeId -1', async () => {
    const { SpotAllocationSchema } = await import('../../src/types/spot.types.js');
    const parsed = SpotAllocationSchema.parse({
      allocId: 1, tradeId: -1, symbol: 'BTCUSDT', orderId: 9, matchType: 'ONE_PARTY_TRADE_REPORT',
      workingFloor: 'SOR', allocationType: 'SOR',
    });
    expect(parsed.tradeId).toBe(-1);
    expect(parsed.workingFloor).toBe('SOR');
  });
});
