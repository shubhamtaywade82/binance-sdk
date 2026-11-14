import { describe, expect, it, vi } from 'vitest';
import { BinanceApiError } from '../../src/errors/BinanceApiError.js';
import { BatchOrdersPartialError } from '../../src/errors/BatchOrdersPartialError.js';
import { PreflightValidationError } from '../../src/errors/PreflightValidationError.js';
import { PositionModeGuard } from '../../src/preflight/positionMode.js';
import { FuturesTrading } from '../../src/resources/FuturesTrading.js';
import type { HttpClient } from '../../src/client/HttpClient.js';

function stubHttp() {
  return {
    get: vi.fn(async () => ({ dualSidePosition: true })),
    post: vi.fn(async (_path: string, body: { batchOrders?: string }): Promise<unknown> => {
      const orders = JSON.parse(body.batchOrders ?? '[]') as unknown[];
      return orders.map((_, i) => ({ orderId: i + 1, symbol: 'BTCUSDT' }));
    }),
    delete: vi.fn(),
  };
}

function trading(http: ReturnType<typeof stubHttp>): FuturesTrading {
  return new FuturesTrading(http as unknown as HttpClient);
}

const base = { symbol: 'BTCUSDT', side: 'BUY' as const, type: 'LIMIT', quantity: '0.001', price: '60000' };

describe('FuturesTrading.createOrder preflight', () => {
  it('rejects GTD without goodTillDate before anything is sent', async () => {
    const http = stubHttp();
    await expect(trading(http).createOrder({ ...base, timeInForce: 'GTD' })).rejects.toBeInstanceOf(
      PreflightValidationError,
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('sends a GTD goodTillDate truncated to whole seconds', async () => {
    const http = stubHttp();
    const goodTillDate = Date.now() + 3_600_123;
    await trading(http).createOrder({ ...base, timeInForce: 'GTD', goodTillDate }).catch(() => undefined);
    const sent = http.post.mock.calls[0]?.[1] as { goodTillDate: number };
    expect(sent.goodTillDate).toBe(Math.floor(goodTillDate / 1000) * 1000);
  });

  it('drops goodTillDate for non-GTD orders', async () => {
    const http = stubHttp();
    await trading(http).createOrder({ ...base, timeInForce: 'GTC', goodTillDate: Date.now() + 3_600_000 }).catch(() => undefined);
    expect(http.post.mock.calls[0]?.[1]).not.toHaveProperty('goodTillDate');
  });

  it('bounds TRAILING_STOP_MARKET callbackRate for the route the order takes', async () => {
    const http = stubHttp();
    // Algo route (TRAILING_STOP_MARKET) allows up to 20, so 15 passes preflight.
    await trading(http).createOrder({ ...base, type: 'TRAILING_STOP_MARKET', callbackRate: '15' }).catch(() => undefined);
    expect(http.post.mock.calls[0]?.[1]).toMatchObject({ callbackRate: '15' });
    // A plain LIMIT order carrying a callbackRate is validated against the order route (max 10).
    await expect(
      trading(stubHttp()).createOrder({ ...base, type: 'LIMIT', callbackRate: '15' }),
    ).rejects.toBeInstanceOf(PreflightValidationError);
  });

  it('checks positionSide against the synced mode, failing closed when unknown', async () => {
    const http = stubHttp();
    const futures = trading(http);
    futures.setPositionModeGuard(new PositionModeGuard());
    await expect(futures.createOrder({ ...base, positionSide: 'LONG' })).rejects.toMatchObject({
      rule: 'POSITION_MODE_UNKNOWN',
    });
    expect(await futures.syncPositionMode()).toBe(true);
    await expect(futures.createOrder({ ...base, positionSide: 'BOTH' })).rejects.toMatchObject({
      rule: 'POSITION_SIDE_MISMATCH',
    });
    await futures.createOrder({ ...base, positionSide: 'LONG' }).catch(() => undefined);
    expect(http.post.mock.calls[0]?.[1]).toMatchObject({ positionSide: 'LONG' });
  });

  it('passes through when no position-mode guard is attached (opt-in)', async () => {
    const http = stubHttp();
    await trading(http).createOrder({ ...base, positionSide: 'BOTH' }).catch(() => undefined);
    expect(http.get).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(1);
  });
});

describe('FuturesTrading batch placement', () => {
  const orders = Array.from({ length: 7 }, (_, i) => ({ ...base, newClientOrderId: `c${i}` }));

  it('auto-chunks to 5 per call and returns one result per input, in order', async () => {
    const http = stubHttp();
    const results = await trading(http).placeBatchOrders(orders);
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('keeps a per-element rejection without failing the rest', async () => {
    const http = stubHttp();
    http.post.mockImplementationOnce(async () => [
      { orderId: 1 },
      { code: -2019, msg: 'Margin is insufficient.' },
      { orderId: 3 },
    ]);
    const results = await trading(http).placeBatchOrders(orders.slice(0, 3));
    expect(results[1]).toEqual({ index: 1, success: false, status: 'REJECTED', code: -2019, msg: 'Margin is insufficient.' });
    expect(results[0]?.success).toBe(true);
  });

  it('marks a 5xx chunk UNKNOWN and still sends the next chunk', async () => {
    const http = stubHttp();
    http.post.mockRejectedValueOnce(new BinanceApiError('internal', -1001, 503));
    const results = await trading(http).placeBatchOrders(orders);
    expect(results.slice(0, 5).every((r) => !r.success && r.status === 'UNKNOWN')).toBe(true);
    expect(results.slice(5).every((r) => r.success)).toBe(true);
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('legacy createBatchOrders throws BatchOrdersPartialError when any element is not accepted', async () => {
    const http = stubHttp();
    http.post.mockImplementationOnce(async () => [{ code: -2019, msg: 'Margin is insufficient.' }]);
    const error = await trading(http)
      .createBatchOrders(orders.slice(0, 1))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BatchOrdersPartialError);
    expect((error as BatchOrdersPartialError).rejectedCount).toBe(1);
  });

  it('legacy createBatchOrders returns every order when all are accepted', async () => {
    const http = stubHttp();
    const items = await trading(http).createBatchOrders(orders.slice(0, 2));
    expect(items).toHaveLength(2);
  });
});
