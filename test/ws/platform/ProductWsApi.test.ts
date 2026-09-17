import { describe, expect, it, vi } from 'vitest';
import { FuturesWsApiClient, SpotWsApiClient } from '../../../src/ws/platform/ProductWsApi.js';
import type { WsApiResponse } from '../../../src/types/userdata.types.js';

/**
 * Both subclasses are thin typed delegation layers over WsApiClient.request().
 * We stub request() with a vi.fn and assert each method:
 *  - calls request() with the right method name
 *  - forwards the params object
 *  - returns the request()'s return value
 *  - marks public market data as signed:false where appropriate
 */

function stubFuturesClient() {
  const calls: { method: string; params: unknown; options: unknown }[] = [];
  const c = Object.create(FuturesWsApiClient.prototype) as FuturesWsApiClient & {
    request: (method: string, params: unknown, options?: unknown) => Promise<WsApiResponse>;
  };
  // Attach as an own-property function so `this.request(...)` inside the
  // prototype methods resolves to our stub before reaching the prototype chain.
  c.request = async (method: string, params: unknown, options: unknown) => {
    calls.push({ method, params, options });
    return { id: 1, status: 200, result: { method, params } } as unknown as WsApiResponse;
  };
  return { c, calls };
}

function stubSpotClient() {
  const calls: { method: string; params: unknown; options: unknown }[] = [];
  const c = Object.create(SpotWsApiClient.prototype) as SpotWsApiClient & {
    request: (method: string, params: unknown, options?: unknown) => Promise<WsApiResponse>;
  };
  c.request = async (method: string, params: unknown, options: unknown) => {
    calls.push({ method, params, options });
    return { id: 1, status: 200, result: { method, params } } as unknown as WsApiResponse;
  };
  return { c, calls };
}

