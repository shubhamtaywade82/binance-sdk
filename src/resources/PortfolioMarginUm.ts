import { HttpClient } from '../client/HttpClient.js';

/**
 * Portfolio Margin UM Futures sub-surface — USDⓈ-M account, balance, order,
 * and configuration endpoints under `/papi/v1/um/*`. These mirror the
 * non-portfolio `/fapi/v1/*` endpoints but route through PM-mode accounting.
 */
export class PortfolioMarginUm {
  constructor(private readonly http: HttpClient) {}

  /** UM account summary in PM mode. `GET /papi/v1/um/account` (SIGNED). */
  async account(): Promise<Record<string, unknown>> {
    return this.http.get('/um/account', undefined, 'signed');
  }

  /** UM account summary v2. `GET /papi/v1/um/accountV2` (SIGNED). */
  async accountV2(): Promise<Record<string, unknown>> {
    return this.http.get('/um/accountV2', undefined, 'signed');
  }

  /** UM account summary v3. `GET /papi/v1/um/accountV3` (SIGNED). */
  async accountV3(): Promise<Record<string, unknown>> {
    return this.http.get('/um/accountV3', undefined, 'signed');
  }

  /** UM position risk. `GET /papi/v1/um/positionRisk` (SIGNED). */
  async positionRisk(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/um/positionRisk', params, 'signed');
  }

  /** UM position risk v3. `GET /papi/v1/um/positionRiskV3` (SIGNED). */
  async positionRiskV3(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/um/positionRiskV3', params, 'signed');
  }

  /** UM position mode (hedge vs one-way). `GET /papi/v1/um/positionSide/dual` (SIGNED). */
  async positionMode(): Promise<Record<string, unknown>> {
    return this.http.get('/um/positionSide/dual', undefined, 'signed');
  }

  /** Set UM position mode. `POST /papi/v1/um/positionSide/dual` (SIGNED). */
  async setPositionMode(dualSidePosition: boolean): Promise<Record<string, unknown>> {
    return this.http.post('/um/positionSide/dual', { dualSidePosition }, 'signed');
  }

  /** UM balance v2. `GET /papi/v1/um/balance` (SIGNED). */
  async balance(): Promise<unknown[]> {
    return this.http.get('/um/balance', undefined, 'signed');
  }

  /** UM balance v3. `GET /papi/v1/um/balanceV3` (SIGNED). */
  async balanceV3(): Promise<unknown[]> {
    return this.http.get('/um/balanceV3', undefined, 'signed');
  }

