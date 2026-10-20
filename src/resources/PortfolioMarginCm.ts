import { HttpClient } from '../client/HttpClient.js';

/**
 * Portfolio Margin CM Futures sub-surface — COIN-M account, balance, order,
 * and configuration endpoints under `/papi/v1/cm/*`. Mirror of the
 * non-portfolio `/dapi/v1/*` endpoints but routed through PM-mode accounting.
 */
export class PortfolioMarginCm {
  constructor(private readonly http: HttpClient) {}

  /** CM account summary in PM mode. `GET /papi/v1/cm/account` (SIGNED). */
  async account(): Promise<Record<string, unknown>> {
    return this.http.get('/cm/account', undefined, 'signed');
  }

  /** CM position risk. `GET /papi/v1/cm/positionRisk` (SIGNED). */
  async positionRisk(options?: { symbol?: string; pair?: string }): Promise<unknown[]> {
    return this.http.get('/cm/positionRisk', options ?? {}, 'signed');
  }

  /** CM position mode. `GET /papi/v1/cm/positionSide/dual` (SIGNED). */
  async positionMode(): Promise<Record<string, unknown>> {
    return this.http.get('/cm/positionSide/dual', undefined, 'signed');
  }

  /** Set CM position mode. `POST /papi/v1/cm/positionSide/dual` (SIGNED). */
  async setPositionMode(dualSidePosition: boolean): Promise<Record<string, unknown>> {
    return this.http.post('/cm/positionSide/dual', { dualSidePosition }, 'signed');
  }

  /** CM balance. `GET /papi/v1/cm/balance` (SIGNED). */
  async balance(): Promise<unknown[]> {
    return this.http.get('/cm/balance', undefined, 'signed');
  }

