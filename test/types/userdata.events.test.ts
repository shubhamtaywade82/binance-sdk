import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  classifyClientOrderOrigin,
  formatOrderExpiryReason,
  ORDER_EXPIRY_REASONS,
  parseUserDataEvent,
  UserDataOrderTradeUpdateSchema,
  type OrderExecutionType,
  type PriceMatchMode,
  type UserDataEventOf,
  type UserDataOrderTradeUpdate,
  type UserDataUnknownEvent,
} from '../../src/types/userdata.types.js';

function orderUpdate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    e: 'ORDER_TRADE_UPDATE',
    E: 1,
    T: 1,
    o: {
      s: 'BTCUSDT',
      c: 'web_abc',
      i: 42,
      S: 'BUY',
      o: 'LIMIT',
      f: 'GTC',
      q: '0.001',
      p: '60000',
      ap: '0',
      sp: '0',
      x: 'NEW',
      X: 'NEW',
      l: '0',
      z: '0',
      L: '0',
      n: '0',
      N: 'USDT',
      T: 1,
      t: 0,
      b: '0',
      a: '0',
      m: false,
      R: false,
      wt: 'CONTRACT_PRICE',
      ot: 'LIMIT',
      ps: 'BOTH',
      ...overrides,
    },
  };
}

describe('ORDER_TRADE_UPDATE typed fields', () => {
  it('accepts every verified price-match mode', () => {
    for (const pm of ['NONE', 'OPPONENT', 'OPPONENT_5', 'OPPONENT_10', 'OPPONENT_20', 'QUEUE', 'QUEUE_5', 'QUEUE_10', 'QUEUE_20']) {
      const parsed = UserDataOrderTradeUpdateSchema.parse(orderUpdate({ pm }));
      expect(parsed.o.pm).toBe(pm);
    }
    expectTypeOf<UserDataOrderTradeUpdate['o']['pm']>().toEqualTypeOf<PriceMatchMode | undefined>();
  });

  it('normalizes the expiry reason code to a number', () => {
    expect(UserDataOrderTradeUpdateSchema.parse(orderUpdate({ er: 4 })).o.er).toBe(4);
    expect(UserDataOrderTradeUpdateSchema.parse(orderUpdate({ er: '4' })).o.er).toBe(4);
    expect(() => UserDataOrderTradeUpdateSchema.parse(orderUpdate({ er: 'STP' }))).toThrow();
    expect(() => UserDataOrderTradeUpdateSchema.parse(orderUpdate({ er: -1 }))).toThrow();
    expectTypeOf<UserDataOrderTradeUpdate['o']['er']>().toEqualTypeOf<number | undefined>();
  });

  it('accepts AMENDMENT and an unknown future execution type', () => {
    expect(UserDataOrderTradeUpdateSchema.parse(orderUpdate({ x: 'AMENDMENT' })).o.x).toBe('AMENDMENT');
    expect(UserDataOrderTradeUpdateSchema.parse(orderUpdate({ x: 'SOMETHING_NEW' })).o.x).toBe('SOMETHING_NEW');
    expectTypeOf<OrderExecutionType>().toMatchTypeOf<string>();
  });
});

describe('formatOrderExpiryReason', () => {
  it('labels every documented code 0–9 with its name and description', () => {
    for (let code = 0; code <= 9; code++) {
      const label = formatOrderExpiryReason(code);
      expect(label.startsWith(`${code} ${ORDER_EXPIRY_REASONS[code as keyof typeof ORDER_EXPIRY_REASONS].name}`)).toBe(true);
    }
    expect(formatOrderExpiryReason(4)).toContain('REDUCE_ONLY_KNOCKOUT');
  });

  it('reports undocumented codes as UNKNOWN instead of dropping them', () => {
    expect(formatOrderExpiryReason(11)).toBe('UNKNOWN(11)');
    expect(formatOrderExpiryReason(99)).toBe('UNKNOWN(99)');
  });
});

describe('classifyClientOrderOrigin', () => {
  it('maps the documented liquidation and ADL prefixes', () => {
    expect(classifyClientOrderOrigin('autoclose-1234')).toBe('LIQUIDATION');
    expect(classifyClientOrderOrigin('adl_autoclose')).toBe('ADL');
    expect(classifyClientOrderOrigin('adl_autoclose_xyz')).toBe('ADL');
  });

  it('does not guess for user ids or undocumented exchange prefixes', () => {
    expect(classifyClientOrderOrigin('web_abc')).toBe('OTHER');
    expect(classifyClientOrderOrigin('settlement_autoclose-1')).toBe('SETTLEMENT');
    expect(classifyClientOrderOrigin('')).toBe('OTHER');
  });
});

describe('parseUserDataEvent and typed event lookup', () => {
  it('resolves modelled names to strict types and unmodelled names to the unknown type', () => {
    expectTypeOf<UserDataEventOf<'ORDER_TRADE_UPDATE'>>().toEqualTypeOf<UserDataOrderTradeUpdate>();
    expectTypeOf<UserDataEventOf<'ALGO_UPDATE'>>().toEqualTypeOf<UserDataUnknownEvent>();
    const parsed = parseUserDataEvent({ e: 'ALGO_UPDATE', E: 1, i: 'algo-1' });
    expect(parsed.e).toBe('ALGO_UPDATE');
  });
});

describe('TRADE_PREVENTION execution type and SOR allocation fields', () => {
  it('accepts TRADE_PREVENTION as a typed execution type', () => {
    expect(UserDataOrderTradeUpdateSchema.parse(orderUpdate({ x: 'TRADE_PREVENTION' })).o.x).toBe('TRADE_PREVENTION');
  });
});