  /** UM income history. `GET /papi/v1/um/income` (SIGNED). */
  async income(options: { symbol?: string; incomeType?: string; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/um/income', options, 'signed');
  }

  /** UM leverage brackets. `GET /papi/v1/um/leverageBracket` (SIGNED). */
  async leverageBracket(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/um/leverageBracket', params, 'signed');
  }

  /** UM commission rate. `GET /papi/v1/um/commissionRate` (SIGNED). */
  async commissionRate(symbol: string): Promise<Record<string, unknown>> {
    return this.http.get('/um/commissionRate', { symbol }, 'signed');
  }

  /** UM funding rate history. `GET /papi/v1/um/fundingRate` (SIGNED). */
  async fundingRate(options: { symbol: string; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/um/fundingRate', options, 'signed');
  }

  /** UM open interest. `GET /papi/v1/um/openInterest` (SIGNED). */
  async openInterest(symbol: string): Promise<Record<string, unknown>> {
    return this.http.get('/um/openInterest', { symbol }, 'signed');
  }

  /** Query a single currently-active UM order. `GET /papi/v1/um/openOrder` (SIGNED). */
  async openOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<Record<string, unknown>> {
    return this.http.get('/um/openOrder', { symbol, ...options }, 'signed');
  }

  /** All currently-active UM orders. `GET /papi/v1/um/openOrders` (SIGNED). */
  async openOrders(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/um/openOrders', params, 'signed');
  }

  /** All UM orders (active + historical). `GET /papi/v1/um/allOrders` (SIGNED). */
  async allOrders(options: { symbol: string; orderId?: number; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/um/allOrders', options, 'signed');
  }

  /** Place a UM order. `POST /papi/v1/um/order` (SIGNED). */
  async placeOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/um/order', params, 'signed');
  }

  /** Modify a UM order. `PUT /papi/v1/um/order` (SIGNED). */
  async modifyOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.put('/um/order', params, 'signed');
  }

  /** Cancel a UM order. `DELETE /papi/v1/um/order` (SIGNED). */
  async cancelOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<Record<string, unknown>> {
    return this.http.delete('/um/order', { symbol, ...options }, 'signed');
  }

  /** Cancel all open UM orders for a symbol. `DELETE /papi/v1/um/allOpenOrders` (SIGNED). */
  async cancelAllOpenOrders(symbol: string): Promise<Record<string, unknown>> {
    return this.http.delete('/um/allOpenOrders', { symbol }, 'signed');
  }

  /** Place up to 5 UM orders in a single batch. `POST /papi/v1/um/batchOrders` (SIGNED). */
  async batchOrders(batchOrders: Record<string, unknown>[]): Promise<unknown[]> {
    return this.http.post('/um/batchOrders', { batchOrders: JSON.stringify(batchOrders) }, 'signed');
  }

  /** Cancel up to 5 UM orders in a single batch. `DELETE /papi/v1/um/batchOrders` (SIGNED). */
  async cancelBatchOrders(symbol: string, orderIdList?: number[], origClientOrderIdList?: string[]): Promise<unknown[]> {
    const params: Record<string, unknown> = { symbol };
    if (orderIdList?.length) params.orderIdList = JSON.stringify(orderIdList);
    if (origClientOrderIdList?.length) params.origClientOrderIdList = JSON.stringify(origClientOrderIdList);
    return this.http.delete('/um/batchOrders', params, 'signed');
  }

  /** Auto-cancel countdown for UM. `POST /papi/v1/um/countdownCancelAll` (SIGNED). */
  async countdownCancelAll(symbol: string, countdownTime: number): Promise<Record<string, unknown>> {
    return this.http.post('/um/countdownCancelAll', { symbol, countdownTime }, 'signed');
  }

  /** Set UM leverage. `POST /papi/v1/um/leverage` (SIGNED). */
  async setLeverage(symbol: string, leverage: number): Promise<Record<string, unknown>> {
    return this.http.post('/um/leverage', { symbol, leverage }, 'signed');
  }

  /** Set UM margin type. `POST /papi/v1/um/marginType` (SIGNED). */
  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<Record<string, unknown>> {
    return this.http.post('/um/marginType', { symbol, marginType }, 'signed');
  }

  /** Modify UM position margin. `POST /papi/v1/um/positionMargin` (SIGNED). */
  async modifyPositionMargin(symbol: string, amount: number, type: number): Promise<Record<string, unknown>> {
    return this.http.post('/um/positionMargin', { symbol, amount, type }, 'signed');
  }

  /** UM position margin history. `GET /papi/v1/um/positionMargin/history` (SIGNED). */
  async positionMarginHistory(options: { symbol: string; type?: number; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/um/positionMargin/history', options, 'signed');
  }

  /** Request async UM trade download. `GET /papi/v1/um/trade/asyn` (SIGNED). */
  async requestTradeDownload(options: { startTime: number; endTime: number }): Promise<Record<string, unknown>> {
    return this.http.get('/um/trade/asyn', options, 'signed');
  }

  /** Query UM trade download status. `GET /papi/v1/um/trade/asyn/id` (SIGNED). */
  async getTradeDownloadStatus(downloadId: string): Promise<Record<string, unknown>> {
    return this.http.get('/um/trade/asyn/id', { downloadId }, 'signed');
  }

  /** Request async UM order download. `GET /papi/v1/um/order/asyn` (SIGNED). */
  async requestOrderDownload(options: { startTime: number; endTime: number }): Promise<Record<string, unknown>> {
    return this.http.get('/um/order/asyn', options, 'signed');
  }

  /** Query UM order download status. `GET /papi/v1/um/order/asyn/id` (SIGNED). */
  async getOrderDownloadStatus(downloadId: string): Promise<Record<string, unknown>> {
    return this.http.get('/um/order/asyn/id', { downloadId }, 'signed');
  }

  /** Request async UM income download. `GET /papi/v1/um/income/asyn` (SIGNED). */
  async requestIncomeDownload(options: { startTime: number; endTime: number }): Promise<Record<string, unknown>> {
    return this.http.get('/um/income/asyn', options, 'signed');
  }

  /** Query UM income download status. `GET /papi/v1/um/income/asyn/id` (SIGNED). */
  async getIncomeDownloadStatus(downloadId: string): Promise<Record<string, unknown>> {
    return this.http.get('/um/income/asyn/id', { downloadId }, 'signed');
  }

  /** UM user trades. `GET /papi/v1/um/userTrades` (SIGNED). */
  async userTrades(options: { symbol: string; startTime?: number; endTime?: number; fromId?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/um/userTrades', options, 'signed');
  }

  /** UM ADL quantile. `GET /papi/v1/um/adlQuantile` (SIGNED). */
  async adlQuantile(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/um/adlQuantile', params, 'signed');
  }

  /** UM force-orders history. `GET /papi/v1/um/forceOrders` (SIGNED). */
  async forceOrders(options?: { symbol?: string; autoCloseType?: 'LIQUIDATION' | 'ADL'; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/um/forceOrders', options ?? {}, 'signed');
  }

  /** UM fee-burn status (BNB commission discount). `GET /papi/v1/um/feeBurn` (SIGNED). */
  async feeBurnStatus(): Promise<Record<string, unknown>> {
    return this.http.get('/um/feeBurn', undefined, 'signed');
  }

  /** Toggle UM fee burn. `POST /papi/v1/um/feeBurn` (SIGNED). */
  async setFeeBurn(feeBurn: boolean): Promise<Record<string, unknown>> {
    return this.http.post('/um/feeBurn', { feeBurn }, 'signed');
  }

  /** UM API trading status. `GET /papi/v1/um/apiTradingStatus` (SIGNED). */
  async apiTradingStatus(): Promise<Record<string, unknown>> {
    return this.http.get('/um/apiTradingStatus', undefined, 'signed');
  }

  /** UM account config. `GET /papi/v1/um/accountConfig` (SIGNED). */
  async accountConfig(): Promise<Record<string, unknown>> {
    return this.http.get('/um/accountConfig', undefined, 'signed');
  }

  /** UM multi-assets margin mode. `GET /papi/v1/um/multiAssetsMargin` (SIGNED). */
  async multiAssetsMargin(): Promise<Record<string, unknown>> {
    return this.http.get('/um/multiAssetsMargin', undefined, 'signed');
  }

  /** Set UM multi-assets margin mode. `POST /papi/v1/um/multiAssetsMargin` (SIGNED). */
  async setMultiAssetsMargin(multiAssetsMargin: boolean): Promise<Record<string, unknown>> {
    return this.http.post('/um/multiAssetsMargin', { multiAssetsMargin }, 'signed');
  }
}
