import { describe, expect, it } from 'vitest';
import {
  parseUserDataEvent,
  UserDataAccountUpdateSchema,
  UserDataMarginCallSchema,
  UserDataOrderTradeUpdateSchema,
} from '../../src/types/userdata.types.js';

function orderFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    e: 'ORDER_TRADE_UPDATE',
    E: 1,
    T: 1,
    o: {
      s: 'BTCUSDT', c: 'web_1', i: 7, S: 'BUY', o: 'LIMIT', f: 'RPI',
      q: '0.00100000', p: '60000.10', ap: '0', sp: '0', x: 'NEW', X: 'NEW',
      l: '0', z: '0', L: '0', n: '0', N: 'USDT', T: 1, t: 0, b: '0', a: '0',
      m: false, R: false, wt: 'CONTRACT_PRICE', ot: 'LIMIT', ps: 'BOTH',
      ...overrides,
    },
  };
}

describe('user-data decimal fields are exact strings', () => {
  it('keeps prices and quantities as the exact wire string (no float rounding)', () => {
    const parsed = UserDataOrderTradeUpdateSchema.parse(orderFrame());
    expect(parsed.o.q).toBe('0.00100000');
    expect(parsed.o.p).toBe('60000.10');
    expect(typeof parsed.o.p).toBe('string');
  });

  it('preserves precision that a float would lose', () => {
    const parsed = UserDataOrderTradeUpdateSchema.parse(orderFrame({ p: '0.10000000000000001' }));
    expect(parsed.o.p).toBe('0.10000000000000001');
  });

  it('rejects malformed decimal strings instead of coercing them', () => {
    expect(() => UserDataOrderTradeUpdateSchema.parse(orderFrame({ q: 'abc' }))).toThrow();
    expect(() => UserDataOrderTradeUpdateSchema.parse(orderFrame({ p: '1..2' }))).toThrow();
    expect(() => UserDataOrderTradeUpdateSchema.parse(orderFrame({ l: '' }))).toThrow();
  });

  it('normalizes an empty optional decimal to "0" (same semantics as the old Number("") path)', () => {
    const parsed = UserDataOrderTradeUpdateSchema.parse(orderFrame({ rp: '', AP: '', cr: '5' }));
    expect(parsed.o.rp).toBe('0');
    expect(parsed.o.AP).toBe('0');
    expect(parsed.o.cr).toBe('5');
  });

  it('keeps integer ids and timestamps numeric', () => {
    const parsed = UserDataOrderTradeUpdateSchema.parse(orderFrame());
    expect(parsed.o.i).toBe(7);
    expect(parsed.o.T).toBe(1);
    expect(parsed.o.er).toBeUndefined();
  });

  it('accepts time-in-force RPI and returns it typed', () => {
    expect(UserDataOrderTradeUpdateSchema.parse(orderFrame({ f: 'RPI' })).o.f).toBe('RPI');
  });
});

describe('ACCOUNT_UPDATE reason field', () => {
  it('accepts a reason string (the old transform(Number) turned it into NaN)', () => {
    const parsed = UserDataAccountUpdateSchema.parse({
      e: 'ACCOUNT_UPDATE',
      E: 1,
      T: 1,
      a: {
        m: 'ORDER',
        B: [{ a: 'USDT', wb: '100.5', cw: '90', bc: '-1.25' }],
        P: [{ s: 'BTCUSDT', pa: '0.5', ep: '60000.1', cr: '0', up: '-12.3', mt: 'isolated', ps: 'LONG' }],
      },
    });
    expect(parsed.a.m).toBe('ORDER');
    expect(parsed.a.B[0]?.bc).toBe('-1.25');
    expect(parsed.a.P[0]?.ep).toBe('60000.1');
  });
});

describe('MARGIN_CALL decimal fields', () => {
  it('keeps margin figures as exact strings', () => {
    const parsed = UserDataMarginCallSchema.parse({
      e: 'MARGIN_CALL',
      E: 1,
      cw: '1000.00',
      p: [{ s: 'BTCUSDT', ps: 'LONG', pa: '1.000', mt: 'cross', iw: '0', mp: '60000', up: '-10', mm: '23.5' }],
    });
    expect(parsed.p[0]?.mm).toBe('23.5');
    expect(parsed.cw).toBe('1000.00');
  });
});

describe('parseUserDataEvent dispatch with string fields', () => {
  it('routes ORDER_TRADE_UPDATE to the strict schema and keeps strings', () => {
    const event = parseUserDataEvent(orderFrame());
    expect(event.e).toBe('ORDER_TRADE_UPDATE');
    if (event.e === 'ORDER_TRADE_UPDATE') {
      expect((event as { o: { q: string } }).o.q).toBe('0.00100000');
    }
  });
});
