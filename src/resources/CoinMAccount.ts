import { HttpClient } from '../client/HttpClient.js';
import {
  CoinMAccountInfo,
  CoinMAccountSchema,
  CoinMBalance,
  CoinMBalanceResponseSchema,
  CoinMCommissionRate,
  CoinMCommissionRateSchema,
  CoinMIncome,
  CoinMIncomeHistoryResponseSchema,
  CoinMLeverageBracket,
  CoinMLeverageBracketResponseSchema,
  CoinMPositionMode,
  CoinMPositionModeSchema,
  CoinMPositionRisk,
  CoinMPositionRiskResponseSchema,
  CoinMUserTrade,
  CoinMUserTradesResponseSchema,
} from '../types/coinm.types.js';

export class CoinMAccount {
  constructor(private readonly http: HttpClient) {}

  async balance(): Promise<CoinMBalance[]> {
    return CoinMBalanceResponseSchema.parse(await this.http.get('/dapi/v1/balance', undefined, 'signed'));
  }

  async account(): Promise<CoinMAccountInfo> {
    return CoinMAccountSchema.parse(await this.http.get('/dapi/v1/account', undefined, 'signed'));
  }

  async positionRisk(options?: { symbol?: string; pair?: string }): Promise<CoinMPositionRisk[]> {
    return CoinMPositionRiskResponseSchema.parse(
      await this.http.get('/dapi/v1/positionRisk', options, 'signed'),
    );
  }

  async incomeHistory(options?: {
    symbol?: string;
    incomeType?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<CoinMIncome[]> {
    return CoinMIncomeHistoryResponseSchema.parse(await this.http.get('/dapi/v1/income', options, 'signed'));
  }

  async userTrades(options?: {
    symbol?: string;
    pair?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    fromId?: number;
  }): Promise<CoinMUserTrade[]> {
    return CoinMUserTradesResponseSchema.parse(
      await this.http.get('/dapi/v1/userTrades', options, 'signed'),
    );
  }

  async leverageBrackets(symbol?: string): Promise<{ symbol?: string; pair?: string; brackets: CoinMLeverageBracket[] }[]> {
    const params = symbol ? { symbol } : undefined;
    return CoinMLeverageBracketResponseSchema.parse(
      await this.http.get('/dapi/v1/leverageBracket', params, 'signed'),
    );
  }

  async commissionRate(symbol: string): Promise<CoinMCommissionRate> {
    return CoinMCommissionRateSchema.parse(
      await this.http.get('/dapi/v1/commissionRate', { symbol }, 'signed'),
    );
  }

  async positionMode(): Promise<CoinMPositionMode> {
    return CoinMPositionModeSchema.parse(
      await this.http.get('/dapi/v1/positionSide/dual', undefined, 'signed'),
    );
  }

  async setPositionMode(dualSidePosition: boolean): Promise<Record<string, unknown>> {
    return this.http.post('/dapi/v1/positionSide/dual', { dualSidePosition }, 'signed');
  }
}
