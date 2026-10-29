import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { RiskGateway } from '../../src/risk/RiskGateway.js';
import { RealizedPnlFeed } from '../../src/risk/RealizedPnlFeed.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function incomeRow(tranId: number, income: number, asset = 'USDT', time = Date.now()) {
  return { symbol: 'BTCUSDT', incomeType: 'REALIZED_PNL', income: String(income), asset, info: '', time, tranId, tradeId: '1' };
}

function incomeRoute(rows: () => Array<Record<string, unknown>>) {
  return http.get('https://fapi.binance.com/fapi/v1/income', () => HttpResponse.json(rows()));
}

describe('RealizedPnlFeed (exchange income → daily-loss breaker)', () => {
  it('seedToday replaces the accumulator with the exchange sum and dedups subsequent polls', async () => {
    server.use(incomeRoute(() => [incomeRow(1, -300), incomeRow(2, -350)]));

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = new RiskGateway({ maxDailyLoss: 1_000 });
    const feed = new RealizedPnlFeed(client, gateway);

    const seeded = await feed.seedToday();
    expect(seeded).toBe(-650);
    expect(gateway.riskStatus().dailyPnl).toBe('-650');

    // Same rows again: a re-poll records nothing (no double count).
    expect(await feed.poll()).toBe(0);
    expect(gateway.riskStatus().dailyPnl).toBe('-650');
  });

  it('a poll records only NEW income rows — repeated realized losses trip the breaker', async () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = new RiskGateway({ maxDailyLoss: 1_000 });
    const feed = new RealizedPnlFeed(client, gateway);

    server.use(incomeRoute(() => [incomeRow(1, -300)]));
    await feed.seedToday();
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);

    // A new loss lands on the exchange ledger.
    server.use(incomeRoute(() => [incomeRow(1, -300), incomeRow(2, -400)]));
    expect(await feed.poll()).toBe(-400);
    expect(gateway.riskStatus().dailyPnl).toBe('-700');
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);

    // ...and one more pushes the day past the limit — breaker trips.
    server.use(incomeRoute(() => [incomeRow(1, -300), incomeRow(2, -400), incomeRow(3, -350)]));
    expect(await feed.poll()).toBe(-350);
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(gateway.riskStatus().circuitBreaker.reason).toBe('maxDailyLoss');
    expect(() =>
      gateway.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 }),
    ).toThrow(/circuit breaker/);
  });

  it('a boot seed already past the limit comes up tripped (restart after a blown day)', async () => {
    server.use(incomeRoute(() => [incomeRow(1, -600), incomeRow(2, -500)]));

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = new RiskGateway({ maxDailyLoss: 1_000 });
    const feed = new RealizedPnlFeed(client, gateway);

    await feed.seedToday();
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(true);
    expect(gateway.riskStatus().circuitBreaker.reason).toBe('maxDailyLoss');
  });

  it('ignores non-configured assets (foreign-currency income must not mix into the USDT day)', async () => {
    server.use(incomeRoute(() => [incomeRow(1, -300), incomeRow(2, -999_999, 'BNB')]));

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = new RiskGateway({ maxDailyLoss: 1_000 });
    const feed = new RealizedPnlFeed(client, gateway);

    expect(await feed.seedToday()).toBe(-300);
  });

  it('sums every configured income type (one request per type)', async () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = new RiskGateway({ maxDailyLoss: 1_000 });
    const feed = new RealizedPnlFeed(client, gateway, { incomeTypes: ['REALIZED_PNL', 'FUNDING_FEE'] });

    server.use(
      http.get('https://fapi.binance.com/fapi/v1/income', ({ request }) => {
        const incomeType = new URL(request.url).searchParams.get('incomeType');
        if (incomeType === 'REALIZED_PNL') return HttpResponse.json([incomeRow(1, -300)]);
        return HttpResponse.json([{ ...incomeRow(9, -50), incomeType: 'FUNDING_FEE' }]);
      }),
    );
    expect(await feed.seedToday()).toBe(-350);
  });

  it('a profit day seeds positive (the breaker only trips on losses)', async () => {
    server.use(incomeRoute(() => [incomeRow(1, 500), incomeRow(2, 250)]));

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = new RiskGateway({ maxDailyLoss: 1_000 });
    const feed = new RealizedPnlFeed(client, gateway);

    expect(await feed.seedToday()).toBe(750);
    expect(gateway.riskStatus().circuitBreaker.tripped).toBe(false);
  });
});
