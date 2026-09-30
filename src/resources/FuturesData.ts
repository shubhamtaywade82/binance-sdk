import { HttpClient } from '../client/HttpClient.js';
import {
  FundingRate,
  FundingRateHistorySchema,
  LongShortRatioEntry,
  LongShortRatioSchema,
  OpenInterest,
  OpenInterestHistEntry,
  OpenInterestHistSchema,
  OpenInterestSchema,
  PremiumIndex,
  PremiumIndexSchema,
  TakerLongShortRatioEntry,
  TakerLongShortRatioSchema,
} from '../types/futures.types.js';
import type { KlineInterval } from '../types/market.types.js';

export interface FuturesDataEndpoints {
  restFapi?: string;
  restFuturesData?: string;
  apiKey?: string;
  apiSecret?: string;
  recvWindow?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}

export class FuturesData {
  private readonly http: HttpClient;
  private readonly dataHttp: HttpClient;

  constructor(endpoints?: FuturesDataEndpoints) {
    const { restFapi, restFuturesData, ...httpOptions } = endpoints ?? {};
    this.http = new HttpClient({ baseURL: restFapi ?? 'https://fapi.binance.com/fapi/v1', ...httpOptions });
    this.dataHttp = new HttpClient({
      baseURL: restFuturesData ?? 'https://fapi.binance.com/futures/data',
      ...httpOptions,
    });
  }

  async fundingRateHistory(
    symbol: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<FundingRate[]> {
    const data = await this.http.get('/fundingRate', {
      symbol,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit ?? 100,
    });
    return FundingRateHistorySchema.parse(data);
  }

  async premiumIndex(symbol: string): Promise<PremiumIndex> {
    return PremiumIndexSchema.parse(await this.http.get('/premiumIndex', { symbol }));
  }

  async openInterest(symbol: string): Promise<OpenInterest> {
    return OpenInterestSchema.parse(await this.http.get('/openInterest', { symbol }));
  }

  async openInterestHist(symbol: string, period: string, limit = 30): Promise<OpenInterestHistEntry[]> {
    const data = await this.dataHttp.get('/openInterestHist', { symbol, period, limit });
    return OpenInterestHistSchema.parse(data);
  }

  async topLongShortAccountRatio(symbol: string, period: string, limit = 30): Promise<LongShortRatioEntry[]> {
    const data = await this.dataHttp.get('/topLongShortAccountRatio', { symbol, period, limit });
    return LongShortRatioSchema.parse(data);
  }

  async topLongShortPositionRatio(symbol: string, period: string, limit = 30): Promise<LongShortRatioEntry[]> {
    const data = await this.dataHttp.get('/topLongShortPositionRatio', { symbol, period, limit });
    return LongShortRatioSchema.parse(data);
  }

  async globalLongShortAccountRatio(symbol: string, period: string, limit = 30): Promise<LongShortRatioEntry[]> {
    const data = await this.dataHttp.get('/globalLongShortAccountRatio', { symbol, period, limit });
    return LongShortRatioSchema.parse(data);
  }

  async takerLongShortRatio(symbol: string, period: string, limit = 30): Promise<TakerLongShortRatioEntry[]> {
    const data = await this.dataHttp.get('/takerlongshortRatio', { symbol, period, limit });
    return TakerLongShortRatioSchema.parse(data);
  }

  async basis(
    symbol: string,
    period: string,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<unknown[]> {
    return this.dataHttp.get('/basis', {
      symbol,
      period,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit,
    });
  }

  async fundingInfo(): Promise<unknown[]> {
    return this.http.get('/fundingInfo');
  }

  async assetIndex(symbol?: string): Promise<unknown[] | unknown> {
    const params = symbol ? { symbol } : {};
    return this.http.get('/assetIndex', params);
  }

  async compositeIndexInfo(symbol?: string): Promise<unknown> {
    const params = symbol ? { symbol } : {};
    return this.http.get('/indexInfo', params);
  }

  async adlQuantile(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : {};
    return this.http.get('/adlQuantile', params, 'signed');
  }

  async blvtInfo(
    tokenName: string,
    interval: KlineInterval,
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<unknown[]> {
    return this.http.get('/lvtKlines', {
      tokenName,
      interval,
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: options?.limit,
    });
  }

  async indexPriceConstituents(symbol: string): Promise<unknown> {
    return this.http.get('/constituents', { symbol });
  }

  async symbolConfig(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : {};
    return this.http.get('/symbolConfig', params, 'signed');
  }

  async forceOrders(options?: {
    symbol?: string;
    autoCloseType?: 'LIQUIDATION' | 'ADL';
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get(
      '/forceOrders',
      {
        symbol: options?.symbol,
        autoCloseType: options?.autoCloseType,
        startTime: options?.startTime,
        endTime: options?.endTime,
        limit: options?.limit,
      },
      'signed',
    );
  }

  /** Insurance fund balance snapshot — `GET /fapi/v1/insuranceBalance` (public; `symbol` optional). */
  async insuranceFundBalance(options?: { symbol?: string }): Promise<unknown[]> {
    return this.http.get('/insuranceBalance', { symbol: options?.symbol });
  }

  async pmExchangeInfo(): Promise<unknown> {
    return this.http.get('/pmExchangeInfo');
  }

  async delistSchedule(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : {};
    return this.http.get('/delistSchedule', params);
  }

  async symbolAdlRisk(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : {};
    return this.http.get('/symbolAdlRisk', params);
  }

  async deliveryPrice(pair: string): Promise<{ deliveryTime: number; deliveryPrice: number }[]> {
    return this.dataHttp.get('/delivery-price', { pair });
  }
}
