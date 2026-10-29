import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createAgentGateway, currentEquity, emergencyFlatten, executeEntry,
  SymbolRulesCache, formatPrice, formatQty, type TickRules,
} from '../../src/agent/execute.js';
import type { Signal } from '../../src/agent/signals.js';
import { BinanceClient } from '../../src/client/BinanceClient.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const RULES: TickRules = { tickSize: 0.1, tickDecimals: 1, stepSize: 0.001, stepDecimals: 3 };

function signal(over: Partial<Signal> = {}): Signal {
  return {
    direction: 'LONG', setup: 'CONTINUATION', score: 80, vetoes: [],
    entryHint: 100, stopHint: 98, ...over,
  };
}

function mockPublicData(): void {
  server.use(
    http.get('https://fapi.binance.com/fapi/v1/exchangeInfo', () =>
      HttpResponse.json({
        timezone: 'UTC', serverTime: 1,
        symbols: [{
          symbol: 'BTCUSDT', status: 'TRADING', baseAsset: 'BTC', quoteAsset: 'USDT',
          contractType: 'PERPETUAL',
          filters: [
            { filterType: 'PRICE_FILTER', tickSize: '0.10' },
            { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001', maxQty: '1000' },
            { filterType: 'MARKET_LOT_SIZE', stepSize: '0.001', minQty: '0.001', maxQty: '1000' },
            { filterType: 'MIN_NOTIONAL', notional: '5' },
          ],
        }],
      })),
    http.get('https://fapi.binance.com/fapi/v1/premiumIndex', () =>
      HttpResponse.json({
        symbol: 'BTCUSDT', markPrice: '100', indexPrice: '100',
        estimatedSettlePrice: '100', lastFundingRate: '0.0001',
        nextFundingTime: 1, interestRate: '0.0001', time: 1,
      })),
    http.get('https://fapi.binance.com/fapi/v1/ticker/price', () =>
      HttpResponse.json({ symbol: 'BTCUSDT', price: '100' })),
  );
}

function orderAck(): Record<string, unknown> {
  return {
    orderId: 1, symbol: 'BTCUSDT', status: 'FILLED', clientOrderId: 'x',
    price: '0', avgPrice: '100', origQty: '125', executedQty: '125',
    cumQuote: '12500', type: 'MARKET', reduceOnly: false, side: 'BUY',
    positionSide: 'BOTH', time: 1, updateTime: 1,
  };
}

describe('formatPrice / formatQty', () => {
  it('round prices to tick and floor quantities to step', () => {
    expect(formatPrice(102.04, RULES)).toBe('102.0');
    expect(formatPrice(101.96, RULES)).toBe('102.0');
    expect(formatQty(50.0009, RULES)).toBe('50.000');
    expect(formatQty(37.5, RULES)).toBe('37.500');
  });
});

describe('executeEntry (live gateway)', () => {
  it('sizes off risk, places the entry and the full protective package', async () => {
    mockPublicData();
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', ({ request }) => {
        // Signed POSTs carry their parameters in the query string.
        const params = Object.fromEntries(new URL(request.url).searchParams);
        bodies.push(params);
        return HttpResponse.json(orderAck());
      }),
    );

    const client = new BinanceClient({ apiKey: 'test', apiSecret: 'test', maxRetries: 0 });
    const gateway = createAgentGateway(client);
    const rules = new SymbolRulesCache(client);

    // equity 10,000 x 2.5% = 250 risk; riskPerUnit = |100-98| = 2 -> qty 125
    const res = await executeEntry(client, gateway, rules, 'BTCUSDT', signal(), 10_000);

    expect(res).not.toBeNull();
    expect(res!.quantity).toBe('125.000');
    expect(res!.entryPrice).toBe(100);
    expect(res!.tp1Price).toBe(102);
    expect(res!.tp2Price).toBe(104);
    expect(res!.trailActivation).toBe(105);
    expect(res!.legs).toEqual({
      stopLoss: 'PLACED', tp1: 'PLACED', tp2: 'PLACED', trail: 'PLACED',
    });

    expect(bodies).toHaveLength(5);
    const [entry, sl, tp1, tp2, trail] = bodies;
    expect(entry).toMatchObject({ type: 'MARKET', side: 'BUY', quantity: '125.000' });
    // Signed POSTs serialize through the query string, so booleans/numbers
    // arrive as their string forms.
    expect(sl).toMatchObject({
      type: 'STOP_MARKET', side: 'SELL', stopPrice: '98.00',
      closePosition: 'true', workingType: 'MARK_PRICE',
    });
    expect(tp1).toMatchObject({
      type: 'LIMIT', side: 'SELL', price: '102.00', quantity: '50.000',
      timeInForce: 'GTC', reduceOnly: 'true',
    });
    expect(tp2).toMatchObject({
      type: 'LIMIT', side: 'SELL', price: '104.00', quantity: '37.500',
      timeInForce: 'GTC', reduceOnly: 'true',
    });
    expect(trail).toMatchObject({
      type: 'TRAILING_STOP_MARKET', side: 'SELL', activationPrice: '105.00',
      callbackRate: '1', closePosition: 'true', workingType: 'MARK_PRICE',
    });
  });

  it('returns null on hard vetoes without touching the exchange', async () => {
    mockPublicData();
    let posts = 0;
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', () => {
        posts++;
        return HttpResponse.json(orderAck());
      }),
    );
    const client = new BinanceClient({ apiKey: 'test', apiSecret: 'test' });
    const gateway = createAgentGateway(client);
    const res = await executeEntry(
      client, gateway, new SymbolRulesCache(client), 'BTCUSDT',
      signal({ vetoes: ['BOOK_IMBALANCE_OPPOSITE'] }), 10_000,
    );
    expect(res).toBeNull();
    expect(posts).toBe(0);
  });

  it('returns null when sizing refuses the geometry (stop on the wrong side)', async () => {
    mockPublicData();
    const client = new BinanceClient({ apiKey: 'test', apiSecret: 'test' });
    const gateway = createAgentGateway(client);
    const res = await executeEntry(
      client, gateway, new SymbolRulesCache(client), 'BTCUSDT',
      signal({ stopHint: 101 }), 10_000, // above entry for a LONG
    );
    expect(res).toBeNull();
  });
});