  /** CM income history. `GET /papi/v1/cm/income` (SIGNED). */
  async income(options: { symbol?: string; incomeType?: string; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/cm/income', options, 'signed');
  }

  /** CM leverage brackets. `GET /papi/v1/cm/leverageBracket` (SIGNED). */
  async leverageBracket(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/cm/leverageBracket', params, 'signed');
  }

  /** CM commission rate. `GET /papi/v1/cm/commissionRate` (SIGNED). */
  async commissionRate(symbol: string): Promise<Record<string, unknown>> {
    return this.http.get('/cm/commissionRate', { symbol }, 'signed');
  }

  /** Query a single currently-active CM order. `GET /papi/v1/cm/openOrder` (SIGNED). */
  async openOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<Record<string, unknown>> {
    return this.http.get('/cm/openOrder', { symbol, ...options }, 'signed');
  }

  /** All currently-active CM orders. `GET /papi/v1/cm/openOrders` (SIGNED). */
  async openOrders(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/cm/openOrders', params, 'signed');
  }

  /** All CM orders (active + historical). `GET /papi/v1/cm/allOrders` (SIGNED). */
  async allOrders(options: { symbol: string; orderId?: number; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/cm/allOrders', options, 'signed');
  }

  /** Place a CM order. `POST /papi/v1/cm/order` (SIGNED). */
  async placeOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.post('/cm/order', params, 'signed');
  }

  /** Modify a CM order. `PUT /papi/v1/cm/order` (SIGNED). */
  async modifyOrder(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.http.put('/cm/order', params, 'signed');
  }

  /** Cancel a CM order. `DELETE /papi/v1/cm/order` (SIGNED). */
  async cancelOrder(symbol: string, options?: { orderId?: number; origClientOrderId?: string }): Promise<Record<string, unknown>> {
    return this.http.delete('/cm/order', { symbol, ...options }, 'signed');
  }

  /** Cancel all open CM orders for a symbol. `DELETE /papi/v1/cm/allOpenOrders` (SIGNED). */
  async cancelAllOpenOrders(symbol: string): Promise<Record<string, unknown>> {
    return this.http.delete('/cm/allOpenOrders', { symbol }, 'signed');
  }

  /** Place up to 5 CM orders in a single batch. `POST /papi/v1/cm/batchOrders` (SIGNED). */
  async batchOrders(batchOrders: Record<string, unknown>[]): Promise<unknown[]> {
    return this.http.post('/cm/batchOrders', { batchOrders: JSON.stringify(batchOrders) }, 'signed');
  }

  /** Cancel up to 5 CM orders in a single batch. `DELETE /papi/v1/cm/batchOrders` (SIGNED). */
  async cancelBatchOrders(symbol: string, orderIdList?: number[], origClientOrderIdList?: string[]): Promise<unknown[]> {
    const params: Record<string, unknown> = { symbol };
    if (orderIdList?.length) params.orderIdList = JSON.stringify(orderIdList);
    if (origClientOrderIdList?.length) params.origClientOrderIdList = JSON.stringify(origClientOrderIdList);
    return this.http.delete('/cm/batchOrders', params, 'signed');
  }

  /** Auto-cancel countdown for CM. `POST /papi/v1/cm/countdownCancelAll` (SIGNED). */
  async countdownCancelAll(symbol: string, countdownTime: number): Promise<Record<string, unknown>> {
    return this.http.post('/cm/countdownCancelAll', { symbol, countdownTime }, 'signed');
  }

  /** Set CM leverage. `POST /papi/v1/cm/leverage` (SIGNED). */
  async setLeverage(symbol: string, leverage: number, marginType?: number): Promise<Record<string, unknown>> {
    return this.http.post('/cm/leverage', { symbol, leverage, marginType }, 'signed');
  }

  /** Set CM margin type. `POST /papi/v1/cm/marginType` (SIGNED). */
  async setMarginType(symbol: string, marginType: 'ISOLATED' | 'CROSSED'): Promise<Record<string, unknown>> {
    return this.http.post('/cm/marginType', { symbol, marginType }, 'signed');
  }

  /** Modify CM position margin. `POST /papi/v1/cm/positionMargin` (SIGNED). */
  async modifyPositionMargin(symbol: string, amount: number, type: number): Promise<Record<string, unknown>> {
    return this.http.post('/cm/positionMargin', { symbol, amount, type }, 'signed');
  }

  /** CM position margin history. `GET /papi/v1/cm/positionMargin/history` (SIGNED). */
  async positionMarginHistory(options: { symbol: string; type?: number; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/cm/positionMargin/history', options, 'signed');
  }

  /** CM user trades. `GET /papi/v1/cm/userTrades` (SIGNED). */
  async userTrades(options: { symbol: string; startTime?: number; endTime?: number; fromId?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/cm/userTrades', options, 'signed');
  }

  /** CM ADL quantile. `GET /papi/v1/cm/adlQuantile` (SIGNED). */
  async adlQuantile(symbol?: string): Promise<unknown[]> {
    const params = symbol ? { symbol } : undefined;
    return this.http.get('/cm/adlQuantile', params, 'signed');
  }

  /** CM force-orders history. `GET /papi/v1/cm/forceOrders` (SIGNED). */
  async forceOrders(options?: { symbol?: string; autoCloseType?: 'LIQUIDATION' | 'ADL'; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/cm/forceOrders', options ?? {}, 'signed');
  }

  /** CM funding rate. `GET /papi/v1/cm/fundingRate` (SIGNED). */
  async fundingRate(options: { symbol: string; startTime?: number; endTime?: number; limit?: number }): Promise<unknown[]> {
    return this.http.get('/cm/fundingRate', options, 'signed');
  }

  /** CM open interest. `GET /papi/v1/cm/openInterest` (SIGNED). */
  async openInterest(symbol: string): Promise<Record<string, unknown>> {
    return this.http.get('/cm/openInterest', { symbol }, 'signed');
  }

  /** CM open interest history. `GET /papi/v1/cm/openInterestHist` (SIGNED). */
  async openInterestHist(options: { pair: string; contractType: string; period: string; limit?: number }): Promise<unknown[]> {
    return this.http.get('/cm/openInterestHist', options, 'signed');
  }
}
