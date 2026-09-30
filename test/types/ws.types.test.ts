import { describe, expect, it } from 'vitest';
import { parseWsPayload } from '../../src/types/ws.types.js';

describe('ws.types', () => {
  it('parses a kline stream payload', () => {
    const payload = parseWsPayload('btcusdt@kline_1m', {
      e: 'kline', E: 1, s: 'BTCUSDT',
      k: { t: 1, T: 2, s: 'BTCUSDT', i: '1m', o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: false, q: '20', V: '5', Q: '10' },
    });
    expect(payload).toMatchObject({ e: 'kline', k: { o: 1, c: 2 } });
  });

  it('parses an aggTrade stream payload', () => {
    const payload = parseWsPayload('ethusdt@aggTrade', {
      e: 'aggTrade', E: 1, s: 'ETHUSDT', a: 1, p: '2500', q: '1', f: 1, l: 1, T: 1, m: false,
    });
    expect(payload).toMatchObject({ e: 'aggTrade', p: 2500 });
  });

  it('parses a markPrice stream payload (futures only)', () => {
    const payload = parseWsPayload('ethusdt@markPrice@1s', {
      e: 'markPriceUpdate', E: 1, s: 'ETHUSDT', p: '2500', i: '2499', P: '2500', r: '0.0001', T: 1,
    });
    expect(payload).toMatchObject({ e: 'markPriceUpdate', p: 2500 });
  });

  it('parses the aggregate !markPrice@arr payload as an array', () => {
    const payload = parseWsPayload('!markPrice@arr', [
      { e: 'markPriceUpdate', E: 1, s: 'BTCUSDT', p: '60000', i: '59999', P: '60000', r: '0.0001', T: 1 },
      { e: 'markPriceUpdate', E: 2, s: 'ETHUSDT', p: '2500', i: '2499', P: '2500', r: '0.0001', T: 2 },
    ]);
    expect(Array.isArray(payload)).toBe(true);
    expect((payload as { s: string }[]).map((entry) => entry.s)).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('parses the aggregate !markPrice@arr@1s payload as an array (Binance 2026 addition)', () => {
    const payload = parseWsPayload('!markPrice@arr@1s', [
      { e: 'markPriceUpdate', E: 1, s: 'BTCUSDT', p: '60000', i: '59999', P: '60000', r: '0.0001', T: 1 },
    ]);
    expect(Array.isArray(payload)).toBe(true);
    expect((payload as { p: number }[])[0]?.p).toBe(60000);
  });

  it('parses a !contractInfo stream payload', () => {
    const payload = parseWsPayload('!contractInfo', {
      e: 'contractInfo',
      E: 1,
      params: [
        { symbol: 'BTCUSDT', pair: 'BTCUSDT', contractType: 'PERPETUAL', contractStatus: 'TRADING' },
      ],
    });
    expect(payload).toMatchObject({ e: 'contractInfo' });
  });

  it('parses a <symbol>@rpiDepth@500ms stream payload', () => {
    const payload = parseWsPayload('btcusdt@rpiDepth@500ms', {
      e: 'rpiDepthUpdate',
      E: 1,
      s: 'BTCUSDT',
      U: 100,
      u: 200,
      b: [['60000', '1']],
      a: [['60001', '0.5']],
    });
    expect(payload).toMatchObject({ e: 'rpiDepthUpdate', s: 'BTCUSDT' });
  });

  it('parses a tradingSession stream payload', () => {
    const payload = parseWsPayload('tradingSession', {
      e: 'tradingSession',
      E: 1,
      phase: 'OPEN',
      openTime: 1,
      closeTime: 2,
      session: 'REGULAR',
    });
    expect(payload).toMatchObject({ e: 'tradingSession', phase: 'OPEN' });
  });

  it('parses the corrected continuous-kline stream name (symbol_contractType@continuousKline_interval)', () => {
    // The new stream-name format puts the contract type between the symbol and
    // the stream kind — the parser still routes both continuousKline_* and the
    // symbol-prefixed form to the kline schema.
    const payload = parseWsPayload('solusdt_perpetual@continuousKline_5m', {
      e: 'kline', E: 1, s: 'SOLUSDT',
      k: { t: 1, T: 2, s: 'SOLUSDT', i: '5m', o: '1', c: '2', h: '3', l: '0.5', v: '10', n: 5, x: false, q: '20', V: '5', Q: '10' },
    });
    expect(payload).toMatchObject({ e: 'kline', k: { c: 2 } });
  });

  it('throws on an unrecognized stream name', () => {
    expect(() => parseWsPayload('ethusdt@unknownStream', {})).toThrow(/Unknown WS stream/);
  });
});
