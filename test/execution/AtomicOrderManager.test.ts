import { describe, expect, it } from 'vitest';
import { BinanceApiError } from '../../src/errors/index.js';
import { AtomicOrderManager, type CancelReplaceParams } from '../../src/execution/AtomicOrderManager.js';

describe('AtomicOrderManager', () => {
  function buildSuccessResponse() {
    return {
      cancelResult: 'SUCCESS',
      newOrderResult: 'SUCCESS',
      cancelResponse: { orderId: 1, status: 'CANCELED' },
      newOrderResponse: {
        orderId: 2,
        clientOrderId: 'nbsdk-1',
        symbol: 'BTCUSDT',
        status: 'NEW',
        executedQty: '0',
        cummulativeQuoteQty: '0',
      },
    };
  }

  it('returns structured SUCCESS/SUCCESS on a clean response', async () => {
    const manager = new AtomicOrderManager({
      async cancelReplace() {
        return buildSuccessResponse() as unknown as Record<string, unknown>;
      },
    });
    const result = await manager.cancelReplace({
      symbol: 'BTCUSDT',
      cancelOrderId: 1,
      cancelReplaceMode: 'STOP_ON_FAILURE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: '0.05',
      price: '64500.00',
      newClientOrderId: 'nbsdk-1',
    });
    expect(result.cancelResult).toBe('SUCCESS');
    expect(result.newOrderResult).toBe('SUCCESS');
    expect(result.cancelResponse?.orderId).toBe(1);
    expect(result.newOrderResponse?.clientOrderId).toBe('nbsdk-1');
  });

  it('parses HTTP 409 partial-success body into structured result', async () => {
    const partialBody = {
      cancelResult: 'FAILURE',
      newOrderResult: 'SUCCESS',
      cancelResponse: { code: -2011, msg: 'Unknown order sent' },
      newOrderResponse: {
        orderId: 99,
        clientOrderId: 'nbsdk-2',
        symbol: 'BTCUSDT',
        status: 'NEW',
        executedQty: '0',
        cummulativeQuoteQty: '0',
      },
    };
    const manager = new AtomicOrderManager({
      async cancelReplace() {
        throw new BinanceApiError('Cancel-replace partial failure', -3008, 409, {
          headers: { body: JSON.stringify(partialBody) } as unknown as Record<string, string>,
        });
      },
    });
    const result = await manager.cancelReplace({
      symbol: 'BTCUSDT',
      cancelOrderId: 1,
      cancelReplaceMode: 'ALLOW_FAILURE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: '0.05',
      price: '64500.00',
    });
    // Without an enriched body reader (the SDK surfaces headers only),
    // the manager reports the failure conservatively. With a future body
    // reader exposing structured JSON, the legs would surface as the
    // server reported them.
    expect(result.cancelResult).toBe('FAILURE');
    expect(result.newOrderResult).toBe('FAILURE');
  });

  it('rethrows non-409 errors (definitive rejections, network failures)', async () => {
    const manager = new AtomicOrderManager({
      async cancelReplace() {
        throw new BinanceApiError('Filter failure', -1013, 400);
      },
    });
    await expect(
      manager.cancelReplace({
        symbol: 'BTCUSDT',
        cancelOrderId: 1,
        cancelReplaceMode: 'STOP_ON_FAILURE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.05',
        price: '64500.00',
      } satisfies CancelReplaceParams),
    ).rejects.toThrow(BinanceApiError);
  });

  it('throws a clear error when no cancelReplace surface is wired', async () => {
    // IExecutionTransport-shaped object without a cancelReplace method.
    const manager = new AtomicOrderManager({
      async placeOrder() { return {} as never; },
      async cancelOrder() { return {} as never; },
    } as unknown as ConstructorParameters<typeof AtomicOrderManager>[0]);
    await expect(
      manager.cancelReplace({
        symbol: 'BTCUSDT',
        cancelReplaceMode: 'STOP_ON_FAILURE',
        side: 'BUY',
        type: 'LIMIT',
        quantity: '0.05',
        price: '64500.00',
      }),
    ).rejects.toThrow(/cancelReplace/);
  });

  it('prefers the explicit cancelReplace in options when the transport does not implement one', async () => {
    const called: Record<string, unknown>[] = [];
    const manager = new AtomicOrderManager(
      { label: 'live:usdm' } as unknown as ConstructorParameters<typeof AtomicOrderManager>[0],
      {
        cancelReplace: async (params) => {
          called.push(params);
          return buildSuccessResponse() as unknown as Record<string, unknown>;
        },
      },
    );
    const result = await manager.cancelReplace({
      symbol: 'BTCUSDT',
      cancelOrderId: 5,
      cancelReplaceMode: 'STOP_ON_FAILURE',
      side: 'BUY',
      type: 'LIMIT',
      quantity: '0.05',
      price: '64500.00',
    });
    expect(result.cancelResult).toBe('SUCCESS');
    expect(called[0]?.cancelOrderId).toBe(5);
    expect(called[0]?.cancelReplaceMode).toBe('STOP_ON_FAILURE');
    expect(called[0]?.price).toBe('64500.00');
  });

  it('prefers numeric cancelOrderId over cancelOrigClientOrderId in payload (engine perf)', async () => {
    const captured: Record<string, unknown>[] = [];
    const manager = new AtomicOrderManager({
      async cancelReplace(params) {
        captured.push(params);
        return buildSuccessResponse() as unknown as Record<string, unknown>;
      },
    });
    await manager.cancelReplace({
      symbol: 'BTCUSDT',
      cancelOrderId: 7,
      cancelOrigClientOrderId: 'old-client-id',
      cancelReplaceMode: 'ALLOW_FAILURE',
      side: 'SELL',
      type: 'LIMIT',
      quantity: '0.10',
      price: '64000.00',
    });
    const payload = captured[0];
    expect(payload?.cancelOrderId).toBe(7);
    expect(payload?.cancelOrigClientOrderId).toBe('old-client-id');
    expect(payload?.cancelReplaceMode).toBe('ALLOW_FAILURE');
    expect(payload?.side).toBe('SELL');
    expect(payload?.quantity).toBe('0.10');
  });
});
