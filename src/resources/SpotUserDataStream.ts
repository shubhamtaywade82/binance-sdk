import { HttpClient } from '../client/HttpClient.js';
import { ListenKey, ListenKeySchema } from '../types/userdata.types.js';

export class SpotUserDataStream {
  constructor(private readonly http: HttpClient) {}

  /** @deprecated Retired by Binance on 2026-02-20; the Spot user stream now uses the WebSocket API subscription (`startUserStream()` / `wsUser.start()`). Removal planned for the next major version. */
  async createListenKey(): Promise<ListenKey> {
    return ListenKeySchema.parse(await this.http.post('/userDataStream', undefined, 'apiKey'));
  }

  /** @deprecated Retired by Binance on 2026-02-20; WebSocket API subscriptions need no keep-alive. Removal planned for the next major version. */
  async keepAliveListenKey(): Promise<Record<string, unknown>> {
    return this.http.put('/userDataStream', undefined, 'apiKey');
  }

  /** @deprecated Retired by Binance on 2026-02-20; close the WebSocket API connection instead (`closeUserStream()`). Removal planned for the next major version. */
  async closeListenKey(): Promise<Record<string, unknown>> {
    return this.http.delete('/userDataStream', undefined, 'apiKey');
  }
}
