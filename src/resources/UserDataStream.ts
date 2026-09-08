import { HttpClient } from '../client/HttpClient.js';
import { ListenKey, ListenKeySchema } from '../types/userdata.types.js';

export class UserDataStream {
  constructor(private readonly http: HttpClient) {}

  async createListenKey(): Promise<ListenKey> {
    return ListenKeySchema.parse(await this.http.post('/fapi/v1/listenKey', undefined, 'apiKey'));
  }

  async keepAliveListenKey(): Promise<Record<string, unknown>> {
    return this.http.put('/fapi/v1/listenKey', undefined, 'apiKey', { retryMutation: 'always' });
  }

  async closeListenKey(): Promise<Record<string, unknown>> {
    return this.http.delete('/fapi/v1/listenKey', undefined, 'apiKey');
  }
}