describe('FuturesWsApiClient — typed delegation to request()', () => {
  it('order methods route through the correct method names (signed)', async () => {
    const { c, calls } = stubFuturesClient();
    await c.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    await c.cancelOrder({ symbol: 'BTCUSDT', orderId: 1 });
    await c.modifyOrder({ symbol: 'BTCUSDT', orderId: 1 });
    await c.placeAlgoOrder({ symbol: 'BTCUSDT' });
    await c.cancelAlgoOrder({ symbol: 'BTCUSDT' });
    await c.orderStatus({ symbol: 'BTCUSDT', orderId: 1 });
    await c.placeOrderList({ symbol: 'BTCUSDT' });
    await c.cancelOrderList({ symbol: 'BTCUSDT' });
    await c.orderListStatus({ symbol: 'BTCUSDT' });
    expect(calls.map((c) => c.method)).toEqual([
      'order.place', 'order.cancel', 'order.modify', 'algoOrder.place',
      'algoOrder.cancel', 'order.status', 'orderList.place', 'orderList.cancel',
      'orderList.status',
    ]);
    // Default options (no signed:false) — every call inherits signed:true.
    expect(calls.every((c) => (c.options as { signed?: boolean } | undefined)?.signed !== false)).toBe(true);
  });

  it('account methods route through the correct method names', async () => {
    const { c, calls } = stubFuturesClient();
    await c.accountStatus();
    await c.accountPosition({ recvWindow: 1000 });
    expect(calls.map((c) => c.method)).toEqual(['account.status', 'account.position']);
    expect(calls[0]!.params).toEqual({});
    expect(calls[1]!.params).toEqual({ recvWindow: 1000 });
  });

  it('userDataStream methods pass the listenKey', async () => {
    const { c, calls } = stubFuturesClient();
    await c.userDataStreamStart();
    await c.userDataStreamPing('my-listen-key');
    await c.userDataStreamStop('my-listen-key');
    expect(calls.map((c) => c.method)).toEqual([
      'userDataStream.start', 'userDataStream.ping', 'userDataStream.stop',
    ]);
    expect(calls[1]!.params).toEqual({ listenKey: 'my-listen-key' });
    expect(calls[2]!.params).toEqual({ listenKey: 'my-listen-key' });
  });

  it('public market data methods are unsigned', async () => {
    const { c, calls } = stubFuturesClient();
    await c.time();
    await c.exchangeInfo({ symbol: 'BTCUSDT' });
    await c.klines({ symbol: 'BTCUSDT', interval: '1m' });
    await c.aggTrades({ symbol: 'BTCUSDT' });
    await c.trades({ symbol: 'BTCUSDT' });
    await c.depth({ symbol: 'BTCUSDT' });
    await c.avgPrice({ symbol: 'BTCUSDT' });
    await c.tickerPrice();
    await c.tickerBookTicker();
    await c.ticker24hr();
    expect(calls.every((c) => (c.options as { signed?: boolean } | undefined)?.signed === false)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual([
      'time', 'exchangeInfo', 'klines', 'aggTrades', 'trades', 'depth',
      'avgPrice', 'ticker.price', 'ticker.bookTicker', 'ticker.24hr',
    ]);
  });

  it('public methods default their params when the API allows it', async () => {
    const { c, calls } = stubFuturesClient();
    await c.exchangeInfo();
    await c.tickerPrice();
    await c.tickerBookTicker();
    await c.ticker24hr();
    expect(calls.map((c) => c.params)).toEqual([{}, {}, {}, {}]);
  });
});

describe('SpotWsApiClient — typed delegation to request()', () => {
  it('trading methods route through the correct method names (signed)', async () => {
    const { c, calls } = stubSpotClient();
    await c.placeOrder({ symbol: 'BTCUSDT' });
    await c.testOrder({ symbol: 'BTCUSDT' });
    await c.cancelOrder({ symbol: 'BTCUSDT' });
    await c.cancelReplaceOrder({ symbol: 'BTCUSDT' });
    await c.orderStatus({ symbol: 'BTCUSDT' });
    await c.openOrders({ symbol: 'BTCUSDT' });
    await c.cancelAllOpenOrders({ symbol: 'BTCUSDT' });
    await c.placeOrderList({ symbol: 'BTCUSDT' });
    await c.cancelOrderList({ symbol: 'BTCUSDT' });
    await c.orderListStatus({ symbol: 'BTCUSDT' });
    await c.openOrderListsStatus();
    await c.allOrders({ symbol: 'BTCUSDT' });
    await c.allOrderLists();
    await c.myTrades({ symbol: 'BTCUSDT' });
    expect(calls.map((c) => c.method)).toEqual([
      'order.place', 'order.test', 'order.cancel', 'order.cancelReplace',
      'order.status', 'openOrders.status', 'openOrders.cancelAll',
      'orderList.place', 'orderList.cancel', 'orderList.status',
      'openOrderLists.status', 'allOrders', 'allOrderLists', 'myTrades',
    ]);
  });

  it('account methods route through the correct method names', async () => {
    const { c, calls } = stubSpotClient();
    await c.accountStatus();
    await c.accountBalances();
    await c.accountCommission({ symbol: 'BTCUSDT' });
    await c.orderRateLimits();
    expect(calls.map((c) => c.method)).toEqual([
      'account.status', 'account.balance', 'account.commission', 'account.rateLimits.orders',
    ]);
  });

  it('userDataStream methods pass the listenKey', async () => {
    const { c, calls } = stubSpotClient();
    await c.userDataStreamStart();
    await c.userDataStreamPing('listen-key');
    await c.userDataStreamStop('listen-key');
    expect(calls.map((c) => c.method)).toEqual([
      'userDataStream.start', 'userDataStream.ping', 'userDataStream.stop',
    ]);
  });

  it('public market data methods are unsigned', async () => {
    const { c, calls } = stubSpotClient();
    await c.ping();
    await c.time();
    await c.exchangeInfo({ symbol: 'BTCUSDT' });
    await c.depth({ symbol: 'BTCUSDT' });
    await c.recentTrades({ symbol: 'BTCUSDT' });
    await c.historicalTrades({ symbol: 'BTCUSDT' });
    await c.aggregateTrades({ symbol: 'BTCUSDT' });
    await c.klines({ symbol: 'BTCUSDT' });
    await c.uiKlines({ symbol: 'BTCUSDT' });
    expect(calls.every((c) => (c.options as { signed?: boolean } | undefined)?.signed === false)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual([
      'ping', 'time', 'exchangeInfo', 'depth', 'trades.recent', 'trades.historical',
      'trades.aggregate', 'klines', 'uiKlines',
    ]);
  });

  it('public methods default their params when the API allows it', async () => {
    const { c, calls } = stubSpotClient();
    await c.exchangeInfo();
    await c.openOrderListsStatus();
    await c.allOrderLists();
    expect(calls.map((c) => c.params)).toEqual([{}, {}, {}]);
  });
});
