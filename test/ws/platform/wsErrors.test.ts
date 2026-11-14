import { describe, expect, it } from 'vitest';
import { BinanceApiError } from '../../../src/errors/BinanceApiError.js';
import { RateLimitError } from '../../../src/errors/RateLimitError.js';
import { RpcOutcomeUnknownError, classifyRpcMethod } from '../../../src/errors/RpcOutcomeUnknownError.js';
import {
  WS_429_BACKOFF_MS,
  classifyWsApiFailure,
  wsRateLockMs,
} from '../../../src/ws/platform/wsErrors.js';

function entry(method: string, params: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    method,
    category: classifyRpcMethod(method),
    params,
    connectionGeneration: 3,
    submittedAt: 100,
    sentAt: 110,
  };
}

describe('classifyWsApiFailure (in-frame status dispatch)', () => {
  it('maps 418 and 429 to RateLimitError carrying the method', () => {
    const err = classifyWsApiFailure({ status: 418, error: { code: -1003, msg: 'banned' } }, entry('ticker.price'), 'banned');
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).status).toBe(418);
    expect((err as RateLimitError).code).toBe(-1003);
    expect(classifyWsApiFailure({ status: 429 }, entry('ticker.price'), 'slow down')).toBeInstanceOf(RateLimitError);
  });

  it('maps a 5xx on an order write to RpcOutcomeUnknownError (the exchange may have acted)', () => {
    const err = classifyWsApiFailure(
      { status: 503, error: { code: -1001, msg: 'internal' } },
      entry('order.place', { newClientOrderId: 'cid-9', symbol: 'BTCUSDT' }),
      'internal',
    );
    expect(err).toBeInstanceOf(RpcOutcomeUnknownError);
    const meta = (err as RpcOutcomeUnknownError).metadata;
    expect(meta.cause).toBe('server-error');
    expect(meta.clientOrderId).toBe('cid-9');
    expect(meta.symbol).toBe('BTCUSDT');
    expect(meta.requestId).toBe('req-1');
  });

  it('maps a 5xx on a read to BinanceApiError, which is safe to retry', () => {
    const err = classifyWsApiFailure({ status: 503, error: { code: -1001, msg: 'busy' } }, entry('ticker.price'), 'busy');
    expect(err).toBeInstanceOf(BinanceApiError);
    expect((err as BinanceApiError).status).toBe(503);
  });

  it('maps a 4xx rejection to BinanceApiError with the exchange code', () => {
    const err = classifyWsApiFailure(
      { status: 400, error: { code: -2010, msg: 'Account has insufficient balance for requested action.' } },
      entry('order.place'),
      'Account has insufficient balance',
    );
    expect(err).toBeInstanceOf(BinanceApiError);
    expect((err as BinanceApiError).code).toBe(-2010);
    expect((err as BinanceApiError).status).toBe(400);
  });
});

describe('wsRateLockMs', () => {
  it('starts a 418 ban at 2 minutes, doubles on repeats, and caps at 3 days', () => {
    expect(wsRateLockMs(418, 1)).toBe(120_000);
    expect(wsRateLockMs(418, 2)).toBe(240_000);
    expect(wsRateLockMs(418, 30)).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('uses the fixed backoff for a 429', () => {
    expect(wsRateLockMs(429, 1)).toBe(WS_429_BACKOFF_MS);
  });
});
