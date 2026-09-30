import { describe, expect, it } from 'vitest';
import { FuturesMarketWS, futuresStreamRoute } from '../../src/ws/FuturesMarketWS.js';

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

  it('builds the 2026 stream additions', () => {
    const ws = new FuturesMarketWS();
    expect(ws.allMarkPrices()).toBe('!markPrice@arr');
    expect(ws.allMarkPrices('3s')).toBe('!markPrice@arr');
    expect(ws.allMarkPrices('1s')).toBe('!markPrice@arr@1s');
    expect(ws.contractInfo()).toBe('!contractInfo');
    expect(ws.rpiDepth('BTCUSDT')).toBe('btcusdt@rpiDepth@500ms');
    expect(ws.tradingSession()).toBe('tradingSession');
    ws.close();
  });

  it('routes order-book streams to /public and everything else to /market', () => {
    for (const s of ['btcusdt@depth', 'btcusdt@depth5', 'btcusdt@depth20@100ms', 'btcusdt@depth@500ms', 'btcusdt@bookTicker', '!bookTicker', 'btcusdt@rpiDepth@500ms']) {
      expect(futuresStreamRoute(s), s).toBe('public');
    }
    for (const s of ['btcusdt@aggTrade', 'btcusdt@trade', 'btcusdt@kline_1m', 'btcusdt@markPrice@1s', '!markPrice@arr@1s', '!ticker@arr', 'btcusdt@miniTicker', '!forceOrder@arr', '!contractInfo', 'tradingSession', 'btcusdt_perpetual@continuousKline_1m', '!assetIndex@arr', 'btcusdt@compositeIndex']) {
      expect(futuresStreamRoute(s), s).toBe('market');
    }
  });

  it('defaults to the /market path and rejects streams that belong to /public', async () => {
    const market = new FuturesMarketWS();
    await expect(market.subscribe(['btcusdt@depth5'])).rejects.toThrow(/not served on the \/market/);
    market.close();
    const pub = new FuturesMarketWS('wss://fstream.binance.com/public/stream');
    await expect(pub.subscribe(['btcusdt@aggTrade'])).rejects.toThrow(/not served on the \/public/);
    pub.close();
  });
});
