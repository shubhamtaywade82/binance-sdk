import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { BinanceApiError, BinanceUnknownExecutionError } from '../../src/errors/index.js';
import {
  LiveBinanceTransport,
  PaperBrokerTransport,
} from '../../src/execution/Transports.js';
import type { OrderPlacementParams } from '../../src/execution/ITransport.js';
import type { FuturesTrading } from '../../src/resources/FuturesTrading.js';
import { PaperTradingEngine } from '../../src/paper/PaperTradingEngine.js';

// MSW server intercepting the public ticker/price REST call the paper engine
// uses to source mark prices. Each test installs the price it wants.
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function priceRoute(price: number) {
  return http.get('https://fapi.binance.com/fapi/v1/ticker/price', ({ request }) => {
    const symbol = new URL(request.url).searchParams.get('symbol');
    return HttpResponse.json({ symbol, price: String(price) });
  });
}

// ---------------------------------------------------------------------------
// LiveBinanceTransport
// ---------------------------------------------------------------------------

interface StubTradingState {
  calls: Array<{ method: 'createOrder' | 'cancelOrder'; payload: unknown }>;
  createOrderResponse: unknown;
  cancelOrderResponse: unknown;
  createOrderError: unknown;
  cancelOrderError: unknown;
}

function stubTrading(overrides: Partial<StubTradingState> = {}): StubTradingState & FuturesTrading {
  const state: StubTradingState = {
    calls: [],
    createOrderResponse: {
      orderId: 1,
      clientOrderId: 'nbsdk-1',
      symbol: 'BTCUSDT',
      status: 'NEW',
      executedQty: '0',
      cumQuote: '0',
      avgPrice: '0.0',
    },
    cancelOrderResponse: {
      orderId: 1,
      clientOrderId: 'nbsdk-1',
      symbol: 'BTCUSDT',
      status: 'CANCELED',
    },
    createOrderError: undefined,
    cancelOrderError: undefined,
    ...overrides,
  };
  const trading = {
    async createOrder(payload: unknown) {
      state.calls.push({ method: 'createOrder', payload });
      if (state.createOrderError) throw state.createOrderError;
      return state.createOrderResponse;
    },
    async cancelOrder(symbol: string, opts: unknown) {
      state.calls.push({ method: 'cancelOrder', payload: { symbol, opts } });
      if (state.cancelOrderError) throw state.cancelOrderError;
      return state.cancelOrderResponse;
    },
  };
  // Cast through unknown — the LiveBinanceTransport only uses createOrder +
  // cancelOrder; the rest of the FuturesTrading surface is never invoked.
  return Object.assign(trading, state) as unknown as StubTradingState & FuturesTrading;
}

