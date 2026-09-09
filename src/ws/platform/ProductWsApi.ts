import { WsApiClient, type WsApiClientOptions, type WsRequestOptions } from './WsApiClient.js';
import type { WsApiResponse } from '../../types/userdata.types.js';

/**
 * Persistent WS API client for the USDⓈ-M futures endpoint
 * (`wss://ws-fapi.binance.com/ws-fapi/v1`).
 *
 * Method surface mirrors v2's per-request {@link WsApi} one-to-one, so
 * migrating is a constructor swap — but every call now rides one persistent
 * multiplexed socket instead of opening its own.
 */
export class FuturesWsApiClient extends WsApiClient {
  placeOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.place', params);
  }

  cancelOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.cancel', params);
  }

  modifyOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.modify', params);
  }

  placeAlgoOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('algoOrder.place', params);
  }

  cancelAlgoOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('algoOrder.cancel', params);
  }

  orderStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.status', params);
  }

  placeOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.place', params);
  }

  cancelOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.cancel', params);
  }

  orderListStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.status', params);
  }

  accountStatus(): Promise<WsApiResponse> {
    return this.request('account.status', {});
  }

  accountPosition(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('account.position', params);
  }

  userDataStreamStart(): Promise<WsApiResponse> {
    return this.request('userDataStream.start', {});
  }

  userDataStreamPing(listenKey: string): Promise<WsApiResponse> {
    return this.request('userDataStream.ping', { listenKey });
  }

  userDataStreamStop(listenKey: string): Promise<WsApiResponse> {
    return this.request('userDataStream.stop', { listenKey });
  }

  // ---- Public market data (no signature) ----

  time(): Promise<WsApiResponse> {
    return this.request('time', {}, { signed: false });
  }

  exchangeInfo(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('exchangeInfo', params, { signed: false });
  }

  klines(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('klines', params, { signed: false });
  }

  aggTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('aggTrades', params, { signed: false });
  }

  trades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades', params, { signed: false });
  }

  depth(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('depth', params, { signed: false });
  }

  avgPrice(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('avgPrice', params, { signed: false });
  }

  tickerPrice(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.price', params, { signed: false });
  }

  tickerBookTicker(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.bookTicker', params, { signed: false });
  }

  ticker24hr(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('ticker.24hr', params, { signed: false });
  }
}

/**
 * Persistent WS API client for the spot endpoint
 * (`wss://ws-api.binance.com:443/ws-api/v3`). Same persistent-socket,
 * multiplexed semantics; spot method names mirror v2's {@link SpotWsApi}.
 */
export class SpotWsApiClient extends WsApiClient {
  // ---- Trading ----

  placeOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.place', params);
  }

  testOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.test', params);
  }

  cancelOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.cancel', params);
  }

  cancelReplaceOrder(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.cancelReplace', params);
  }

  orderStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('order.status', params);
  }

  openOrders(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('openOrders.status', params);
  }

  cancelAllOpenOrders(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('openOrders.cancelAll', params);
  }

  placeOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.place', params);
  }

  cancelOrderList(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.cancel', params);
  }

  orderListStatus(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('orderList.status', params);
  }

  openOrderListsStatus(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('openOrderLists.status', params);
  }

  allOrders(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('allOrders', params);
  }

  allOrderLists(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('allOrderLists', params);
  }

  myTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('myTrades', params);
  }

  // ---- Account ----

  accountStatus(): Promise<WsApiResponse> {
    return this.request('account.status', {});
  }

  accountBalances(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('account.balance', params);
  }

  accountCommission(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('account.commission', params);
  }

  orderRateLimits(): Promise<WsApiResponse> {
    return this.request('account.rateLimits.orders', {});
  }

  // ---- User data streams ----

  userDataStreamStart(): Promise<WsApiResponse> {
    return this.request('userDataStream.start', {});
  }

  userDataStreamPing(listenKey: string): Promise<WsApiResponse> {
    return this.request('userDataStream.ping', { listenKey });
  }

  userDataStreamStop(listenKey: string): Promise<WsApiResponse> {
    return this.request('userDataStream.stop', { listenKey });
  }

  // ---- Public market data (no signature) ----

  ping(): Promise<WsApiResponse> {
    return this.request('ping', {}, { signed: false });
  }

  time(): Promise<WsApiResponse> {
    return this.request('time', {}, { signed: false });
  }

  exchangeInfo(params: Record<string, unknown> = {}): Promise<WsApiResponse> {
    return this.request('exchangeInfo', params, { signed: false });
  }

  depth(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('depth', params, { signed: false });
  }

  recentTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades.recent', params, { signed: false });
  }

  historicalTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades.historical', params, { signed: false });
  }

  aggregateTrades(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('trades.aggregate', params, { signed: false });
  }

  klines(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('klines', params, { signed: false });
  }

  uiKlines(params: Record<string, unknown>): Promise<WsApiResponse> {
    return this.request('uiKlines', params, { signed: false });
  }
}

export type { WsApiClientOptions, WsRequestOptions };
