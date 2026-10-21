import { HttpClient } from '../client/HttpClient.js';
import { PmListenKey, PmListenKeySchema } from '../types/portfolio.types.js';

/**
 * Portfolio Margin listen-key lifecycle. The PM listenKey subscribes to
 * UM/CM/margin/portfolio user-data events over a single stream.
 */
export class PortfolioMarginUserDataStream {
  constructor(private readonly http: HttpClient) {}

  /** Create the PM listenKey. `POST /papi/v1/listenKey` (API-KEY). */
  async createListenKey(): Promise<PmListenKey> {
    return PmListenKeySchema.parse(await this.http.post('/papi/v1/listenKey', undefined, 'apiKey'));
  }

  /** Extend the PM listenKey validity (30-minute TTL). `PUT /papi/v1/listenKey` (API-KEY). */
  async keepAliveListenKey(): Promise<Record<string, unknown>> {
    return this.http.put('/papi/v1/listenKey', undefined, 'apiKey');
  }

  /** Revoke the PM listenKey. `DELETE /papi/v1/listenKey` (API-KEY). */
  async closeListenKey(): Promise<Record<string, unknown>> {
    return this.http.delete('/papi/v1/listenKey', undefined, 'apiKey');
  }
}
