import { HttpClient } from '../client/HttpClient.js';
import { MarketDataBase } from './MarketDataBase.js';
import {
  Kline,
  KlinesResponseSchema,
  KlineInterval,
  TickerPrice,
  TickerPriceSchema,
  BookTicker,
  BookTickerSchema,
  DepthSnapshot,
  DepthSnapshotSchema,
  ExchangeInfo,
  ExchangeInfoSchema,
} from '../types/market.types.js';

export class FuturesMarket extends MarketDataBase {
  private readonly rootHttp: HttpClient;

  constructor(http?: HttpClient, restRoot?: string) {
    super(http ?? new HttpClient({ baseURL: 'https://fapi.binance.com/fapi/v1' }));
    this.rootHttp = new HttpClient({ baseURL: restRoot ?? 'https://fapi.binance.com' });
  }

  async continuousKlines(
    pair: string,
    contractType: 'perpetual' | 'current_quarter' | 'next_quarter',
    interval: KlineInterval,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<Kline[]> {
    const data = await this.http.get('/continuousKlines', {
      pair,
      contractType,
      interval,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit ?? 500,
    });
    return KlinesResponseSchema.parse(data);
  }

  async indexPriceKlines(
    pair: string,
    interval: KlineInterval,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<Kline[]> {
    const data = await this.http.get('/indexPriceKlines', {
      pair,
      interval,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit ?? 500,
    });
    return KlinesResponseSchema.parse(data);
  }

  async markPriceKlines(
    symbol: string,
    interval: KlineInterval,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<Kline[]> {
    const data = await this.http.get('/markPriceKlines', {
      symbol,
      interval,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit ?? 500,
    });
    return KlinesResponseSchema.parse(data);
  }

  async premiumIndexKlines(
    symbol: string,
    interval: KlineInterval,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<Kline[]> {
    const data = await this.http.get('/premiumIndexKlines', {
      symbol,
      interval,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit ?? 500,
    });
    return KlinesResponseSchema.parse(data);
  }

  async rpiDepth(symbol: string, limit = 1000): Promise<DepthSnapshot> {
    return DepthSnapshotSchema.parse(await this.http.get('/rpiDepth', { symbol, limit }));
  }

  async tradingDayTicker(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : {};
    return this.http.get('/tradingDayTicker', params);
  }

  /** Trading session schedule — `GET /fapi/v1/tradingSchedule` (public, no parameters). */
  async tradingSchedule(): Promise<unknown> {
    return this.http.get('/tradingSchedule');
  }

  async tickerPriceV2(symbol?: string): Promise<TickerPrice[] | TickerPrice> {
    const params = symbol ? { symbol } : {};
    return TickerPriceSchema.parse(await this.rootHttp.get('/fapi/v2/ticker/price', params));
  }

  async bookTickerV2(symbol?: string): Promise<BookTicker[] | BookTicker> {
    const params = symbol ? { symbol } : {};
    return BookTickerSchema.parse(await this.rootHttp.get('/fapi/v2/ticker/bookTicker', params));
  }

  async instrumentDetails(symbol: string): Promise<ExchangeInfo['symbols'][number]> {
    const info = await ExchangeInfoSchema.parse(await this.http.get('/exchangeInfo'));
    const details = info.symbols.find((s) => s.symbol === symbol);
    if (!details) throw new Error(`Instrument ${symbol} not found`);
    return details;
  }
}
