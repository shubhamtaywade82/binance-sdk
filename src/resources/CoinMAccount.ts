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

  // ---------------------------------------------------------------------------
  // Account / reporting endpoints (added to close the COIN-M gap)
  // ---------------------------------------------------------------------------

  /**
   * Get download ID for async COIN-M income history. The user can then poll
   * `getIncomeDownloadStatus(downloadId)` until `status === 'completed'`.
   * Endpoint: `GET /dapi/v1/income/asyn` (SIGNED).
   */
  async requestIncomeDownload(options: { startTime: number; endTime: number }): Promise<Record<string, unknown>> {
    return this.http.get('/dapi/v1/income/asyn', options, 'signed');
  }

  /**
   * Query status of an async COIN-M income download by its `downloadId`.
   * Endpoint: `GET /dapi/v1/income/asyn/id` (SIGNED).
   */
  async getIncomeDownloadStatus(downloadId: string): Promise<Record<string, unknown>> {
    return this.http.get('/dapi/v1/income/asyn/id', { downloadId }, 'signed');
  }

  /**
   * Get download ID for async COIN-M order history.
   * Endpoint: `GET /dapi/v1/order/asyn` (SIGNED).
   */
  async requestOrderDownload(options: {
    symbol?: string;
    startTime: number;
    endTime: number;
  }): Promise<Record<string, unknown>> {
    return this.http.get('/dapi/v1/order/asyn', options, 'signed');
  }

  /**
   * Query status of an async COIN-M order download by its `downloadId`.
   * Endpoint: `GET /dapi/v1/order/asyn/id` (SIGNED).
   */
  async getOrderDownloadStatus(downloadId: string): Promise<Record<string, unknown>> {
    return this.http.get('/dapi/v1/order/asyn/id', { downloadId }, 'signed');
  }

  /**
   * Get download ID for async COIN-M trade history.
   * Endpoint: `GET /dapi/v1/trade/asyn` (SIGNED).
   */
  async requestTradeDownload(options: {
    symbol?: string;
    startTime: number;
    endTime: number;
  }): Promise<Record<string, unknown>> {
    return this.http.get('/dapi/v1/trade/asyn', options, 'signed');
  }

  /**
   * Query status of an async COIN-M trade download by its `downloadId`.
   * Endpoint: `GET /dapi/v1/trade/asyn/id` (SIGNED).
   */
  async getTradeDownloadStatus(downloadId: string): Promise<Record<string, unknown>> {
    return this.http.get('/dapi/v1/trade/asyn/id', { downloadId }, 'signed');
  }

  /**
   * V2 leverage brackets — adds `notionalCoef` / `priceScope` / `targetLeverage`
   * fields used by the COIN-M v2 bracket response.
   * Endpoint: `GET /dapi/v2/leverageBracket` (SIGNED).
   */
  async leverageBracketsV2(symbol?: string): Promise<unknown> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/dapi/v2/leverageBracket', params, 'signed');
  }

  /**
   * Portfolio-margin account info for COIN-M, returning the margin-level
   * summary used by PM-mode accounts. Endpoint: `GET /dapi/v1/pmAccountInfo` (SIGNED).
   * @deprecated Not in Binance's API reference (developers.binance.com, checked 2026-10-24); legacy Portfolio Margin endpoint, use the Portfolio Margin client. Removal planned for the next major version.
   */
  async pmAccountInfo(asset?: string): Promise<Record<string, unknown>> {
    const params = asset ? { asset } : undefined;
    return this.http.get('/dapi/v1/pmAccountInfo', params, 'signed');
  }

  /**
   * COIN-M force-orders history (liquidations / ADL).
   * Endpoint: `GET /dapi/v1/forceOrders` (SIGNED).
   */
  async forceOrders(options?: {
    symbol?: string;
    autoCloseType?: 'LIQUIDATION' | 'ADL';
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get(
      '/dapi/v1/forceOrders',
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

  /**
   * COIN-M position-margin history.
   * Endpoint: `GET /dapi/v1/positionMargin/history` (SIGNED).
   */
  async positionMarginHistory(options: {
    symbol: string;
    type?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<unknown[]> {
    return this.http.get('/dapi/v1/positionMargin/history', options, 'signed');
  }
}
