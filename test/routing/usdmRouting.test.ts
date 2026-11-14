import { describe, expect, it } from 'vitest';
import { routeUsdmStream, streamChannel, usdmUserDataFamily } from '../../src/ws/streamRouter.js';
import { routeFuturesOrderType } from '../../src/preflight/orderRouting.js';

describe('routeUsdmStream', () => {
  it('routes depth streams to /public (verified: streams=btcusdt@depth on /public/stream)', () => {
    expect(routeUsdmStream('btcusdt@depth')).toBe('public');
    expect(routeUsdmStream('btcusdt@depth@100ms')).toBe('public');
    expect(routeUsdmStream('bnbusdt@depth5@100ms')).toBe('public');
    expect(routeUsdmStream('bnbusdt@depth20')).toBe('public');
  });

  it('routes book tickers, rpi depth, and contract info to /public', () => {
    expect(routeUsdmStream('!bookTicker')).toBe('public');
    expect(routeUsdmStream('btcusdt@bookTicker')).toBe('public');
    expect(routeUsdmStream('btcusdt@rpiDepth@500ms')).toBe('public');
    expect(routeUsdmStream('!contractInfo')).toBe('public');
  });

  it('routes trades, marks, klines, tickers, and liquidations to /market', () => {
    expect(routeUsdmStream('btcusdt@aggTrade')).toBe('market');
    expect(routeUsdmStream('btcusdt@markPrice@1s')).toBe('market');
    expect(routeUsdmStream('btcusdt@kline_1m')).toBe('market');
    expect(routeUsdmStream('btcusdt@ticker')).toBe('market');
    expect(routeUsdmStream('!ticker@arr')).toBe('market');
    expect(routeUsdmStream('!miniTicker@arr')).toBe('market');
    expect(routeUsdmStream('btcusdt@forceOrder')).toBe('market');
  });

  it('throws on an unknown channel instead of guessing a base', () => {
    expect(() => routeUsdmStream('btcusdt@someNewChannel')).toThrow(RangeError);
  });

  it('extracts the channel for both symbol and all-market stream forms', () => {
    expect(streamChannel('btcusdt@depth5@100ms')).toBe('depth5');
    expect(streamChannel('!ticker@arr')).toBe('ticker');
    expect(streamChannel('!bookTicker')).toBe('bookTicker');
  });

  it('user data is always the private family', () => {
    expect(usdmUserDataFamily()).toBe('private');
  });
});

describe('routeFuturesOrderType', () => {
  it('sends conditional types to the algo endpoint, including the verified TRAILING_STOP_MARKET', () => {
    for (const type of ['STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET']) {
      expect(routeFuturesOrderType(type)).toBe('algo');
    }
  });

  it('keeps plain order types on the order endpoint', () => {
    for (const type of ['LIMIT', 'MARKET']) {
      expect(routeFuturesOrderType(type)).toBe('order');
    }
  });
});
