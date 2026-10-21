import { HttpClient } from '../client/HttpClient.js';
import {
  OptionsBill,
  OptionsBillResponseSchema,
  OptionsCommission,
  OptionsCommissionSchema,
  OptionsExerciseRecord,
  OptionsExerciseRecordResponseSchema,
  OptionsMarginAccount,
  OptionsMarginAccountSchema,
  OptionsPosition,
  OptionsPositionResponseSchema,
  OptionsUserTrade,
  OptionsUserTradesResponseSchema,
} from '../types/options.types.js';

/**
 * Binance Options account / history — signed endpoints on the eapi host.
 * Paths are canonical (`/eapi/v1/*`).
 */
export class OptionsAccount {
  constructor(private readonly http: HttpClient) {}

  /** Account margin details for the Options product. `GET /eapi/v1/marginAccount` (SIGNED). */
  async marginAccount(underlying?: string): Promise<OptionsMarginAccount> {
    const params = underlying ? { underlying } : undefined;
    return OptionsMarginAccountSchema.parse(await this.http.get('/eapi/v1/marginAccount', params, 'signed'));
  }

  /** Account funding-asset bill (transaction history). `GET /eapi/v1/bill` (SIGNED). */
  async bill(options: {
    currency?: string;
    recordId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsBill[]> {
    return OptionsBillResponseSchema.parse(await this.http.get('/eapi/v1/bill', options, 'signed'));
  }

  /** Current options positions. `GET /eapi/v1/position` (SIGNED). */
  async position(symbol?: string): Promise<OptionsPosition[]> {
    const params = symbol ? { symbol } : undefined;
    return OptionsPositionResponseSchema.parse(await this.http.get('/eapi/v1/position', params, 'signed'));
  }

  /** User trade history for options. `GET /eapi/v1/userTrades` (SIGNED). */
  async userTrades(options: {
    symbol: string;
    fromId?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsUserTrade[]> {
    return OptionsUserTradesResponseSchema.parse(await this.http.get('/eapi/v1/userTrades', options, 'signed'));
  }

  /** User commission rate for an options symbol. `GET /eapi/v1/commission` (SIGNED). */
  async commission(symbol: string): Promise<OptionsCommission> {
    return OptionsCommissionSchema.parse(await this.http.get('/eapi/v1/commission', { symbol }, 'signed'));
  }

  /** Exercise record (latest settle records per symbol). `GET /eapi/v1/exerciseRecord` (SIGNED). */
  async exerciseRecord(options: {
    symbol?: string;
    expDate?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsExerciseRecord[]> {
    return OptionsExerciseRecordResponseSchema.parse(await this.http.get('/eapi/v1/exerciseRecord', options, 'signed'));
  }

  /** Exercise history (longer-range settle records). `GET /eapi/v1/exerciseHistory` (SIGNED). */
  async exerciseHistory(options: {
    underlying?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<OptionsExerciseRecord[]> {
    return OptionsExerciseRecordResponseSchema.parse(await this.http.get('/eapi/v1/exerciseHistory', options, 'signed'));
  }
}
