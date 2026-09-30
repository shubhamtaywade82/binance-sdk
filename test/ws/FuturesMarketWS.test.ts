import { describe, expect, it } from 'vitest';
import { FuturesMarketWS } from '../../src/ws/FuturesMarketWS.js';

describe('FuturesMarketWS', () => {
  it('builds correct stream names', () => {
    const ws = new FuturesMarketWS();
    expect(ws.kline('SOLUSDT', '5m')).toBe('solusdt@kline_5m');
    expect(ws.aggTrade('SOLUSDT')).toBe('solusdt@aggTrade');
    expect(ws.trade('SOLUSDT')).toBe('solusdt@trade');
    expect(ws.depth('SOLUSDT')).toBe('solusdt@depth20');
    expect(ws.depth('SOLUSDT', 5)).toBe('solusdt@depth5');
    expect(ws.depthDiff('SOLUSDT')).toBe('solusdt@depth');
    expect(ws.depthDiffSpeed('SOLUSDT', '500ms')).toBe('solusdt@depth@500ms');
    expect(ws.depthDiffSpeed('SOLUSDT', '100ms')).toBe('solusdt@depth@100ms');
    expect(ws.ticker('SOLUSDT')).toBe('solusdt@ticker');
    // Binance's USDⓈ-M continuous-kline stream format is
    //   `<symbol>_<contractType>@continuousKline_<interval>`
    // not `<symbol>@continuousKline_<contractType>_<interval>`.
    expect(ws.continuousKline('SOLUSDT', 'perpetual', '5m')).toBe('solusdt_perpetual@continuousKline_5m');
    expect(ws.continuousKline('SOLUSDT', 'current_quarter', '1h')).toBe(
      'solusdt_current_quarter@continuousKline_1h',
    );
    expect(ws.rollingWindowTicker('SOLUSDT', '4h')).toBe('solusdt@ticker_4h');
    expect(ws.allRollingWindowTickers('1h')).toBe('!ticker_1h@arr');
    expect(ws.allRollingWindowTickers('1d')).toBe('!ticker_1d@arr');
    expect(ws.allMarketTickers()).toBe('!ticker@arr');
    expect(ws.allBookTickers()).toBe('!bookTicker');
    expect(ws.markPrice('SOLUSDT')).toBe('solusdt@markPrice@3s');
    expect(ws.markPrice('SOLUSDT', '1s')).toBe('solusdt@markPrice@1s');
    expect(ws.allMarkPrices()).toBe('!markPrice@arr');
    expect(ws.allMarkPrices1s()).toBe('!markPrice@arr@1s');
    expect(ws.liquidationOrder('SOLUSDT')).toBe('solusdt@forceOrder');
    expect(ws.allLiquidationOrders()).toBe('!forceOrder@arr');
    expect(ws.compositeIndex('SOLUSDT')).toBe('solusdt@compositeIndex');
    expect(ws.assetIndex('SOLUSDT')).toBe('solusdt@assetIndex');
    expect(ws.allAssetIndices()).toBe('!assetIndex@arr');
    expect(ws.bookTicker('SOLUSDT')).toBe('solusdt@bookTicker');
    // New 2026 USDⓈ-M streams.
    expect(ws.contractInfo()).toBe('!contractInfo');
    expect(ws.rpiDepth('SOLUSDT')).toBe('solusdt@rpiDepth@500ms');
    expect(ws.tradingSession()).toBe('tradingSession');
    ws.close();
  });

  it('defaults to the new 2026 USDⓈ-M market-stream URL path (/market/stream)', () => {
    // The legacy `wss://fstream.binance.com/stream` host is being shut down on
    // April 23, 2026; the SDK must default to the new `/market/stream` path.
    const ws = new FuturesMarketWS();
    expect((ws as unknown as { baseStreamUrl: string }).baseStreamUrl).toBe(
      'wss://fstream.binance.com/market/stream',
    );
    ws.close();
  });
});
