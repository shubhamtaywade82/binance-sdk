import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WsApi } from '../../src/ws/WsApi.js';

describe('WsApi', () => {
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

  it('sends a signed request and resolves the response', async () => {
    let received: { id: string; method: string; params: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        received = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
        socket.send(JSON.stringify({ id: received.id, status: 200, result: { orderId: 42 } }));
      });
    });

    const api = new WsApi({ baseUrl: `ws://localhost:${port}`, apiKey: 'k', apiSecret: 's' });
    const res = await api.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01 });

    expect(received?.method).toBe('order.place');
    expect(received?.params.symbol).toBe('BTCUSDT');
    expect(received?.params.apiKey).toBe('k');
    expect(received?.params.signature).toBeTruthy();
    expect(received?.params.timestamp).toBeTruthy();
    expect(res.result).toEqual({ orderId: 42 });
  });

  it('rejects on API error status', async () => {
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        const { id } = JSON.parse(raw.toString());
        socket.send(JSON.stringify({ id, status: 400, error: { code: -2019, msg: 'insufficient balance' } }));
      });
    });

    const api = new WsApi({ baseUrl: `ws://localhost:${port}`, apiKey: 'k', apiSecret: 's' });
    await expect(api.request('order.place', { symbol: 'BTCUSDT' })).rejects.toThrow('insufficient balance');
  });

  it('throws when credentials are missing', async () => {
    const api = new WsApi({ baseUrl: `ws://localhost:${port}` });
    await expect(api.request('order.place', {})).rejects.toThrow('API key and secret (or privateKey) required');
  });

  it('signs with a provided Ed25519 privateKey instead of HMAC', async () => {
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

    const api = new WsApi({ baseUrl: `ws://localhost:${port}`, apiKey: 'k', privateKey: pem });
    await api.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01 });

    expect(received?.params.apiKey).toBe('k');
    expect(typeof received?.params.signature).toBe('string');
  });

  it('sends unsigned public market-data requests without credentials', async () => {
    let received: { id: string; method: string; params: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        received = JSON.parse(raw.toString()) as { id: string; method: string; params: Record<string, unknown> };
        socket.send(JSON.stringify({ id: received.id, status: 200, result: { symbol: 'BTCUSDT', price: '60000' } }));
      });
    });

    const api = new WsApi({ baseUrl: `ws://localhost:${port}` });
    const res = await api.tickerPrice({ symbol: 'BTCUSDT' });

    expect(received?.method).toBe('ticker.price');
    expect(received?.params.symbol).toBe('BTCUSDT');
    expect(received?.params.apiKey).toBeUndefined();
    expect(received?.params.signature).toBeUndefined();
    expect(res.result).toEqual({ symbol: 'BTCUSDT', price: '60000' });
  });

  it('wraps userDataStream.start for WS-managed listen keys', async () => {
    let received: { method: string } | undefined;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        received = JSON.parse(raw.toString()) as { method: string };
        socket.send(JSON.stringify({ id: 'x', status: 200, result: { listenKey: 'abc' } }));
      });
    });

    const api = new WsApi({ baseUrl: `ws://localhost:${port}`, apiKey: 'k', apiSecret: 's' });
    await api.userDataStreamStart();
    expect(received?.method).toBe('userDataStream.start');
  });
});
