import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { OptionsAccount } from '../../src/resources/OptionsAccount.js';
import { OptionsBlockTrading } from '../../src/resources/OptionsBlockTrading.js';
import { OptionsMarket } from '../../src/resources/OptionsMarket.js';
import { OptionsMmp } from '../../src/resources/OptionsMmp.js';
import { OptionsTrading } from '../../src/resources/OptionsTrading.js';
import { OptionsUserDataStream } from '../../src/resources/OptionsUserDataStream.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://eapi.binance.com';
function http_(host = 'eapi'): HttpClient {
  if (host !== 'eapi') throw new Error('Options test only supports eapi host');
  return new HttpClient({ baseURL: BASE, apiKey: 'k', apiSecret: 's' });
}

describe('OptionsMarket', () => {
  it('fetches server time', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/time`, () => HttpResponse.json({ serverTime: 1_700_000_000, timezone: 'UTC' })),
    );
    const t = await new OptionsMarket(http_()).time();
    expect(t.serverTime).toBe(1_700_000_000);
  });

  it('parses exchangeInfo with optionSymbols', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/exchangeInfo`, () =>
        HttpResponse.json({
          timezone: 'UTC',
          serverTime: 1,
          optionSymbols: [
            {
              symbol: 'BTC-240329-50000-C',
              underlying: 'BTCUSDT',
              baseAsset: 'BTC',
              quoteAsset: 'USDT',
              strikePrice: '50000',
              expiryDate: 1_700_000_000,
            },
          ],
        }),
      ),
    );
    const info = await new OptionsMarket(http_()).exchangeInfo();
    expect(info.optionSymbols[0]?.symbol).toBe('BTC-240329-50000-C');
    expect(info.optionSymbols[0]?.strikePrice).toBe(50000);
  });

  it('parses depth as bids/asks tuples', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/depth`, () =>
        HttpResponse.json({
          symbol: 'BTC-240329-50000-C',
          bids: [['5000', '1.5']],
          asks: [['5010', '0.5']],
          lastUpdateId: 12345,
        }),
      ),
    );
    const depth = await new OptionsMarket(http_()).depth('BTC-240329-50000-C');
    expect(depth.bids[0]).toEqual(['5000', '1.5']);
    expect(depth.asks[0]).toEqual(['5010', '0.5']);
  });

  it('parses trades with .transform() decimals', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/trades`, () =>
        HttpResponse.json([
          { id: 1, symbol: 'BTC-240329-50000-C', price: '5000', qty: '0.5', side: 'BUY', timestamp: 1 },
        ]),
      ),
    );
    const trades = await new OptionsMarket(http_()).trades('BTC-240329-50000-C');
    expect(trades[0]?.price).toBe(5000);
    expect(trades[0]?.qty).toBe(0.5);
  });

  it('parses openInterest', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/openInterest`, () =>
        HttpResponse.json([{ symbol: 'BTC-240329-50000-C', openInterest: '1.5', time: 1 }])),
    );
    const oi = await new OptionsMarket(http_()).openInterest('BTC-240329-50000-C');
    expect(oi[0]?.openInterest).toBe(1.5);
  });
});

describe('OptionsAccount', () => {
  it('parses marginAccount with assets array', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/marginAccount`, () =>
        HttpResponse.json({
          underlying: 'BTC',
          marginAsset: [{ asset: 'BTC', marginBalance: '10', availableBalance: '5' }],
          time: 1,
        })),
    );
    const acc = await new OptionsAccount(http_()).marginAccount('BTC');
    expect(acc.underlying).toBe('BTC');
    expect(acc.marginAsset?.[0]?.marginBalance).toBe(10);
  });

  it('parses positions', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/position`, () =>
        HttpResponse.json([
          {
            symbol: 'BTC-240329-50000-C',
            qty: '1',
            baseValue: '5000',
            quoteValue: '5000',
            markPrice: '5000',
            positionCost: '5000',
            side: 'LONG',
          },
        ]),
      ),
    );
    const pos = await new OptionsAccount(http_()).position('BTC-240329-50000-C');
    expect(pos[0]?.qty).toBe(1);
  });

  it('parses commission', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/commission`, () =>
        HttpResponse.json({ symbol: 'BTC-240329-50000-C', makerCommissionRate: '0.0001', takerCommissionRate: '0.0002' })),
    );
    const c = await new OptionsAccount(http_()).commission('BTC-240329-50000-C');
    expect(c.makerCommissionRate).toBe(0.0001);
  });
});

describe('OptionsTrading', () => {
  it('places an order and parses response', async () => {
    server.use(
      http.post(`${BASE}/eapi/v1/order`, () =>
        HttpResponse.json({
          orderId: 'abc',
          symbol: 'BTC-240329-50000-C',
          side: 'BUY',
          status: 'NEW',
          price: '5000',
          qty: '1',
        })),
    );
    const order = await new OptionsTrading(http_()).placeOrder({ symbol: 'BTC-240329-50000-C', side: 'BUY', type: 'LIMIT' });
    expect(order.orderId).toBe('abc');
    expect(order.status).toBe('NEW');
    expect(order.price).toBe(5000);
  });

  it('lists open orders', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/openOrders`, () =>
        HttpResponse.json([
          { orderId: '1', symbol: 'BTC-240329-50000-C', side: 'BUY', status: 'NEW', price: '5000', avgPrice: '0', origQty: '1', executedQty: '0', time: 1, updateTime: 1 },
        ]),
      ),
    );
    const orders = await new OptionsTrading(http_()).openOrders('BTC-240329-50000-C');
    expect(orders.length).toBe(1);
    expect(orders[0]?.orderId).toBe('1');
  });

  it('parses countdownCancelAll response', async () => {
    server.use(
      http.post(`${BASE}/eapi/v1/countdownCancelAll`, () =>
        HttpResponse.json({ symbol: 'BTC-240329-50000-C', countdownTime: 1000 })),
    );
    const r = await new OptionsTrading(http_()).countdownCancelAll('BTC-240329-50000-C', 1000);
    expect(r.countdownTime).toBe(1000);
  });
});

describe('OptionsMmp', () => {
  it('parses MMP profile', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/mmp`, () =>
        HttpResponse.json({
          uid: 'u1',
          underlying: 'BTC',
          windowTimeInMilliseconds: 1000,
          frozenTimeInMilliseconds: 0,
          qtyLimit: 100,
          deltaLimit: 10,
          triggerLimit: 5,
        })),
    );
    const mmp = await new OptionsMmp(http_()).getMmp('u1');
    expect(mmp.uid).toBe('u1');
    expect(mmp.qtyLimit).toBe(100);
  });
});

describe('OptionsBlockTrading', () => {
  it('parses public block-trades tape', async () => {
    server.use(
      http.get(`${BASE}/eapi/v1/blockTrades`, () =>
        HttpResponse.json([
          { blockTradeId: 'b1', symbol: 'BTC-240329-50000-C', price: '5000', qty: '5', side: 'BUY', time: 1 },
        ]),
      ),
    );
    const trades = await new OptionsBlockTrading(http_()).trades({});
    expect(trades[0]?.blockTradeId).toBe('b1');
    expect(trades[0]?.price).toBe(5000);
  });
});

describe('OptionsUserDataStream', () => {
  it('creates a listenKey', async () => {
    server.use(
      http.post(`${BASE}/eapi/v1/listenKey`, () => HttpResponse.json({ listenKey: 'options-key' })),
    );
    const { listenKey } = await new OptionsUserDataStream(http_()).createListenKey();
    expect(listenKey).toBe('options-key');
  });
});
