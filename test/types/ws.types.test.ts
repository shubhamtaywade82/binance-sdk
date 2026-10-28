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

  it('parses the aggregate !ticker@arr payload as an array of 24h tickers', () => {
    const payload = parseWsPayload('!ticker@arr', [
      { e: '24hrTicker', E: 1, s: 'BTCUSDT', p: '60000', P: '1', c: '61000', o: '60000', h: '61500', l: '59500', v: '1000', q: '61000000' },
      { e: '24hrTicker', E: 2, s: 'ETHUSDT', p: '2500', P: '2', c: '2550', o: '2500', h: '2560', l: '2490', v: '20000', q: '51000000' },
    ]);
    expect(Array.isArray(payload)).toBe(true);
    const tickers = payload as { s: string; q: number; c: number }[];
    expect(tickers.map((t) => t.s)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(tickers[0]!.q).toBe(61_000_000); // numeric quote volume
    expect(tickers[1]!.c).toBe(2550);
  });

  it('parses the aggregate !miniTicker@arr payload as an array', () => {
    const payload = parseWsPayload('!miniTicker@arr', [
      { e: '24hrMiniTicker', E: 1, s: 'BTCUSDT', c: '61000', o: '60000', h: '61500', l: '59500', v: '1000', q: '61000000' },
    ]);
    expect(Array.isArray(payload)).toBe(true);
    expect((payload as { s: string }[])[0]!.s).toBe('BTCUSDT');
  });

  it('parses the aggregate !ticker_1h@arr rolling-window payload as an array', () => {
    const payload = parseWsPayload('!ticker_1h@arr', [
      { e: '1hTicker', E: 1, s: 'BTCUSDT', p: '60000', P: '1', o: '60000', h: '61500', l: '59500', c: '61000', v: '1000', q: '61000000', O: 1, C: 2 },
    ]);
    expect(Array.isArray(payload)).toBe(true);
    expect((payload as { s: string }[])[0]!.s).toBe('BTCUSDT');
  });

  it('still parses a per-symbol @ticker payload as a single object', () => {
    const payload = parseWsPayload('btcusdt@ticker', {
      e: '24hrTicker', E: 1, s: 'BTCUSDT', p: '60000', P: '1', c: '61000', o: '60000', h: '61500', l: '59500', v: '1000', q: '61000000',
    });
    expect(Array.isArray(payload)).toBe(false);
    expect(payload).toMatchObject({ e: '24hrTicker', s: 'BTCUSDT', q: 61_000_000 });
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

  it('parses a tradingSession transition event with ps + ns fields', () => {
    // Binance emits a transition payload when the session changes phase.
    // `ps` is the previous phase, `ns` is the next phase — tightened schema
    // requires the same enum as `phase` for both.
    const payload = parseWsPayload('tradingSession', {
      e: 'tradingSession',
      E: 2,
      phase: 'PRE_MARKET',
      ps: 'CLOSED',
      ns: 'OPEN',
      openTime: 3,
      closeTime: 4,
      session: 'PRE_MARKET',
    });
    expect(payload).toMatchObject({ e: 'tradingSession', phase: 'PRE_MARKET', ps: 'CLOSED', ns: 'OPEN' });
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
