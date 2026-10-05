import { describe, expect, it } from 'vitest';
import {
  BinanceApiError,
  BinanceUnknownExecutionError,
  NetworkError,
  classifyUnknownExecution,
} from '../../src/errors/index.js';

describe('BinanceUnknownExecutionError', () => {
  it('preserves clientOrderId + symbol + original error and flags itself as BinanceError', () => {
    const original = new BinanceApiError('Internal error', -1000, 500);
    const err = new BinanceUnknownExecutionError('nbsdk-1', 'BTCUSDT', original);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BinanceUnknownExecutionError');
    expect(err.clientOrderId).toBe('nbsdk-1');
    expect(err.symbol).toBe('BTCUSDT');
    expect(err.originalError).toBe(original);
    expect(err.message).toContain('BTCUSDT');
    expect(err.message).toContain('nbsdk-1');
    expect(err.message).toMatch(/UNKNOWN/i);
    expect(err.message).toMatch(/Do NOT blindly retry/i);
  });

  it('accepts an explicit message override', () => {
    const err = new BinanceUnknownExecutionError('c1', 'ETHUSDT', null, 'custom message');
    expect(err.message).toBe('custom message');
  });
});

describe('classifyUnknownExecution', () => {
  it('returns null for definitive rejections (-2013, -2010)', () => {
    const result = classifyUnknownExecution(
      new BinanceApiError('Order does not exist', -2013, 400),
      { clientOrderId: 'c1', symbol: 'BTCUSDT' },
    );
    expect(result).toBeNull();
  });

  it('returns null for 429 / 418 (rate-limit, not ambiguous)', () => {
    expect(
      classifyUnknownExecution(new BinanceApiError('Too many requests', -1003, 429), {
        clientOrderId: 'c1',
        symbol: 'BTCUSDT',
      }),
    ).toBeNull();
    expect(
      classifyUnknownExecution(new BinanceApiError('Banned', -1003, 418), {
        clientOrderId: 'c1',
        symbol: 'BTCUSDT',
      }),
    ).toBeNull();
  });

  it('wraps 5XX HTTP errors as BinanceUnknownExecutionError', () => {
    const result = classifyUnknownExecution(
      new BinanceApiError('Internal server error', -1000, 502),
      { clientOrderId: 'c1', symbol: 'BTCUSDT' },
    );
    expect(result).toBeInstanceOf(BinanceUnknownExecutionError);
    expect(result?.clientOrderId).toBe('c1');
    expect(result?.symbol).toBe('BTCUSDT');
  });

  it('wraps transport-level timeouts and ECONNRESET', () => {
    const timeout = new Error('socket hang up');
    timeout.name = 'TimeoutError';
    const result = classifyUnknownExecution(timeout, {
      clientOrderId: 'c1',
      symbol: 'BTCUSDT',
    });
    expect(result).toBeInstanceOf(BinanceUnknownExecutionError);

    const reset = new Error('ECONNRESET');
    (reset as { code?: string }).code = 'ECONNRESET';
    const result2 = classifyUnknownExecution(reset, {
      clientOrderId: 'c2',
      symbol: 'ETHUSDT',
    });
    expect(result2).toBeInstanceOf(BinanceUnknownExecutionError);
    expect(result2?.symbol).toBe('ETHUSDT');
  });

  it('wraps NetworkError (the SDK class) — the audit UNKNOWN trap fires for every transport failure', () => {
    const result = classifyUnknownExecution(new NetworkError('connection dropped'), {
      clientOrderId: 'c1',
      symbol: 'BTCUSDT',
    });
    expect(result).toBeInstanceOf(BinanceUnknownExecutionError);
  });

  it('returns null for null / undefined / unknown shapes', () => {
    expect(classifyUnknownExecution(null, { clientOrderId: '', symbol: '' })).toBeNull();
    expect(classifyUnknownExecution(undefined, { clientOrderId: '', symbol: '' })).toBeNull();
    expect(classifyUnknownExecution('string error', { clientOrderId: '', symbol: '' })).toBeNull();
  });

  it('is idempotent — passing an already-wrapped error returns the same instance', () => {
    const original = new BinanceUnknownExecutionError('c1', 'BTCUSDT', new Error('boom'));
    const result = classifyUnknownExecution(original, {
      clientOrderId: 'ignored',
      symbol: 'ignored',
    });
    expect(result).toBe(original);
  });
});
