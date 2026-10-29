/**
 * Wave 8 — strict-schema acceptance for the Algo product (ladder rung 2).
 *
 * Two layers, mirroring the convert pilot (test/resources/Wave8Convert.test.ts):
 *
 * 1. Golden fixtures (test/fixtures/algo/*.json) parsed directly with the
 *    generated Wave 8 schemas — every documented wire shape must parse.
 *    The fixtures carry the REAL wire shapes: list endpoints are wrapped
 *    `{ total, orders }` / `{ total, executedQty, executedAmt, subOrders }`
 *    and submits ack with `{ clientAlgoId, success, code, msg }`. The
 *    pre-Wave-8 schemas parsed plain arrays / full order echoes — shapes
 *    that only existed in this repo's own test mocks, never on the wire.
 *
 * 2. MSW harness tests through the resource: the wrapped shapes flow
 *    through typed returns, the SDK's numeric-amount convention is
 *    preserved, and the two former raw returns (spot/futures cancelOrder)
 *    now validate against the oracle ack shape.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { Algo } from '../../src/resources/Algo.js';
import {
  cancelAlgoOrderSpotAlgoResponseSchema,
  queryHistoricalAlgoOrdersFutureAlgoResponseSchema,
  queryHistoricalAlgoOrdersSpotAlgoResponseSchema,
  querySubOrdersFutureAlgoResponseSchema,
  timeWeightedAveragePriceSpotAlgoResponseSchema,
  volumeParticipationResponseSchema,
} from '../../src/types/algo.wave8.types.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/algo/', import.meta.url));
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const BASE = 'https://api.binance.com';
function http_(): HttpClient {
  return new HttpClient({ baseURL: BASE, apiKey: 'k', apiSecret: 's' });
}
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES}${name}`, 'utf8'));
}

describe('Wave 8 Algo fixtures — golden payloads parse with the oracle schemas', () => {
  it('spot historicalOrders parses the wrapped { total, orders } wire shape', () => {
    const r = queryHistoricalAlgoOrdersSpotAlgoResponseSchema.parse(fixture('historicalOrders.spot.json'));
    expect(r.total).toBe(1);
    expect(r.orders?.[0]?.algoId).toBe(5);
    expect(r.orders?.[0]?.totalQty).toBe(10); // numeric-string convention preserved
    expect(r.orders?.[0]?.avgPrice).toBe(10000);
    expect(r.orders?.[0]?.duration).toBe(60);
  });

  it('futures historicalOrders parses with the positionSide field', () => {
    const r = queryHistoricalAlgoOrdersFutureAlgoResponseSchema.parse(fixture('historicalOrders.futures.json'));
    expect(r.orders?.[0]?.positionSide).toBe('BOTH');
    expect(r.orders?.[0]?.executedAmt).toBe(100);
  });

  it('TWAP submit parses the documented ack shape', () => {
    const r = timeWeightedAveragePriceSpotAlgoResponseSchema.parse(fixture('newOrderTwap.json'));
    expect(r.clientAlgoId).toBe('0e158e6816044558b5eee4d4e14f9db9_3262613689');
    expect(r.success).toBe(true);
    expect(r.code).toBe(0);
  });

  it('VP submit parses the documented ack shape', () => {
    const r = volumeParticipationResponseSchema.parse(fixture('newOrderVp.json'));
    expect(r.success).toBe(true);
  });

  it('cancel parses the documented ack shape', () => {
    const r = cancelAlgoOrderSpotAlgoResponseSchema.parse(fixture('cancelOrder.json'));
    expect(r.algoId).toBe(14511);
    expect(r.msg).toBe('success');
  });

  it('subOrders parses the wrapped { total, executedQty, executedAmt, subOrders } wire shape', () => {
    const r = querySubOrdersFutureAlgoResponseSchema.parse(fixture('subOrders.json'));
    expect(r.total).toBe(1);
    expect(r.executedQty).toBe(10); // numeric-string convention preserved
    expect(r.executedAmt).toBe(100);
    expect(r.subOrders?.[0]?.orderStatus).toBe('FILLED');
    expect(r.subOrders?.[0]?.feeAmt).toBe(0.01);
    expect(r.subOrders?.[0]?.timeInForce).toBe('GTC');
  });
});

describe('Wave 8 Algo resource — oracle shapes flow through the methods', () => {
  it('spot historicalOrders returns the wrapped documented shape', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/algo/spot/historicalOrders`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}historicalOrders.spot.json`, 'utf8')))),
    );
    const r = await new Algo(http_()).spot.historicalOrders();
    expect(r.total).toBe(1);
    expect(r.orders?.[0]?.algoId).toBe(5);
    expect(r.orders?.[0]?.totalQty).toBe(10);
  });

  it('futures openOrders returns the wrapped documented shape', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/algo/futures/openOrders`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}openOrders.spot.json`, 'utf8')))),
    );
    const r = await new Algo(http_()).futures.openOrders();
    expect(r.total).toBe(1);
    expect(r.orders?.[0]?.algoStatus).toBe('WORKING');
  });

  it('spot newOrderTwap returns the documented ack (was a full-order echo that never existed on the wire)', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/algo/spot/newOrderTwap`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}newOrderTwap.json`, 'utf8')))),
    );
    const r = await new Algo(http_()).spot.newOrderTwap({ symbol: 'BTCUSDT', side: 'BUY', quantity: '1', duration: 60 });
    expect(r.clientAlgoId).toBe('0e158e6816044558b5eee4d4e14f9db9_3262613689');
    expect(r.success).toBe(true);
  });

  it('futures newOrderVp returns the documented ack', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/algo/futures/newOrderVp`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}newOrderVp.json`, 'utf8')))),
    );
    const r = await new Algo(http_()).futures.newOrderVp({ symbol: 'BTCUSDT', side: 'BUY', quantity: '1', participationRate: 0.5 });
    expect(r.success).toBe(true);
    expect(r.code).toBe(0);
  });

  it('spot cancelOrder now validates the response (was raw Record<string, unknown>)', async () => {
    server.use(
      http.delete(`${BASE}/sapi/v1/algo/spot/order`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}cancelOrder.json`, 'utf8')))),
    );
    const r = await new Algo(http_()).spot.cancelOrder('14511');
    expect(r.algoId).toBe(14511);
    expect(r.success).toBe(true);
  });

  it('futures cancelOrder now validates the response (was raw Record<string, unknown>)', async () => {
    server.use(
      http.delete(`${BASE}/sapi/v1/algo/futures/order`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}cancelOrder.json`, 'utf8')))),
    );
    const r = await new Algo(http_()).futures.cancelOrder('14511');
    expect(r.msg).toBe('success');
  });

  it('futures subOrders returns the wrapped documented shape', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/algo/futures/subOrders`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}subOrders.json`, 'utf8')))),
    );
    const r = await new Algo(http_()).futures.subOrders({ algoId: '14511' });
    expect(r.subOrders?.[0]?.subId).toBe(1);
    expect(r.subOrders?.[0]?.avgPrice).toBe(10000);
  });

  it('rejects payloads with oracle-invalid field types (strictness over passthrough)', async () => {
    // algoStatus is documented as string; a typed mismatch must fail the parse.
    server.use(
      http.get(`${BASE}/sapi/v1/algo/spot/openOrders`, () =>
        HttpResponse.json({ total: 1, orders: [{ algoId: 1, algoStatus: 123 }] })),
    );
    await expect(new Algo(http_()).spot.openOrders()).rejects.toThrow();
  });
});
