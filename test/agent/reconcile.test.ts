import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { createAgentGateway } from '../../src/agent/execute.js';
import { reconcilePositions } from '../../src/agent/reconcile.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function priceRoute(price: number) {
  return http.get('https://fapi.binance.com/fapi/v1/ticker/price', ({ request }) => {
    const symbol = new URL(request.url).searchParams.get('symbol');
    return HttpResponse.json({ symbol, price: String(price) });
  });
}

describe('reconcilePositions (startup/per-cycle account reconciliation)', () => {
  it('live: names exchange-side positions the loop does not track', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () =>
        HttpResponse.json([
          { symbol: 'BTCUSDT', positionAmt: '0.5', entryPrice: '100', markPrice: '101',
            unRealizedProfit: '0.5', liquidationPrice: '50', leverage: '10',
            marginType: 'cross', positionSide: 'BOTH', notional: '50.5', updateTime: 1 },
          // A flat position is not exposure.
          { symbol: 'ETHUSDT', positionAmt: '0', entryPrice: '0', markPrice: '0',
            unRealizedProfit: '0', liquidationPrice: '0', leverage: '10',
            marginType: 'cross', positionSide: 'BOTH', notional: '0', updateTime: 1 },
          { symbol: 'SOLUSDT', positionAmt: '-10', entryPrice: '20', markPrice: '19',
            unRealizedProfit: '-10', liquidationPrice: '40', leverage: '5',
            marginType: 'cross', positionSide: 'BOTH', notional: '-190', updateTime: 1 },
        ])),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = createAgentGateway(client);

    const tracked = new Map<string, unknown>([['BTCUSDT', {}]]); // the loop manages BTC
    const snapshot = await reconcilePositions(client, gateway, tracked);

    expect(snapshot.notional).toEqual({ BTCUSDT: 50.5, SOLUSDT: 190 }); // abs notional
    expect(snapshot.untracked).toEqual(['SOLUSDT']); // SOL is held but unmanaged
  });

  it('paper: reads the simulator ledger, tracked positions are not untracked', async () => {
    server.use(priceRoute(100));
    const client = new BinanceClient({ maxRetries: 0 });
    const gateway = createAgentGateway(client, { paper: true, paperBalance: 10_000 });

    // Two simulated positions: one the loop manages, one from a previous run.
    await gateway.paperEngine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });
    await gateway.paperEngine.placeOrder({ symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', quantity: 0.5 });

    const tracked = new Map<string, unknown>([['BTCUSDT', {}]]);
    const snapshot = await reconcilePositions(client, gateway, tracked);

    expect(snapshot.notional.BTCUSDT).toBeCloseTo(100, 6);
    expect(snapshot.notional.ETHUSDT).toBeCloseTo(50, 6);
    expect(snapshot.untracked).toEqual(['ETHUSDT']);
  });

  it('an empty account reports no exposure', async () => {
    server.use(
      http.get('https://fapi.binance.com/fapi/v3/positionRisk', () => HttpResponse.json([])),
    );
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', maxRetries: 0 });
    const gateway = createAgentGateway(client);
    const snapshot = await reconcilePositions(client, gateway, new Map());
    expect(snapshot.notional).toEqual({});
    expect(snapshot.untracked).toEqual([]);
  });
});
