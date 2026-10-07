import { describe, expect, it } from 'vitest';
import { parseUserDataEvent } from '../../src/types/userdata.types.js';

const order = {
  s: 'BTCUSDT', c: 'c1', i: 1, S: 'BUY', o: 'LIMIT', f: 'GTC', q: '0.01', p: '60000', ap: '0',
  sp: '0', x: 'NEW', X: 'NEW', l: '0', z: '0', L: '0', n: '0', N: 'USDT', T: 1, t: 0,
  b: '0', a: '0', m: false, R: false, wt: 'CONTRACT_PRICE', ot: 'LIMIT', ps: 'BOTH',
};

describe('parseUserDataEvent', () => {
  it('keeps the price-match mode (pm) on ORDER_TRADE_UPDATE', () => {
    const event = parseUserDataEvent({ e: 'ORDER_TRADE_UPDATE', E: 1, T: 1, o: { ...order, pm: 'OPPONENT', pP: false } });
    expect(event).toMatchObject({ e: 'ORDER_TRADE_UPDATE', o: { pm: 'OPPONENT', pP: false } });
  });

  it('still accepts ORDER_TRADE_UPDATE without pm', () => {
    const event = parseUserDataEvent({ e: 'ORDER_TRADE_UPDATE', E: 1, T: 1, o: order });
    expect((event as { o: { pm?: string } }).o.pm).toBeUndefined();
  });

  it('parses ALGO_UPDATE with its price-match mode', () => {
    const event = parseUserDataEvent({
      e: 'ALGO_UPDATE', E: 1, T: 2,
      o: { caid: 'a1', aid: 7, s: 'BTCUSDT', S: 'SELL', X: 'TRIGGERED', pm: 'QUEUE', tp: '59000', futureField: 1 },
    });
    expect(event).toMatchObject({ e: 'ALGO_UPDATE', o: { aid: 7, X: 'TRIGGERED', pm: 'QUEUE', futureField: 1 } });
  });

  it('parses TRADE_LITE keeping decimal strings exact', () => {
    const event = parseUserDataEvent({ e: 'TRADE_LITE', E: 1, T: 1, s: 'BTCUSDT', q: '0.00100000', p: '60000.10', m: true, c: 'c', S: 'BUY', L: '60000.10', l: '0.00100000', t: 9, i: 3 });
    expect(event).toMatchObject({ e: 'TRADE_LITE', q: '0.00100000', L: '60000.10' });
  });

  it('parses ACCOUNT_CONFIG_UPDATE and listenKeyExpired', () => {
    expect(parseUserDataEvent({ e: 'ACCOUNT_CONFIG_UPDATE', E: 1, T: 1, ac: { s: 'BTCUSDT', l: 20 } })).toMatchObject({ ac: { l: 20 } });
    expect(parseUserDataEvent({ e: 'listenKeyExpired', E: 1, listenKey: 'lk' })).toMatchObject({ listenKey: 'lk' });
  });

  it('returns events without a schema as-is instead of throwing', () => {
    const grid = { e: 'GRID_UPDATE', E: 1, T: 1, gu: { si: 1 } };
    expect(parseUserDataEvent(grid)).toBe(grid);
  });

  it('rejects payloads without an event type', () => {
    expect(() => parseUserDataEvent({ E: 1 })).toThrow(/missing event type/);
    expect(() => parseUserDataEvent(null)).toThrow(/Invalid user-data payload/);
  });

  it('still validates known events strictly', () => {
    expect(() => parseUserDataEvent({ e: 'ORDER_TRADE_UPDATE', E: 1, T: 1, o: { s: 'BTCUSDT' } })).toThrow();
  });
});
