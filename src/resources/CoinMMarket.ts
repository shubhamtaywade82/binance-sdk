import { HttpClient } from '../client/HttpClient.js';
import { MarketDataBase } from './MarketDataBase.js';
import { FundingRateHistorySchema, FundingRate, OpenInterestSchema, OpenInterest, PremiumIndexSchema, PremiumIndex } from '../types/futures.types.js';
import { Kline, KlineInterval, KlinesResponseSchema } from '../types/market.types.js';
import { CoinMOpenInterestHistEntry, CoinMOpenInterestHistSchema } from '../types/coinm.types.js';

export class CoinMMarket extends MarketDataBase {
  constructor(http?: HttpClient) {
    super(http ?? new HttpClient({ baseURL: 'https://dapi.binance.com/dapi/v1' }));
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

  async premiumIndex(options?: { symbol?: string; pair?: string }): Promise<PremiumIndex[] | PremiumIndex> {
    return PremiumIndexSchema.or(PremiumIndexSchema.array()).parse(
      await this.http.get('/premiumIndex', options),
    );
  }

  async fundingRateHistory(
    symbol: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<FundingRate[]> {
    return FundingRateHistorySchema.parse(await this.http.get('/fundingRate', { symbol, ...options }));
  }

  async openInterest(symbol: string): Promise<OpenInterest> {
    return OpenInterestSchema.parse(await this.http.get('/openInterest', { symbol }));
  }

  async openInterestHist(
    pair: string,
    contractType: 'ALL' | 'CURRENT_QUARTER' | 'NEXT_QUARTER' | 'PERPETUAL',
    period: '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d',
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<CoinMOpenInterestHistEntry[]> {
    return CoinMOpenInterestHistSchema.parse(
      await this.http.get('/openInterestHist', { pair, contractType, period, ...options }),
    );
  }

  /**
   * Index-price constituents for a COIN-M composite index symbol.
   * Endpoint: `GET /dapi/v1/constituents` (PUBLIC).
   */
  async constituents(symbol: string): Promise<unknown> {
    return this.http.get('/constituents', { symbol });
  }

  /**
   * COIN-M funding info — returns the global funding-rate parameters that
   * apply across all COIN-M perpetual contracts.
   * Endpoint: `GET /dapi/v1/fundingInfo` (PUBLIC).
   */
  async fundingInfo(): Promise<unknown[]> {
    return this.http.get('/fundingInfo');
  }

  /**
   * Premium-index klines — historical premium/mark-price kline series for a
   * COIN-M symbol. Endpoint: `GET /dapi/v1/premiumIndexKlines` (PUBLIC).
   */
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
}
