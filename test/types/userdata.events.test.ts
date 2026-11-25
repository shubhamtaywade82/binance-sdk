import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  classifyClientOrderOrigin,
  formatOrderExpiryReason,
  ORDER_EXPIRY_REASONS,
  parseUserDataEvent,
  UserDataAlgoUpdateSchema,
  UserDataOrderTradeUpdateSchema,
  UserDataTradeLiteSchema,
  type OrderExecutionType,
  type PriceMatchMode,
  type UserDataAlgoUpdate,
  type UserDataEventOf,
  type UserDataOrderTradeUpdate,
  type UserDataTradeLite,
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
    expectTypeOf<UserDataEventOf<'ALGO_UPDATE'>>().toEqualTypeOf<UserDataAlgoUpdate>();
    expectTypeOf<UserDataEventOf<'STRATEGY_UPDATE'>>().toEqualTypeOf<UserDataUnknownEvent>();
    const parsed = parseUserDataEvent({ e: 'STRATEGY_UPDATE', E: 1 });
    expect(parsed.e).toBe('STRATEGY_UPDATE');
  });
});

describe('TRADE_LITE (fast trade push)', () => {
  const frame = {
    e: 'TRADE_LITE',
    E: 1725317599259,
    T: 1725317599256,
    s: 'BTCUSDT',
    q: '0.002',
    p: '61000.1',
    m: false,
    c: 'web_abc',
    S: 'BUY',
    L: '61000.1',
    l: '0.002',
    t: 987654321,
    i: 429953,
  };

  it('parses a real-shaped frame with decimals preserved as strings', () => {
    const parsed = UserDataTradeLiteSchema.parse(frame);
    expect(parsed.e).toBe('TRADE_LITE');
    expect(parsed.q).toBe('0.002');
    expect(parsed.L).toBe('61000.1');
    expect(parsed.m).toBe(false);
    expect(parsed.t).toBe(987654321);
    expect(parsed.i).toBe(429953);
  });

  it('rejects a non-decimal quantity instead of guessing', () => {
    expect(() => UserDataTradeLiteSchema.parse({ ...frame, q: 'abc' })).toThrow();
    expectTypeOf<UserDataTradeLite['q']>().toEqualTypeOf<string>();
  });

  it('routes through parseUserDataEvent as a modelled event', () => {
    const parsed = parseUserDataEvent(frame);
    expect(parsed.e).toBe('TRADE_LITE');
  });
});

describe('ALGO_UPDATE (algo order update, USDⓈ-M)', () => {
  const frame = {
    e: 'ALGO_UPDATE',
    E: 1755842461373,
    T: 1755842461360,
    o: {
      caid: 'my-algo-1',
      aid: 42,
      at: 'TRAILING_STOP_MARKET',
      o: 'TRAILING_STOP_MARKET',
      s: 'BTCUSDT',
      S: 'SELL',
      ps: 'BOTH',
      f: 'GTC',
      q: '0.010',
      X: 'NEW',
      ai: '0',
      tp: '0',
      p: '0',
      V: 'NONE',
      wt: 'CONTRACT_PRICE',
      pm: 'NONE',
      cp: false,
      pP: false,
      R: false,
      tt: 0,
      gtd: 0,
    },
  };

  it('parses the algo payload and keeps decimals as strings', () => {
    const parsed = UserDataAlgoUpdateSchema.parse(frame);
    expect(parsed.o.aid).toBe(42);
    expect(parsed.o.s).toBe('BTCUSDT');
    expect(parsed.o.X).toBe('NEW');
    expect(parsed.o.q).toBe('0.010');
    expect(parsed.o.ia).toBeUndefined();
  });

  it('surfaces the trailing-stop activation flag ia (false then true while X stays NEW)', () => {
    // 2026-08-21: ia is fully active — two NEW pushes, ia:false then ia:true.
    const inactive = UserDataAlgoUpdateSchema.parse(frame);
    const active = UserDataAlgoUpdateSchema.parse({ ...frame, o: { ...frame.o, ia: true } });
    expect(inactive.o.ia).toBeUndefined();
    expect(active.o.ia).toBe(true);
  });

  it('requires the algo identifier and status fields', () => {
    expect(() => UserDataAlgoUpdateSchema.parse({ e: 'ALGO_UPDATE', E: 1, T: 1, o: { s: 'BTCUSDT' } })).toThrow();
  });

  it('routes through parseUserDataEvent as a modelled event', () => {
    expect(parseUserDataEvent(frame).e).toBe('ALGO_UPDATE');
  });
});

describe('TRADE_PREVENTION execution type and SOR allocation fields', () => {
  it('accepts TRADE_PREVENTION as a typed execution type', () => {
    expect(UserDataOrderTradeUpdateSchema.parse(orderUpdate({ x: 'TRADE_PREVENTION' })).o.x).toBe('TRADE_PREVENTION');
  });
});
