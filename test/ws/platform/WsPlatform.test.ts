import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../../src/client/BinanceClient.js';
import { startMockWsServer, aggTradeData, type MockWsServer } from './helpers.js';

describe('WsPlatform end-to-end (via BinanceClient.core.ws)', () => {
  let server: MockWsServer;
  let client: BinanceClient;

  beforeEach(async () => {
    server = await startMockWsServer();
    client = new BinanceClient({
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      // Route every v3 platform endpoint family at the mock server.
      wsBase: `${server.url}/stream`,
      wsApiBase: server.url,
      wsSpotApiBase: server.url,
      wsPlatform: {
        requestTimeoutMs: 2_000,
      },
    });
  });

  afterEach(() => {
    client.closeAllWebSockets();
    return server.close();
  });

  it('client.ws exposes the platform lazily (core hasWs gating)', () => {
    expect(client.core.hasWs()).toBe(false);
    const platform = client.ws;
    expect(client.core.hasWs()).toBe(true);
    expect(client.ws).toBe(platform); // stable identity
    expect(platform.usdm).toBeDefined();
    expect(platform.spot).toBeDefined();
    expect(platform.coinm).toBeDefined();
    expect(platform.api.usdm).toBeDefined();
    expect(platform.api.spot).toBeDefined();
  });

  it('subscribe → live subscription → frames dispatch → close', async () => {
    const sub = await client.ws.usdm.subscribe('btcusdt@aggTrade');
    expect(sub.state).toBe('live');
    expect(sub.connection).toBe('usdmMarket[0]');

    const ticks: number[] = [];
    sub.on('message', (payload) => ticks.push((payload as { p: number }).p));
    server.emitStream('btcusdt@aggTrade', aggTradeData('42000.5', '0.25'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ticks).toEqual([42000.5]);

    sub.close();
    expect(sub.state).toBe('closed');
    expect(client.ws.usdm.getSubscription('btcusdt@aggTrade')).toBeUndefined();
  });

  it('family pools are independent (usdm and spot use separate connections)', async () => {
    const [usdmSub, spotSub] = await Promise.all([
      client.ws.usdm.subscribe('btcusdt@aggTrade'),
      client.ws.spot.subscribe('ethusdt@trade'),
    ]);
    expect(usdmSub.connection).toBe('usdmMarket[0]');
    expect(spotSub.connection).toBe('spotMarket[0]');
    expect(server.sockets).toHaveLength(2);
  });

  it('multi-stream subscribe returns an array of subscriptions', async () => {
    const subs = await client.ws.usdm.subscribe(['a@aggTrade', 'b@aggTrade']);
    expect(Array.isArray(subs)).toBe(true);
    expect(subs).toHaveLength(2);
    expect(subs[0].stream).toBe('a@aggTrade');
    expect(subs[1].stream).toBe('b@aggTrade');
    expect(server.subscriptionsOf(server.sockets[0])).toEqual(['a@aggTrade', 'b@aggTrade']);
  });

  it('ws.api rides the persistent multiplexed socket', async () => {
    const [status, time] = await Promise.all([
      client.ws.api.usdm.request('account.status', {}, { signed: false }),
      client.ws.api.usdm.time(),
    ]);
    expect(status.status).toBe(200);
    expect(time.status).toBe(200);
    // One persistent WS API socket, two multiplexed requests.
    expect(server.apiRequests.length).toBeGreaterThanOrEqual(2);
  });

  it('stats() snapshots pools and WS API clients with renewal deadlines', async () => {
    await client.ws.usdm.subscribe('btcusdt@aggTrade');
    const stats = client.ws.stats();
    const usdm = stats.families.usdm;
    expect(usdm).toBeDefined();
    expect(usdm?.activeStreams).toBe(1);
    expect(usdm?.connections).toHaveLength(1);
    const connection = usdm?.connections[0];
    expect(connection?.name).toBe('usdmMarket[0]');
    expect(connection?.state).toBe('OPEN');
    expect(connection?.desiredStreams).toBe(1);
    expect(connection?.confirmedStreams).toBe(1);
    expect(connection?.nextRenewalAt).toBeGreaterThan(Date.now() + 22 * 60 * 60 * 1000); // ~23h away
    expect(stats.wsApi.map((entry) => entry.name).sort()).toEqual(['wsApiSpot', 'wsApiUsdm']);
  });

  it('reconnect repair restores subscriptions transparently', async () => {
    const sub = await client.ws.usdm.subscribe('btcusdt@aggTrade');
    const states: string[] = [];
    sub.on('state', (to) => states.push(to));

    server.dropClients();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(sub.state).toBe('pending');

    await sub.waitForReady(5000);
    expect(sub.state).toBe('live');
    expect(states).toEqual(['pending', 'live']);

    const ticks: number[] = [];
    sub.on('message', (payload) => ticks.push((payload as { p: number }).p));
    server.emitStream('btcusdt@aggTrade', aggTradeData('1', '1'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ticks).toHaveLength(1);
  });

  it('closeAllWebSockets() tears the platform down (and is a no-op pre-build)', () => {
    const fresh = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(() => fresh.closeAllWebSockets()).not.toThrow(); // never built → no-op
    expect(fresh.core.hasWs()).toBe(false);
  });

  it('close() closes subscriptions, pools and WS API clients', async () => {
    const sub = await client.ws.usdm.subscribe('btcusdt@aggTrade');
    void client.ws.api.usdm.request('time', {}, { signed: false }); // opens the api socket
    await new Promise((resolve) => setTimeout(resolve, 50));

    client.ws.close();
    expect(sub.state).toBe('closed');
    expect(client.ws.api.usdm.getState()).toBe('CLOSED');
    expect(client.ws.stats().families.usdm?.connections).toHaveLength(0);
  });
});
