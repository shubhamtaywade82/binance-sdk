import { describe, expect, it } from 'vitest';
import { BinanceApiError, NetworkError, RateLimitError } from '../src/errors/index.js';

describe('errors', () => {
  it('BinanceApiError carries code and status', () => {
    const err = new BinanceApiError('Invalid symbol.', -1121, 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Invalid symbol.');
    expect(err.code).toBe(-1121);
    expect(err.status).toBe(400);
    expect(err.name).toBe('BinanceApiError');
  });

  it('RateLimitError is a BinanceApiError with optional retryAfterMs', () => {
    const err = new RateLimitError('Too many requests', -1003, 429, 1000);
    expect(err).toBeInstanceOf(BinanceApiError);
    expect(err.retryAfterMs).toBe(1000);
    expect(err.name).toBe('RateLimitError');
  });

  it('carries endpoint/method/headers context and exposes classification helpers', () => {
    const rateLimited = new BinanceApiError('Way too many requests', -1003, 429, {
      endpoint: '/api/v3/order',
      method: 'POST',
      headers: { 'retry-after': '10' },
    });
    expect(rateLimited.endpoint).toBe('/api/v3/order');
    expect(rateLimited.method).toBe('POST');
    expect(rateLimited.headers?.['retry-after']).toBe('10');
    expect(rateLimited.isRateLimitError()).toBe(true);
    expect(rateLimited.isTimestampError()).toBe(false);
    expect(rateLimited.isInsufficientBalance()).toBe(false);

    const staleTimestamp = new BinanceApiError('Timestamp outside recvWindow', -1021, 400);
    expect(staleTimestamp.isTimestampError()).toBe(true);

    const insufficientBalance = new BinanceApiError('Account has insufficient balance', -2010, 400);
    expect(insufficientBalance.isInsufficientBalance()).toBe(true);
  });

  it('NetworkError wraps the original cause', () => {
    const original = new Error('ECONNRESET');
    const err = new NetworkError('Network failure', original);
    expect(err).toBeInstanceOf(Error);
    expect(err.cause).toBe(original);
    expect(err.name).toBe('NetworkError');
  });
});
