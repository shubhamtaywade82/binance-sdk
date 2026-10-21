import { HttpClient } from '../client/HttpClient.js';
import { OptionsListenKey, OptionsListenKeySchema } from '../types/options.types.js';

/**
 * Options user-data-stream lifecycle: create/keepAlive/close the listenKey
 * used to subscribe to options account & order updates over WebSocket.
 */
export class OptionsUserDataStream {
  constructor(private readonly http: HttpClient) {}

  /** Create an options listenKey. `POST /eapi/v1/listenKey` (API-KEY). */
  async createListenKey(): Promise<OptionsListenKey> {
    return OptionsListenKeySchema.parse(await this.http.post('/eapi/v1/listenKey', undefined, 'apiKey'));
  }

  /** Extend the listenKey validity (30-minute TTL). `PUT /eapi/v1/listenKey` (API-KEY). */
  async keepAliveListenKey(): Promise<Record<string, unknown>> {
    return this.http.put('/eapi/v1/listenKey', undefined, 'apiKey');
  }

  /** Revoke the listenKey. `DELETE /eapi/v1/listenKey` (API-KEY). */
  async closeListenKey(): Promise<Record<string, unknown>> {
    return this.http.delete('/eapi/v1/listenKey', undefined, 'apiKey');
  }
}