describe('executeEntry (paper gateway)', () => {
  it('fills the entry on the simulator and marks protective legs unsimulated', async () => {
    mockPublicData();
    const client = new BinanceClient({ apiKey: 'test', apiSecret: 'test' });
    const gateway = createAgentGateway(client, { paper: true, paperBalance: 10_000 });
    const rules = new SymbolRulesCache(client);

    // Full-margin accounting on paper: keep the notional under the balance.
    // equity 10,000 x 2.5% = 250 risk; riskPerUnit = |100-97| = 3 -> qty 83.333
    const res = await executeEntry(
      client, gateway, rules, 'BTCUSDT', signal({ stopHint: 97 }), 10_000,
    );

    expect(res).not.toBeNull();
    expect(res!.quantity).toBe('83.333');
    expect(res!.entryPrice).toBe(100); // filled at the live mark
    expect(res!.tp1Price).toBe(103);
    expect(res!.tp2Price).toBe(106);
    expect(res!.legs.stopLoss).toBe('PAPER_UNSIMULATED');
    expect(res!.legs.tp1).toBe('PAPER_UNSIMULATED');
    expect(res!.legs.trail).toBe('PAPER_UNSIMULATED');

    const pos = gateway.paperEngine.getPosition('BTCUSDT');
    expect(pos?.side).toBe('LONG');
    expect(pos?.quantity).toBeCloseTo(83.333, 3);

    expect(await currentEquity(client, gateway)).toBe(10_000); // no fees configured

    await emergencyFlatten(client, gateway, ['BTCUSDT']);
    const flat = gateway.paperEngine.getPosition('BTCUSDT');
    expect(flat?.side).toBe('NONE');
    expect(flat?.quantity).toBe(0);
  });
});

describe('executeEntry pre-trade notional validation (maxNotionalPerOrder-armed client)', () => {
  function mockBook(bid = 99.9, ask = 100.1): void {
    server.use(
      http.get('https://fapi.binance.com/fapi/v1/ticker/bookTicker', ({ request }) => {
        const symbol = new URL(request.url).searchParams.get('symbol');
        return HttpResponse.json({
          symbol, bidPrice: String(bid), bidQty: '1', askPrice: String(ask), askQty: '1', time: 1,
        });
      }),
    );
  }

  it('a MARKET entry within the cap passes pre-trade validation and reaches the exchange', async () => {
    mockPublicData();
    mockBook();
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', ({ request }) => {
        bodies.push(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json(orderAck());
      }),
    );

    // Live-mode reality check: the session client is armed with the safety fence.
    const client = new BinanceClient({
      apiKey: 'test', apiSecret: 'test', maxRetries: 0,
      safety: { allowedSymbols: ['BTCUSDT'], maxNotionalPerOrder: 25_000 },
    });
    const gateway = createAgentGateway(client);
    const rules = new SymbolRulesCache(client);

    // equity 10,000 x 2.5% = 250 risk -> qty 125 BTC at ~100 -> ~12.5k notional.
    const res = await executeEntry(client, gateway, rules, 'BTCUSDT', signal(), 10_000);
    expect(res).not.toBeNull();

    // The MARKET entry went out with clean parameters — no synthetic price.
    const entry = bodies[0];
    expect(entry).toMatchObject({ type: 'MARKET', side: 'BUY', quantity: '125.000' });
    expect(entry.price).toBeUndefined();
  });

  it('a MARKET entry over the cap is refused by pre-trade validation — nothing is sent', async () => {
    mockPublicData();
    mockBook();
    let posts = 0;
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', () => {
        posts += 1;
        return HttpResponse.json(orderAck());
      }),
    );

    const client = new BinanceClient({
      apiKey: 'test', apiSecret: 'test', maxRetries: 0,
      safety: { allowedSymbols: ['BTCUSDT'], maxNotionalPerOrder: 25_000 },
    });
    const gateway = createAgentGateway(client);
    const rules = new SymbolRulesCache(client);

    // equity 30,000 x 2.5% = 750 risk -> qty 375 BTC at ~100 -> ~37.5k notional.
    // Sizing succeeds, but the pre-trade notional check must refuse before submission.
    await expect(
      executeEntry(client, gateway, rules, 'BTCUSDT', signal(), 30_000),
    ).rejects.toThrow(/exceeds the 25000 cap/);
    expect(posts).toBe(0);
  });

  it('without the fence (no safety) entries behave exactly as before', async () => {
    mockPublicData();
    mockBook();
    server.use(
      http.post('https://fapi.binance.com/fapi/v1/order', () => HttpResponse.json(orderAck())),
    );

    const client = new BinanceClient({ apiKey: 'test', apiSecret: 'test', maxRetries: 0 });
    const gateway = createAgentGateway(client);
    const res = await executeEntry(
      client, gateway, new SymbolRulesCache(client), 'BTCUSDT', signal(), 30_000,
    );
    expect(res).not.toBeNull(); // no cap configured -> no validation refusal
  });
});
