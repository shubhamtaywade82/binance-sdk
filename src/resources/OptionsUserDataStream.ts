import { HttpClient } from '../client/HttpClient.js';

/**
 * Options user-data-stream lifecycle: create/keepAlive/close the listenKey
 * used to subscribe to options account & order updates over WebSocket.
 */
export class OptionsUserDataStream {
  constructor(private readonly http: HttpClient) {}

  /** Create an options listenKey. `POST /eapi/v1/listenKey` (API-KEY). */
  async createListenKey(): Promise<{ listenKey: string }> {
    return this.http.post('/listenKey', undefined, 'apiKey');
  }

  /** Extend the listenKey validity (30-minute TTL). `PUT /eapi/v1/listenKey` (API-KEY). */
  async keepAliveListenKey(): Promise<Record<string, unknown>> {
    return this.http.put('/listenKey', undefined, 'apiKey');
  }

  /** Revoke the listenKey. `DELETE /eapi/v1/listenKey` (API-KEY). */
  async closeListenKey(): Promise<Record<string, unknown>> {
    return this.http.delete('/listenKey', undefined, 'apiKey');
  }
}
