import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const EXCHANGE_INFO = {
  timezone: 'UTC',
  serverTime: 1,
  symbols: [
    {
      symbol: 'BTCUSDT',
      status: 'TRADING',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      pricePrecision: 2,
      quantityPrecision: 3,
      filters: [
        { filterType: 'PRICE_FILTER', minPrice: '556.80', maxPrice: '4529764', tickSize: '0.10' },
        { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.001' },
        { filterType: 'MARKET_LOT_SIZE', minQty: '0.001', maxQty: '120', stepSize: '0.001' },
        { filterType: 'MIN_NOTIONAL', notional: '100' },
      ],
    },
  ],
};

function exchangeInfoRoute() {
  return http.get('https://fapi.binance.com/fapi/v1/exchangeInfo', () => HttpResponse.json(EXCHANGE_INFO));
}

function markPriceRoute(markPrice = '60000') {
  return http.get('https://fapi.binance.com/fapi/v1/premiumIndex', () =>
    HttpResponse.json({
      symbol: 'BTCUSDT', markPrice, indexPrice: markPrice, estimatedSettlePrice: markPrice,
      lastFundingRate: '0.0001', nextFundingTime: 1, interestRate: '0.0001', time: 1,
    }),
  );
}

function client(): BinanceClient {
  return new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
}

function position(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'BTCUSDT', positionAmt: '0.5', entryPrice: '60000', markPrice: '61000',
    unRealizedProfit: '500', liquidationPrice: '0', leverage: '10', marginType: 'isolated',
    positionSide: 'BOTH', notional: '30500', updateTime: 1, ...overrides,
  };
}

describe('FuturesOps.symbolRules', () => {
  it('flattens filters and caches the exchangeInfo lookup', async () => {
    let calls = 0;
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/exchangeInfo', () => {
        calls += 1;
        return HttpResponse.json(EXCHANGE_INFO);
      }),
    );

    const ops = client().futures.ops;
    const first = await ops.symbolRules('BTCUSDT');
    const second = await ops.symbolRules('btcusdt');

    expect(first.tickSize).toBe(0.1);
    expect(first.minNotional).toBe(100);
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });
});

describe('FuturesOps.quantize', () => {
  it('returns exchange-ready strings on tick and step boundaries', async () => {
    server.use(exchangeInfoRoute());

    const res = await client().futures.ops.quantize('BTCUSDT', { price: 60000.04, quantity: 0.0037 });
    expect(res.price).toBe('60000.0');
    expect(res.quantity).toBe('0.003');
  });
});

describe('FuturesOps.sizePosition', () => {
  it('converts a risk budget into a step-aligned quantity', async () => {
    server.use(exchangeInfoRoute(), markPriceRoute());

    // Risk 100 USDT over a 1000-point stop => 0.1 BTC.
    const sizing = await client().futures.ops.sizePosition({
      symbol: 'BTCUSDT', side: 'BUY', stopPrice: 59000, riskAmount: 100, leverage: 10,
    });

    expect(sizing.ok).toBe(true);
    expect(sizing.entryPrice).toBe(60000);
    expect(sizing.riskPerUnit).toBe(1000);
    expect(sizing.quantity).toBe(0.1);
    expect(sizing.quantityStr).toBe('0.100');
    expect(sizing.notional).toBeCloseTo(6000);
    expect(sizing.requiredMargin).toBeCloseTo(600);
    expect(sizing.reasons).toEqual([]);
  });

  it('flags a stop on the wrong side of entry instead of sizing it', async () => {
    server.use(exchangeInfoRoute(), markPriceRoute());

    const sizing = await client().futures.ops.sizePosition({
      symbol: 'BTCUSDT', side: 'BUY', stopPrice: 61000, riskAmount: 100,
    });

    expect(sizing.ok).toBe(false);
    expect(sizing.reasons.join(' ')).toMatch(/wrong side of entry/);
  });

  it('reports a min-notional breach rather than silently increasing risk', async () => {
    server.use(exchangeInfoRoute(), markPriceRoute());

    // 1 USDT over a 1000-point stop => 0.001 BTC => 60 USDT notional, under the 100 minimum.
    const sizing = await client().futures.ops.sizePosition({
      symbol: 'BTCUSDT', side: 'BUY', stopPrice: 59000, riskAmount: 1,
    });

    expect(sizing.ok).toBe(false);
    expect(sizing.quantity).toBe(0.001);
    expect(sizing.reasons.join(' ')).toMatch(/below the 100 minimum/);
  });

  it('derives the risk budget from available balance when riskPct is used', async () => {
    server.use(
      exchangeInfoRoute(),
      markPriceRoute(),
      http.get('https://fapi.binance.com/fapi/v3/balance', () =>
        HttpResponse.json([
          {
            accountAlias: 'a', asset: 'USDT', balance: '10000', crossWalletBalance: '10000',
            crossUnPnl: '0', availableBalance: '10000', maxWithdrawAmount: '10000',
            marginAvailable: true, updateTime: 1,
          },
        ]),
      ),
    );

    // 1% of 10000 = 100 USDT risk over a 1000-point stop => 0.1 BTC.
    const sizing = await client().futures.ops.sizePosition({
      symbol: 'BTCUSDT', side: 'BUY', stopPrice: 59000, riskPct: 1,
    });

    expect(sizing.availableBalance).toBe(10000);
    expect(sizing.riskAmount).toBe(100);
    expect(sizing.quantity).toBe(0.1);
  });

  it('rejects being given both riskAmount and riskPct', async () => {
    server.use(exchangeInfoRoute(), markPriceRoute());

    await expect(
      client().futures.ops.sizePosition({
        symbol: 'BTCUSDT', side: 'BUY', stopPrice: 59000, riskAmount: 100, riskPct: 1,
      }),
    ).rejects.toThrow(/exactly one/);
  });
});

