import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SpotWsApi } from '../../src/ws/SpotWsApi.js';

describe('SpotWsApi', () => {
  let server: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(() => {
    server.close();
  });

  it('sends a signed order.place request', async () => {
    let received: { id: string; method: string; params: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        received = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
        socket.send(JSON.stringify({ id: received.id, status: 200, result: { orderId: 1 } }));
      });
    });

    const api = new SpotWsApi({ baseUrl: `ws://localhost:${port}`, apiKey: 'k', apiSecret: 's' });
    const res = await api.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', price: 60000, quantity: 0.01 });

    expect(received?.method).toBe('order.place');
    expect(received?.params.apiKey).toBe('k');
    expect(received?.params.signature).toBeTruthy();
    expect(res.result).toEqual({ orderId: 1 });
  });

  it('uses spot-specific method names for market data, distinct from futures', async () => {
    const calls: string[] = [];
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const { id, method } = JSON.parse(raw.toString()) as { id: string; method: string };
        calls.push(method);
        socket.send(JSON.stringify({ id, status: 200, result: {} }));
      });
    });

    const api = new SpotWsApi({ baseUrl: `ws://localhost:${port}` });
    await api.recentTrades({ symbol: 'BTCUSDT' });
    await api.aggTrades({ symbol: 'BTCUSDT' });
    await api.tickerBook({ symbol: 'BTCUSDT' });

    expect(calls).toEqual(['trades.recent', 'trades.aggregate', 'ticker.book']);
  });

  it('rejects on API error status', async () => {
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const { id } = JSON.parse(raw.toString());
        socket.send(JSON.stringify({ id, status: 400, error: { code: -2010, msg: 'insufficient balance' } }));
      });
    });

    const api = new SpotWsApi({ baseUrl: `ws://localhost:${port}`, apiKey: 'k', apiSecret: 's' });
    await expect(api.request('order.place', { symbol: 'BTCUSDT' })).rejects.toThrow('insufficient balance');
  });

  it('throws when credentials are missing for a signed call', async () => {
    const api = new SpotWsApi({ baseUrl: `ws://localhost:${port}` });
    await expect(api.request('order.place', {})).rejects.toThrow('API key and secret (or privateKey) required');
  });

  it('sends unsigned public market-data requests without credentials', async () => {
    let received: { method: string; params: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        received = JSON.parse(raw.toString()) as { method: string; params: Record<string, unknown> };
        socket.send(JSON.stringify({ id: 'x', status: 200, result: { symbol: 'BTCUSDT', price: '60000' } }));
      });
    });

    const api = new SpotWsApi({ baseUrl: `ws://localhost:${port}` });
    const res = await api.tickerPrice({ symbol: 'BTCUSDT' });

    expect(received?.method).toBe('ticker.price');
    expect(received?.params.apiKey).toBeUndefined();
    expect(res.result).toEqual({ symbol: 'BTCUSDT', price: '60000' });
  });

  it('signs with a provided Ed25519 privateKey', async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    let received: { params: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        received = JSON.parse(raw.toString()) as { params: Record<string, unknown> };
        socket.send(JSON.stringify({ id: 'x', status: 200, result: {} }));
      });
    });

    const api = new SpotWsApi({ baseUrl: `ws://localhost:${port}`, apiKey: 'k', privateKey: pem });
    await api.accountStatus();

    expect(received?.params.apiKey).toBe('k');
    expect(typeof received?.params.signature).toBe('string');
  });
});
