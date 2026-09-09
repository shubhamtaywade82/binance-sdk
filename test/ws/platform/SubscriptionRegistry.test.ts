import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FamilyConnectionPool } from '../../../src/ws/platform/ConnectionPool.js';
import { FamilySubscriptionRegistry } from '../../../src/ws/platform/SubscriptionRegistry.js';
import { startMockWsServer, aggTradeData, type MockWsServer } from './helpers.js';
import { EventBus } from '../../../src/core/events.js';

describe('FamilySubscriptionRegistry (subscriptions, fan-out, refcounts)', () => {
  let server: MockWsServer;
  let pool: FamilyConnectionPool;
  let registry: FamilySubscriptionRegistry;
  let events: EventBus;

  beforeEach(async () => {
    server = await startMockWsServer();
    events = new EventBus();
    pool = new FamilyConnectionPool({ family: 'usdm', baseStreamUrl: server.url, events });
    registry = new FamilySubscriptionRegistry({ pool, events });
  });

  afterEach(async () => {
    registry.closeAll();
    pool.closeAll();
    await server.close();
  });

  it('acquire() confirms the stream server-side and marks it live', async () => {
    const sub = await registry.acquire('btcusdt@aggTrade');
    expect(sub.stream).toBe('btcusdt@aggTrade');
    expect(sub.state).toBe('live');
    expect(server.subscriptionsOf(server.sockets[0])).toContain('btcusdt@aggTrade');
  });

  it('delivers stream frames to the subscription (parsed payload + raw view)', async () => {
    const sub = await registry.acquire('btcusdt@aggTrade');
    const messages: unknown[] = [];
    const raws: unknown[] = [];
    sub.on('message', (payload) => messages.push(payload));
    sub.on('raw', (raw) => raws.push(raw));

    server.emitStream('btcusdt@aggTrade', aggTradeData('42000.5', '0.01'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(messages).toHaveLength(1);
    expect((messages[0] as { p: number }).p).toBe(42000.5);
    expect(raws).toHaveLength(1);
    expect((raws[0] as { p: string }).p).toBe('42000.5');
  });

  it('multiple subscriptions to one stream share the server subscription (refcount)', async () => {
    const subA = await registry.acquire('btcusdt@aggTrade');
    const subB = await registry.acquire('btcusdt@aggTrade');
    const gotA: unknown[] = [];
    const gotB: unknown[] = [];
    subA.on('message', (p) => gotA.push(p));
    subB.on('message', (p) => gotB.push(p));

    // One connection, one server-side subscription, two consumer objects.
    expect(pool.size()).toBe(1);
    expect(server.sockets).toHaveLength(1);
    expect(server.subscriptionsOf(server.sockets[0])).toEqual(['btcusdt@aggTrade']);

    server.emitStream('btcusdt@aggTrade', aggTradeData('1', '1'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gotA).toHaveLength(1);
    expect(gotB).toHaveLength(1); // full fan-out

    // Closing one subscriber keeps the server subscription alive.
    subA.close();
    server.emitStream('btcusdt@aggTrade', aggTradeData('2', '2'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gotB).toHaveLength(2);

    expect(registry.getSubscription('btcusdt@aggTrade')).toBe(subB);
  });

  it('the last close() issues the protocol UNSUBSCRIBE', async () => {
    const subA = await registry.acquire('ethusdt@aggTrade');
    const subB = await registry.acquire('ethusdt@aggTrade');
    subA.close();
    const unsubscribes = server.controlRequests.filter((r) => r.method === 'UNSUBSCRIBE');
    expect(unsubscribes).toHaveLength(0); // refcount still > 0

    subB.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const unsubscribesAfter = server.controlRequests.filter((r) => r.method === 'UNSUBSCRIBE');
    expect(unsubscribesAfter).toHaveLength(1);
    expect(unsubscribesAfter[0].params).toContain('ethusdt@aggTrade');
    expect(registry.activeStreams()).not.toContain('ethusdt@aggTrade');
  });

  it('reconnects transparently: pending → live, frames resume, no duplicate server subscription', async () => {
    const sub = await registry.acquire('btcusdt@aggTrade');
    const states: string[] = [];
    sub.on('state', (to) => states.push(to));

    server.dropClients();
    await new Promise((resolve) => setTimeout(resolve, 150)); // reconnect backoff
    expect(sub.state).toBe('pending');
    expect(states).toContain('pending');

    // BaseWS repair: reconnect + resynchronize re-confirms the desired stream.
    await sub.waitForReady(5000);
    expect(sub.state).toBe('live');
    // The drop cleared the server's socket list; the replacement socket is
    // present and carries the re-confirmed subscription.
    expect(server.sockets.length).toBeGreaterThanOrEqual(1);
    expect(server.subscriptionsOf(server.sockets[server.sockets.length - 1])).toContain(
      'btcusdt@aggTrade',
    );

    const messages: unknown[] = [];
    sub.on('message', (p) => messages.push(p));
    server.emitStream('btcusdt@aggTrade', aggTradeData('7', '7'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages).toHaveLength(1);
  });

  it('streams are sticky: a second stream rides the same pooled connection', async () => {
    await registry.acquire('a@aggTrade');
    await registry.acquire('b@aggTrade');
    expect(pool.size()).toBe(1);
    expect(server.subscriptionsOf(server.sockets[0])).toEqual(['a@aggTrade', 'b@aggTrade']);
  });

  it('getSubscription/activeStreams/stats reflect registry state', async () => {
    expect(registry.stats()).toEqual({ streams: 0, connections: 0 });
    const sub = await registry.acquire('x@aggTrade');
    expect(registry.activeStreams()).toEqual(['x@aggTrade']);
    expect(registry.getSubscription('x@aggTrade')).toBe(sub);
    expect(registry.stats()).toEqual({ streams: 1, connections: 1 });
  });
});
