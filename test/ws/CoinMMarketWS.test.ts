import { describe, expect, it } from 'vitest';
import { CoinMMarketWS } from '../../src/ws/CoinMMarketWS.js';

describe('CoinMMarketWS', () => {
  it('builds correct COIN-M stream names', () => {
    const ws = new CoinMMarketWS();
    expect(ws.kline('BTCUSD_PERP', '15m')).toBe('btcusd_perp@kline_15m');
    expect(ws.continuousKline('BTCUSD', 'perpetual', '1m')).toBe('btcusd_perpetual@continuousKline_1m');
    expect(ws.indexPriceKline('BTCUSD', '1m')).toBe('btcusd@indexPriceKline_1m');
    expect(ws.markPriceKline('BTCUSD_PERP', '1m')).toBe('btcusd_perp@markPriceKline_1m');
    expect(ws.aggTrade('BTCUSD_PERP')).toBe('btcusd_perp@aggTrade');
    expect(ws.trade('BTCUSD_PERP')).toBe('btcusd_perp@trade');
    expect(ws.depth('BTCUSD_PERP')).toBe('btcusd_perp@depth20');
    expect(ws.depth('BTCUSD_PERP', 5)).toBe('btcusd_perp@depth5');
    expect(ws.depthDiff('BTCUSD_PERP')).toBe('btcusd_perp@depth');
    expect(ws.depthDiffSpeed('BTCUSD_PERP', '250ms')).toBe('btcusd_perp@depth@250ms');
    expect(ws.ticker('BTCUSD_PERP')).toBe('btcusd_perp@ticker');
    expect(ws.miniTicker('BTCUSD_PERP')).toBe('btcusd_perp@miniTicker');
    expect(ws.bookTicker('BTCUSD_PERP')).toBe('btcusd_perp@bookTicker');
    expect(ws.markPrice('BTCUSD_PERP')).toBe('btcusd_perp@markPrice@3s');
    expect(ws.markPriceForPair('BTCUSD', '1s')).toBe('btcusd@markPrice@1s');
    expect(ws.liquidationOrder('BTCUSD_PERP')).toBe('btcusd_perp@forceOrder');
    expect(ws.allLiquidationOrders()).toBe('!forceOrder@arr');
    expect(ws.allMarketTickers()).toBe('!ticker@arr');
    expect(ws.allMiniTickers()).toBe('!miniTicker@arr');
    expect(ws.allBookTickers()).toBe('!bookTicker');
    ws.close();
  });
});
