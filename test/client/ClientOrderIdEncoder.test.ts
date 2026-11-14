import { describe, expect, it } from 'vitest';
import { PreflightValidationError } from '../../src/errors/PreflightValidationError.js';
import {
  CLIENT_ORDER_ID_MAX_LENGTH,
  CLIENT_ORDER_ID_PATTERN,
  decodeClientOrderId,
  encodeClientOrderId,
} from '../../src/client/ClientOrderIdEncoder.js';

describe('encodeClientOrderId / decodeClientOrderId', () => {
  it('round-trips the strategy, timestamp, and sequence', () => {
    const parts = { strategy: 'mr1', timestampMs: 1_770_736_694_138, sequence: 42 };
    const id = encodeClientOrderId(parts);
    expect(decodeClientOrderId(id)).toEqual(parts);
  });

  it('emits only the portable alphabet and stays within 36 characters', () => {
    const id = encodeClientOrderId({ strategy: 'ABCDEFGH', timestampMs: 2 ** 40, sequence: 1_679_615 });
    expect(id).toMatch(CLIENT_ORDER_ID_PATTERN);
    expect(id.length).toBeLessThanOrEqual(CLIENT_ORDER_ID_MAX_LENGTH);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a strategy tag with a dash, an empty tag, or a long tag', () => {
    expect(() => encodeClientOrderId({ strategy: 'a-b', timestampMs: 1, sequence: 1 })).toThrow(PreflightValidationError);
    expect(() => encodeClientOrderId({ strategy: '', timestampMs: 1, sequence: 1 })).toThrow(PreflightValidationError);
    expect(() => encodeClientOrderId({ strategy: 'ABCDEFGHI', timestampMs: 1, sequence: 1 })).toThrow(PreflightValidationError);
  });

  it('rejects timestamps and sequences outside their fixed widths', () => {
    expect(() => encodeClientOrderId({ strategy: 'a', timestampMs: -1, sequence: 0 })).toThrow(PreflightValidationError);
    expect(() => encodeClientOrderId({ strategy: 'a', timestampMs: 36 ** 8, sequence: 0 })).toThrow(PreflightValidationError);
    expect(() => encodeClientOrderId({ strategy: 'a', timestampMs: 1, sequence: 36 ** 4 })).toThrow(PreflightValidationError);
    expect(() => encodeClientOrderId({ strategy: 'a', timestampMs: 1.5, sequence: 0 })).toThrow(PreflightValidationError);
  });

  it('detects a corrupted id through the checksum', () => {
    const id = encodeClientOrderId({ strategy: 'mr1', timestampMs: 1000, sequence: 7 });
    const flipped = id.slice(0, -1) + (id.endsWith('0') ? '1' : '0');
    expect(() => decodeClientOrderId(flipped)).toThrow(PreflightValidationError);
  });

  it('rejects ids that are not in the encoder layout', () => {
    expect(() => decodeClientOrderId('nodash')).toThrow(PreflightValidationError);
    expect(() => decodeClientOrderId('mr1-short')).toThrow(PreflightValidationError);
  });
});
