import { describe, expect, it } from 'vitest';
import { BinanceApiError, NetworkError } from '../../../src/errors/index.js';
import { ExecutionUnknownError } from '../../../src/execution/types.js';
import { classifyRetrySafety, isRetrySafety } from '../../../src/execution/platform/RetrySafety.js';

function apiError(code: number, message = 'msg', status = 400): BinanceApiError {
  return new BinanceApiError(message, code, status);
}

describe('classifyRetrySafety', () => {
  it('classifies transport failures as reconciliation-required', () => {
    const result = classifyRetrySafety(new NetworkError('socket hang up'));
    expect(result.safety).toBe('reconciliation-required');
    expect(result.reason).toMatch(/outcome unknown/i);
  });

  it('classifies ExecutionUnknownError as reconciliation-required', () => {
    const error = new ExecutionUnknownError(
      'undetermined',
      {
        intentId: 'intent-1',
        clientOrderId: 'nbsdk-x',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        submittedAt: 1,
      },
      3,
    );
    const result = classifyRetrySafety(error);
    expect(result.safety).toBe('reconciliation-required');
    expect(result.reason).toMatch(/clientOrderId=nbsdk-x/);
  });

  it('classifies proven-absent orders as safe (-2013 / -2011)', () => {
    expect(classifyRetrySafety(apiError(-2013, 'Order does not exist')).safety).toBe('safe');
    expect(classifyRetrySafety(apiError(-2011, 'Unknown order sent')).safety).toBe('safe');
  });

  it('classifies throttling as safe (retry after the window)', () => {
    expect(classifyRetrySafety(apiError(-1003, 'Too many requests')).safety).toBe('safe');
    expect(classifyRetrySafety(apiError(-1000, 'rate limited', 429)).safety).toBe('safe');
    expect(classifyRetrySafety(apiError(-1000, 'banned', 418)).safety).toBe('safe');
  });

  it('classifies clock skew as safe after sync (-1021)', () => {
    const result = classifyRetrySafety(apiError(-1021, 'Timestamp outside recvWindow'));
    expect(result.safety).toBe('safe');
    expect(result.reason).toMatch(/sync the clock/);
  });

  it('classifies ambiguous server failures as reconciliation-required', () => {
    expect(classifyRetrySafety(apiError(-1000, 'UNKNOWN')).safety).toBe('reconciliation-required');
    expect(classifyRetrySafety(apiError(-1001, 'DISCONNECTED')).safety).toBe(
      'reconciliation-required',
    );
    expect(classifyRetrySafety(apiError(-1007, 'TIMEOUT')).safety).toBe(
      'reconciliation-required',
    );
  });

  it('classifies definitive exchange rejections as never-retry', () => {
    expect(classifyRetrySafety(apiError(-1013, 'filter failure')).safety).toBe('never-retry');
    expect(classifyRetrySafety(apiError(-2010, 'insufficient balance')).safety).toBe('never-retry');
    expect(classifyRetrySafety(apiError(-2019, 'margin is insufficient')).safety).toBe('never-retry');
    expect(classifyRetrySafety(apiError(-4164, 'min notional')).safety).toBe('never-retry');
  });

  it('refuses to guess for null errors and unrecognized types', () => {
    expect(classifyRetrySafety(null).safety).toBe('never-retry');
    expect(classifyRetrySafety(undefined).safety).toBe('never-retry');
    expect(classifyRetrySafety(new Error('plain')).safety).toBe('never-retry');
    expect(classifyRetrySafety('string error').safety).toBe('never-retry');
  });

  it('isRetrySafety narrows the four semantic values', () => {
    expect(isRetrySafety('safe')).toBe(true);
    expect(isRetrySafety('idempotent')).toBe(true);
    expect(isRetrySafety('reconciliation-required')).toBe(true);
    expect(isRetrySafety('never-retry')).toBe(true);
    expect(isRetrySafety('maybe')).toBe(false);
  });
});
