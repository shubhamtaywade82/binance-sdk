import { HttpClient } from '../client/HttpClient.js';
import { ListenKey, ListenKeySchema } from '../types/userdata.types.js';

export class CoinMUserDataStream {
  constructor(private readonly http: HttpClient) {}

  async createListenKey(): Promise<ListenKey> {
    return ListenKeySchema.parse(await this.http.post('/dapi/v1/listenKey', undefined, 'apiKey'));
  }

  async keepAliveListenKey(): Promise<Record<string, unknown>> {
    return this.http.put('/dapi/v1/listenKey', undefined, 'apiKey');
  }

  async closeListenKey(): Promise<Record<string, unknown>> {
    return this.http.delete('/dapi/v1/listenKey', undefined, 'apiKey');
  }
}