describe('LiveBinanceTransport', () => {
  const params: OrderPlacementParams = {
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'LIMIT',
    quantity: '0.05',
    price: '64500.00',
    timeInForce: 'GTC',
    newClientOrderId: 'nbsdk-1',
  };

  it('routes through the trading resource and returns a normalized result', async () => {
    const stub = stubTrading();
    const transport = new LiveBinanceTransport(stub, { product: 'usdm' });
    const result = await transport.placeOrder(params);
    expect(result.orderId).toBe(1);
    expect(result.clientOrderId).toBe('nbsdk-1');
    expect(result.symbol).toBe('BTCUSDT');
    expect(result.status).toBe('NEW');
    expect(result.executedQty).toBe('0');
    expect(result.cummulativeQuoteQty).toBe('0');
    expect(result.avgPrice).toBe('0.0');
    expect(stub.calls[0]?.method).toBe('createOrder');
    const payload = stub.calls[0]?.payload as Record<string, unknown>;
    expect(payload.newOrderRespType).toBe('RESULT');
    expect(payload.symbol).toBe('BTCUSDT');
    expect(payload.side).toBe('BUY');
    expect(payload.type).toBe('LIMIT');
    expect(payload.quantity).toBe('0.05');
    expect(payload.price).toBe('64500.00');
  });

  it('wraps 5XX BinanceApiError as BinanceUnknownExecutionError (audit 5XX trap)', async () => {
    const stub = stubTrading({
      createOrderError: new BinanceApiError('Internal error', -1000, 502),
    });
    const transport = new LiveBinanceTransport(stub);
    await expect(transport.placeOrder(params)).rejects.toBeInstanceOf(BinanceUnknownExecutionError);
    try {
      await transport.placeOrder(params);
    } catch (err) {
      expect(err).toBeInstanceOf(BinanceUnknownExecutionError);
      const unknown = err as BinanceUnknownExecutionError;
      expect(unknown.symbol).toBe('BTCUSDT');
      expect(unknown.clientOrderId).toBe('nbsdk-1');
    }
  });

  it('does not wrap -1013 / -2013 / -2010 (definitive rejections)', async () => {
    const stub = stubTrading({
      createOrderError: new BinanceApiError('Filter failure', -1013, 400),
    });
    const transport = new LiveBinanceTransport(stub);
    await expect(transport.placeOrder(params)).rejects.toBeInstanceOf(BinanceApiError);
    await expect(transport.placeOrder(params)).rejects.not.toBeInstanceOf(BinanceUnknownExecutionError);
  });

  it('reconciles -2011 / -2013 on cancel into a CANCELED result', async () => {
    const stub = stubTrading({
      cancelOrderError: new BinanceApiError('Unknown order sent', -2011, 400),
    });
    const transport = new LiveBinanceTransport(stub);
    const result = await transport.cancelOrder('BTCUSDT', 1);
    expect(result.status).toBe('CANCELED');
    expect(result.orderId).toBe(1);
    expect(result.symbol).toBe('BTCUSDT');
  });

  it('re-throws other errors from cancelOrder unchanged', async () => {
    const stub = stubTrading({
      cancelOrderError: new BinanceApiError('Invalid symbol', -1121, 400),
    });
    const transport = new LiveBinanceTransport(stub);
    await expect(transport.cancelOrder('BADSYMBOL', 1)).rejects.toThrow(BinanceApiError);
  });

  it('label defaults to live:<product> and is customizable', () => {
    const stub = stubTrading();
    expect(new LiveBinanceTransport(stub).label).toBe('live:usdm');
    expect(new LiveBinanceTransport(stub, { product: 'spot' }).label).toBe('live:spot');
    expect(new LiveBinanceTransport(stub, { label: 'my-trader' }).label).toBe('my-trader');
  });
});

// ---------------------------------------------------------------------------
// PaperBrokerTransport
// ---------------------------------------------------------------------------

function paperEngine(): PaperTradingEngine {
  // Reuse the SDK's own paper engine; default balance and instant-fill model.
  return new PaperTradingEngine({ initialBalance: 10000 });
}

describe('PaperBrokerTransport', () => {
  it('places a market order and returns the same shape the live transport returns', async () => {
    server.use(priceRoute(100));
    const engine = paperEngine();
    const transport = new PaperBrokerTransport(engine);
    const result = await transport.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: '1.0',
      newClientOrderId: 'paper-1',
    });
    expect(result.clientOrderId).toBe('paper-1');
    expect(result.symbol).toBe('BTCUSDT');
    expect(result.status).toBe('FILLED');
    expect(result.executedQty).toBe('1');
    expect(result.cummulativeQuoteQty).toBe('100');
    expect(result.avgPrice).toBe('100');
  });

  it('requires newClientOrderId (reconciliation key)', async () => {
    server.use(priceRoute(100));
    const engine = paperEngine();
    const transport = new PaperBrokerTransport(engine);
    await expect(
      transport.placeOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: '1.0',
      } as OrderPlacementParams),
    ).rejects.toThrow(BinanceApiError);
  });

  it('cancelOrder surfaces -2011 (simulator fills instantly, no resting order)', async () => {
    server.use(priceRoute(100));
    const engine = paperEngine();
    const transport = new PaperBrokerTransport(engine);
    await expect(transport.cancelOrder('BTCUSDT', 1)).rejects.toThrow(BinanceApiError);
  });

  it('label is paper:broker', () => {
    expect(new PaperBrokerTransport(paperEngine()).label).toBe('paper:broker');
  });
});
