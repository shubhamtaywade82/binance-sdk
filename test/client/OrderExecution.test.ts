import { describe, expect, it, vi } from 'vitest';
import { OrderExecution, type OrderTradingResource } from '../../src/client/OrderExecution.js';
import {
  AmbiguousExecutionError,
  BinanceApiError,
  NetworkError,
  OrderUnconfirmedError,
  RateLimitError,
} from '../../src/errors/index.js';

interface TestOrder {
  orderId: number;
  symbol: string;
  status: string;
  clientOrderId: string;
}

interface TestParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  quantity?: number;
  newClientOrderId?: string;
}

function apiError(code: number, status: number, message = 'error'): BinanceApiError {
  return new BinanceApiError(message, code, status, { endpoint: '/fapi/v1/order', method: 'POST' });
}

function makeTrading(overrides: Partial<OrderTradingResource<TestParams, TestOrder>> = {
}): OrderTradingResource<TestParams, TestOrder> & {
  createOrder: ReturnType<typeof vi.fn>;
  getOrder: ReturnType<typeof vi.fn>;
} {
  const createOrder = vi.fn(async (params: TestParams): Promise<TestOrder> => ({
    orderId: 1,
    symbol: params.symbol,
    status: 'NEW',
    clientOrderId: params.newClientOrderId ?? 'generated',
  }));
  const getOrder = vi.fn(async (symbol: string, _options?: { origClientOrderId?: string }): Promise<TestOrder> => ({
    orderId: 99,
    symbol,
    status: 'FILLED',
    clientOrderId: 'reconciled',
  }));
  return { createOrder, getOrder, ...overrides } as never;
}

describe('OrderExecution', () => {
  it('creates an order and stamps a generated exchange-safe clientOrderId', async () => {
    const trading = makeTrading();
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    const result = await exec.submitOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });

    expect(result.outcome).toBe('created');
    expect(result.clientOrderId).toMatch(/^sdk-[a-z0-9]+-[a-z0-9]+$/);
    expect(result.clientOrderId.length).toBeLessThanOrEqual(36);
    expect(trading.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ newClientOrderId: result.clientOrderId }),
    );
  });

  it('respects a caller-provided newClientOrderId', async () => {
    const trading = makeTrading();
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    const result = await exec.submitOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'LIMIT',
      newClientOrderId: 'strategy-abc-123',
    });

    expect(result.clientOrderId).toBe('strategy-abc-123');
  });

  it('on an ambiguous failure, reconciles by clientOrderId and returns the EXISTING order (no duplicate)', async () => {
    const existingOrder: TestOrder = {
      orderId: 42,
      symbol: 'BTCUSDT',
      status: 'FILLED',
      clientOrderId: 'abc-123',
    };
    const trading = makeTrading();
    trading.createOrder.mockRejectedValueOnce(
      new AmbiguousExecutionError('connection died', 'POST', '/fapi/v1/order', {
        newClientOrderId: 'abc-123',
      }),
    );
    trading.getOrder.mockResolvedValueOnce(existingOrder);
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    const result = await exec.submitOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      newClientOrderId: 'abc-123',
    });

    expect(result.outcome).toBe('reconciled-existing');
    expect(result.order.orderId).toBe(42);
    // createOrder was attempted exactly once — never duplicated.
    expect(trading.createOrder).toHaveBeenCalledTimes(1);
    expect(trading.getOrder).toHaveBeenCalledWith('BTCUSDT', { origClientOrderId: 'abc-123' });
  });

  it('retries once when reconciliation proves the order never landed', async () => {
    const trading = makeTrading();
    trading.createOrder
      .mockRejectedValueOnce(new NetworkError('socket hang up'))
      .mockResolvedValueOnce({ orderId: 7, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'x' });
    trading.getOrder.mockRejectedValueOnce(apiError(-2013, 400, 'Order does not exist'));
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    const result = await exec.submitOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET' });

    expect(result.outcome).toBe('retried');
    expect(result.order.orderId).toBe(7);
    expect(trading.createOrder).toHaveBeenCalledTimes(2);
    expect(trading.getOrder).toHaveBeenCalledTimes(1);
  });

  it('throws OrderUnconfirmedError when the reconciliation query itself fails ambiguously', async () => {
    const trading = makeTrading();
    trading.createOrder.mockRejectedValue(new AmbiguousExecutionError('timeout', 'POST', '/fapi/v1/order', {}));
    trading.getOrder.mockRejectedValue(new NetworkError('query failed too'));
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    const err = await exec
      .submitOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OrderUnconfirmedError);
    expect((err as OrderUnconfirmedError).clientOrderId).toBeDefined();
    expect((err as OrderUnconfirmedError).message).toContain('reconcile');
  });

  it('rethrows definitive exchange rejections (4xx) without retrying or reconciling', async () => {
    const trading = makeTrading();
    trading.createOrder.mockRejectedValue(apiError(-2010, 400, 'NEW_ORDER_REJECTED'));
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    await expect(
      exec.submitOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', quantity: 1 }),
    ).rejects.toThrow(/NEW_ORDER_REJECTED/);
    expect(trading.createOrder).toHaveBeenCalledTimes(1);
    expect(trading.getOrder).not.toHaveBeenCalled();
  });

  it('retries after a 429 because rate-limit rejections are definitive (order not placed)', async () => {
    const trading = makeTrading();
    trading.createOrder
      .mockRejectedValueOnce(new RateLimitError('too many requests', -1003, 429, 0, {}))
      .mockResolvedValueOnce({ orderId: 3, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'y' });
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    const result = await exec.submitOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET' });
    expect(result.outcome).toBe('retried');
    expect(trading.createOrder).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent submissions with the same clientOrderId', async () => {
    const trading = makeTrading();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    trading.createOrder.mockImplementation(async (params: TestParams) => {
      await gate;
      return { orderId: 5, symbol: params.symbol, status: 'NEW', clientOrderId: params.newClientOrderId ?? '' };
    });
    const exec = new OrderExecution<TestParams, TestOrder>({ trading });

    const first = exec.submitOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', newClientOrderId: 'same-id' });
    const second = exec.submitOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', newClientOrderId: 'same-id' });
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a.order.orderId).toBe(b.order.orderId);
    expect(a.clientOrderId).toBe(b.clientOrderId);
    expect(trading.createOrder).toHaveBeenCalledTimes(1);
  });

  it('fires the onOrderAccepted hook exactly once per accepted order', async () => {
    const trading = makeTrading();
    trading.createOrder
      .mockRejectedValueOnce(new NetworkError('flaky'))
      .mockResolvedValueOnce({ orderId: 9, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'z' });
    trading.getOrder.mockRejectedValueOnce(apiError(-2013, 400, 'Order does not exist'));
    const onOrderAccepted = vi.fn();
    const exec = new OrderExecution<TestParams, TestOrder>({ trading, onOrderAccepted });

    await exec.submitOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET' });
    expect(onOrderAccepted).toHaveBeenCalledTimes(1);
    expect(onOrderAccepted).toHaveBeenCalledWith(expect.anything(), 'retried');
  });
});