describe('FuturesOps.closePosition', () => {
  it('uses reduceOnly and the inverted side in one-way mode', async () => {
    let sent = '';
    server.use(
      exchangeInfoRoute(),
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () => HttpResponse.json([position()])),
      http.post('https://fapi.binance.com/fapi/v1/order', ({ request }) => {
        sent = request.url;
        return HttpResponse.json({
          orderId: 1, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'c', price: '0', avgPrice: '0',
          origQty: '0.5', executedQty: '0', cumQuote: '0', type: 'MARKET', reduceOnly: true,
          side: 'SELL', positionSide: 'BOTH', time: 1, updateTime: 1,
        });
      }),
    );

    const res = await client().futures.ops.closePosition({ symbol: 'BTCUSDT' });

    expect(res.closed).toBe(true);
    expect(sent).toContain('side=SELL');
    expect(sent).toContain('reduceOnly=true');
    expect(sent).toContain('quantity=0.500');
    expect(sent).not.toContain('positionSide');
  });

  it('uses positionSide instead of reduceOnly in hedge mode', async () => {
    let sent = '';
    server.use(
      exchangeInfoRoute(),
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () =>
        HttpResponse.json([position({ positionSide: 'LONG' })]),
      ),
      http.post('https://fapi.binance.com/fapi/v1/order', ({ request }) => {
        sent = request.url;
        return HttpResponse.json({
          orderId: 1, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'c', price: '0', avgPrice: '0',
          origQty: '0.5', executedQty: '0', cumQuote: '0', type: 'MARKET', reduceOnly: false,
          side: 'SELL', positionSide: 'LONG', time: 1, updateTime: 1,
        });
      }),
    );

    const res = await client().futures.ops.closePosition({ symbol: 'BTCUSDT' });

    expect(res.closed).toBe(true);
    expect(sent).toContain('positionSide=LONG');
    expect(sent).not.toContain('reduceOnly');
  });

  it('closes a portion and previews without sending when dryRun is set', async () => {
    server.use(
      exchangeInfoRoute(),
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () => HttpResponse.json([position()])),
    );

    const res = await client().futures.ops.closePosition({ symbol: 'BTCUSDT', portion: 0.5, dryRun: true });

    expect(res.closed).toBe(false);
    expect(res.reason).toBe('dryRun');
    expect(res.request).toMatchObject({ side: 'SELL', quantity: '0.250', reduceOnly: true });
  });

  it('reports when there is nothing open', async () => {
    server.use(
      exchangeInfoRoute(),
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () =>
        HttpResponse.json([position({ positionAmt: '0' })]),
      ),
    );

    const res = await client().futures.ops.closePosition({ symbol: 'BTCUSDT' });
    expect(res.closed).toBe(false);
    expect(res.reason).toMatch(/no open position/);
  });

  it('refuses to guess when hedge mode has both sides open', async () => {
    server.use(
      exchangeInfoRoute(),
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () =>
        HttpResponse.json([
          position({ positionSide: 'LONG', positionAmt: '0.5' }),
          position({ positionSide: 'SHORT', positionAmt: '-0.3' }),
        ]),
      ),
    );

    const res = await client().futures.ops.closePosition({ symbol: 'BTCUSDT' });
    expect(res.closed).toBe(false);
    expect(res.reason).toMatch(/pass positionSide/);
  });
});

