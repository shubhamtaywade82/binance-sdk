import { HttpClient } from '../client/HttpClient.js';
import { ListenKey, ListenKeySchema } from '../types/userdata.types.js';

export class SpotUserDataStream {
  constructor(private readonly http: HttpClient) {}

  async createListenKey(): Promise<ListenKey> {
    return ListenKeySchema.parse(await this.http.post('/userDataStream', undefined, 'apiKey'));
  }

  async keepAliveListenKey(): Promise<Record<string, unknown>> {
    return this.http.put('/userDataStream', undefined, 'apiKey', { retryMutation: 'always' });
  }

  async closeListenKey(): Promise<Record<string, unknown>> {
    return this.http.delete('/userDataStream', undefined, 'apiKey');
  }
}
