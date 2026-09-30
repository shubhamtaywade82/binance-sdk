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

  it('parses array payloads for all-market streams element-wise', () => {
    const mark = parseWsPayload('!markPrice@arr@1s', [
      { e: 'markPriceUpdate', E: 1, s: 'BTCUSDT', p: '100', i: '99', P: '100', r: '0.0001', T: 1 },
      { e: 'markPriceUpdate', E: 1, s: 'ETHUSDT', p: '10', i: '9', P: '10', r: '0.0001', T: 1 },
    ]);
    expect(Array.isArray(mark)).toBe(true);
    expect(mark).toHaveLength(2);
    expect((mark as { p: number }[])[1]?.p).toBe(10);

    const tickers = parseWsPayload('!miniTicker@arr', [
      { e: '24hrMiniTicker', E: 1, s: 'BTCUSDT', c: '1', o: '1', h: '1', l: '1', v: '1', q: '1' },
    ]);
    expect(tickers).toHaveLength(1);
  });

  it('parses !bookTicker (no @ in the stream name)', () => {
    const payload = parseWsPayload('!bookTicker', { u: 1, s: 'BTCUSDT', b: '1', B: '2', a: '3', A: '4' });
    expect(payload).toMatchObject({ s: 'BTCUSDT', b: 1 });
  });

  it('parses rpiDepth, contractInfo and tradingSession payloads', () => {
    expect(
      parseWsPayload('btcusdt@rpiDepth@500ms', {
        e: 'depthUpdate', E: 1, T: 1, s: 'BTCUSDT', U: 1, u: 2, pu: 0, b: [['1', '2']], a: [['3', '4']],
      }),
    ).toMatchObject({ s: 'BTCUSDT', U: 1 });
    expect(
      parseWsPayload('!contractInfo', {
        e: 'contractInfo', E: 1, s: 'BTCUSDT', ct: 'PERPETUAL', dt: 1, ot: 1, cs: 'TRADING',
        bks: [{ bs: 1, bnf: 0, bnc: 5000, mmr: 0.01, cf: 0, mi: 1, ma: 125 }],
      }),
    ).toMatchObject({ s: 'BTCUSDT', cs: 'TRADING' });
    expect(parseWsPayload('tradingSession', { e: 'tradingSession', E: 1, t: 1, T: 2, S: 'OPEN' })).toMatchObject({ S: 'OPEN' });
  });

  it('throws on an unrecognized stream name', () => {
    expect(() => parseWsPayload('ethusdt@unknownStream', {})).toThrow(/Unknown WS stream/);
  });
});