describe('FuturesOps.marketSnapshot', () => {
  it('fans out and degrades a single failing feed to an error field', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/ticker/24hr', () =>
        HttpResponse.json({
          symbol: 'BTCUSDT', priceChange: '1', priceChangePercent: '1', weightedAvgPrice: '60000',
          lastPrice: '60000', lastQty: '1', openPrice: '59000', highPrice: '61000', lowPrice: '58000',
          volume: '1000', quoteVolume: '60000000', openTime: 1, closeTime: 2, firstId: 1, lastId: 2, count: 2,
        }),
      ),
      markPriceRoute(),
      http.get('https://fapi.binance.com/fapi/v1/openInterest', () =>
        HttpResponse.json({ symbol: 'BTCUSDT', openInterest: '5000', time: 1 }),
      ),
      http.get('https://fapi.binance.com/futures/data/globalLongShortAccountRatio', () =>
        HttpResponse.json({ code: -1121, msg: 'Invalid symbol.' }, { status: 400 }),
      ),
    );

    const snap = await client().futures.ops.marketSnapshot('BTCUSDT');

    expect((snap.ticker24hr as { lastPrice: number }).lastPrice).toBe(60000);
    expect((snap.markPrice as { markPrice: number }).markPrice).toBe(60000);
    expect((snap.openInterest as { openInterest: number }).openInterest).toBe(5000);
    expect(snap.longShortAccountRatio).toHaveProperty('error');
  });
});

describe('FuturesOps.accountOverview', () => {
  it('filters out zero balances and flat positions and totals the rest', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v3/balance', () =>
        HttpResponse.json([
          {
            accountAlias: 'a', asset: 'USDT', balance: '10000', crossWalletBalance: '10000',
            crossUnPnl: '0', availableBalance: '9000', maxWithdrawAmount: '9000',
            marginAvailable: true, updateTime: 1,
          },
          {
            accountAlias: 'a', asset: 'BNB', balance: '0', crossWalletBalance: '0',
            crossUnPnl: '0', availableBalance: '0', maxWithdrawAmount: '0',
            marginAvailable: true, updateTime: 1,
          },
        ]),
      ),
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () =>
        HttpResponse.json([position(), position({ symbol: 'ETHUSDT', positionAmt: '0' })]),
      ),
      http.get('https://fapi.binance.com/fapi/v1/openOrders', () => HttpResponse.json([])),
    );

    const overview = await client().futures.ops.accountOverview();

    expect(overview.balances).toHaveLength(1);
    expect(overview.positions).toHaveLength(1);
    expect(overview.totals).toMatchObject({ openPositionCount: 1, unrealizedPnl: 500, grossNotional: 30500 });
  });
});

describe('FuturesOps.placeBracketOrder', () => {
  it('quantizes every leg and reports partial protection failure without unwinding', async () => {
    const sent: string[] = [];
    server.use(
      exchangeInfoRoute(),
      http.post('https://fapi.binance.com/fapi/v1/order', ({ request }) => {
        sent.push(request.url);
        // Let the entry and the stop through, fail the take-profit.
        if (request.url.includes('TAKE_PROFIT_MARKET')) {
          return HttpResponse.json({ code: -2021, msg: 'Order would immediately trigger.' }, { status: 400 });
        }
        return HttpResponse.json({
          orderId: sent.length, symbol: 'BTCUSDT', status: 'NEW', clientOrderId: 'c', price: '0',
          avgPrice: '0', origQty: '0.100', executedQty: '0', cumQuote: '0', type: 'LIMIT',
          reduceOnly: false, side: 'BUY', positionSide: 'BOTH', time: 1, updateTime: 1,
        });
      }),
    );

    const res = await client().futures.ops.placeBracketOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      quantity: 0.1037,
      entryPrice: 60000.04,
      stopLossPrice: 59000.04,
      takeProfitPrice: 62000.06,
    });

    expect(res.quantity).toBe('0.103');
    expect(sent[0]).toContain('price=60000.0');
    expect(sent[1]).toContain('stopPrice=59000.0');
    expect(res.protectionComplete).toBe(false);
    expect(res.takeProfit).toHaveProperty('error');
    expect(res.warning).toMatch(/may be.*unprotected/s);
  });
});
