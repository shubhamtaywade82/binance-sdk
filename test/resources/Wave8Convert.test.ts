/**
 * Wave 8 — strict-schema acceptance for the Convert product.
 *
 * Two layers:
 *
 * 1. Golden fixtures (test/fixtures/convert/*.json) parsed directly with
 *    the generated Wave 8 schemas — every documented wire shape must
 *    parse, including both variants of the three shapes Binance changed
 *    across the docs-catalog migration (tradeFlow wrapped vs array,
 *    limitQueryOpenOrders wrapped vs array, assetInfo pair-limits vs
 *    per-asset precision).
 *
 * 2. MSW harness tests through the resource: the transition unions
 *    normalize (tradeFlow / limitQueryOpenOrders always return plain
 *    arrays), id coercion accepts both wire id forms, the SDK's
 *    numeric-amount convention is preserved, and limitCancelOrder —
 *    previously returned as a raw `Record<string, unknown>` — now
 *    validates against the oracle schema.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient.js';
import { Convert } from '../../src/resources/Convert.js';
import {
  acceptQuoteResponseSchema,
  cancelLimitOrderResponseSchema,
  getConvertTradeHistoryResponseListInnerSchema,
  getConvertTradeHistoryResponseSchema,
  listAllConvertPairsResponseSchema,
  orderStatusResponseSchema,
  placeLimitOrderResponseSchema,
  queryLimitOpenOrdersResponseListInnerSchema,
  queryLimitOpenOrdersResponseSchema,
  queryOrderQuantityPrecisionPerAssetResponseSchema,
  sendQuoteRequestResponseSchema,
} from '../../src/types/convert.wave8.types.js';
import { ConvertAssetInfoSchema } from '../../src/types/extras.types.js';
import { z } from 'zod';

const FIXTURES = fileURLToPath(new URL('../fixtures/convert/', import.meta.url));
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

describe('Wave 8 Convert fixtures — golden payloads parse with the oracle schemas', () => {
  it('getQuote parses', () => {
    const q = sendQuoteRequestResponseSchema.parse(fixture('getQuote.json'));
    expect(q.quoteId).toBe('12415572564');
    expect(q.ratio).toBe(38163.7); // numeric-string convention preserved
    expect(q.inverseRatio).toBe(0.0000262);
  });

  it('acceptQuote parses (oracle + SDK extra wire fields)', () => {
    const r = acceptQuoteResponseSchema.parse(fixture('acceptQuote.json'));
    expect(r.orderId).toBe('947256916426721520');
    expect(r.createTime).toBe(1623381330444);
    expect(r.fromAmount).toBe(10);
    expect(r.orderStatus).toBe('PROCESS');
  });

  it('orderStatus parses (numeric orderId coerces to the established string type)', () => {
    const r = orderStatusResponseSchema.parse(fixture('orderStatus.json'));
    // Upstream OpenAPI types orderId as number|bigint — ids beyond 2^53 cannot
    // survive JSON.parse, so the fixture uses a 53-bit-safe id and the SDK
    // coerces to its established string type.
    expect(r.orderId).toBe('9472569164267');
    expect(r.inverseRatio).toBe(0.0000262); // field recovered from the oracle
  });

  it('tradeFlow parses in both documented wire shapes', () => {
    const wire = z.union([z.array(getConvertTradeHistoryResponseListInnerSchema), getConvertTradeHistoryResponseSchema]);
    const array = wire.parse(fixture('tradeFlow.array.json'));
    expect(Array.isArray(array)).toBe(true);
    const wrapped = wire.parse(fixture('tradeFlow.wrapped.json'));
    expect(Array.isArray(wrapped)).toBe(false); // the wrapper object branch
    if (!Array.isArray(wrapped)) expect(wrapped.list?.[0]?.quoteId).toBe('12415572564');
    const direct = getConvertTradeHistoryResponseSchema.parse(fixture('tradeFlow.wrapped.json'));
    expect(direct.list?.[0]?.quoteId).toBe('12415572564');
  });

  it('exchangeInfo parses', () => {
    const pairs = listAllConvertPairsResponseSchema.parse(fixture('exchangeInfo.json'));
    expect(pairs[0]?.fromAsset).toBe('USDT');
    expect(pairs[0]?.toAssetMaxAmount).toBe(9e24); // "9E+24" numeric-string
  });

  it('assetInfo parses in both documented wire shapes', () => {
    const wire = z.union([ConvertAssetInfoSchema, queryOrderQuantityPrecisionPerAssetResponseSchema]);
    const legacy = wire.parse(fixture('assetInfo.legacy.json'));
    expect('fromAsset' in legacy && legacy.fromAsset).toBe('USDT');
    const precision = queryOrderQuantityPrecisionPerAssetResponseSchema.parse(fixture('assetInfo.precision.json'));
    expect(precision[1]).toEqual({ asset: 'USDT', fraction: 2 });
  });

  it('limitPlaceOrder / limitCancelOrder parse', () => {
    expect(placeLimitOrderResponseSchema.parse(fixture('limitPlaceOrder.json'))).toEqual({ orderId: '5575736', status: 'S' });
    expect(cancelLimitOrderResponseSchema.parse(fixture('limitCancelOrder.json'))).toEqual({ orderId: '5575736', status: 'S' });
  });

  it('limitQueryOpenOrders parses in both documented wire shapes', () => {
    const wire = z.union([z.array(queryLimitOpenOrdersResponseListInnerSchema), queryLimitOpenOrdersResponseSchema]);
    const array = wire.parse(fixture('limitQueryOpenOrders.array.json'));
    expect(Array.isArray(array)).toBe(true);
    const wrapped = wire.parse(fixture('limitQueryOpenOrders.wrapped.json'));
    expect(Array.isArray(wrapped)).toBe(false); // the wrapper object branch
    if (!Array.isArray(wrapped)) expect(wrapped.list?.[0]?.quoteId).toBe('12415572564');
  });
});

describe('Wave 8 Convert resource — transition unions normalize the wire', () => {
  it('tradeFlow normalizes the wrapped {"list": [...]} shape to a plain array', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/tradeFlow`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}tradeFlow.wrapped.json`, 'utf8')))),
    );
    const flow = await new Convert(http_()).tradeFlow();
    expect(Array.isArray(flow)).toBe(true);
    expect(flow[0]?.quoteId).toBe('12415572564');
    expect(flow[0]?.fromAmount).toBe(10);
  });

  it('tradeFlow still returns a plain array for the legacy wire shape', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/tradeFlow`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}tradeFlow.array.json`, 'utf8')))),
    );
    const flow = await new Convert(http_()).tradeFlow();
    expect(flow[0]?.orderStatus).toBe('SUCCESS');
  });

  it('assetInfo accepts the re-documented per-asset precision shape', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/assetInfo`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}assetInfo.precision.json`, 'utf8')))),
    );
    const info = await new Convert(http_()).assetInfo();
    expect(Array.isArray(info)).toBe(true);
    if (Array.isArray(info)) expect(info[0]?.fraction).toBe(6);
  });

  it('limitCancelOrder now validates the response (was raw Record<string, unknown>)', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/convert/limit/cancelOrder`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}limitCancelOrder.json`, 'utf8')))),
    );
    const r = await new Convert(http_()).limitCancelOrder('5575736');
    expect(r.orderId).toBe('5575736'); // number on the wire → coerced string
    expect(r.status).toBe('S');
  });

  it('limitCancelOrder rejects payloads with oracle-invalid field types', async () => {
    // status is documented as string; a typed mismatch must fail the parse
    // (this is the strictness the Wave 8 schemas add over raw passthrough).
    server.use(
      http.post(`${BASE}/sapi/v1/convert/limit/cancelOrder`, () => HttpResponse.json({ orderId: 1, status: 123 })),
    );
    await expect(new Convert(http_()).limitCancelOrder('x')).rejects.toThrow();
  });

  it('limitQueryOpenOrders normalizes the wrapped {"list": [...]} shape to a plain array', async () => {
    server.use(
      http.get(`${BASE}/sapi/v1/convert/limit/queryOpenOrders`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}limitQueryOpenOrders.wrapped.json`, 'utf8')))),
    );
    const open = await new Convert(http_()).limitQueryOpenOrders({ baseAsset: 'BTC', quoteAsset: 'USDT' });
    expect(Array.isArray(open)).toBe(true);
    expect(open[0]?.orderId).toBe('5575736');
    expect(open[0]?.ratio).toBe(38163.7);
    expect(open[0]?.expiredTimestamp).toBe(1623405864630);
  });

  it('limitPlaceOrder parses the {orderId, status} oracle shape', async () => {
    server.use(
      http.post(`${BASE}/sapi/v1/convert/limit/placeOrder`, () =>
        HttpResponse.json(JSON.parse(readFileSync(`${FIXTURES}limitPlaceOrder.json`, 'utf8')))),
    );
    const r = await new Convert(http_()).limitPlaceOrder({
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      limitPrice: '38163.7',
      baseAmount: '0.000262',
      side: 'BUY',
    });
    expect(r.orderId).toBe('5575736');
    expect(r.status).toBe('S');
  });
});
