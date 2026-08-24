import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';

// Deliberately no msw `setupServer()` in this file: msw's node interceptor treats a raw
// WebSocket handshake as an unhandled HTTP request, which conflicts with the local
// WebSocketServer used here to verify BinanceClient's WS wiring end-to-end.
describe('BinanceClient WebSocket wiring', () => {
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

  it('places an order through client.spot.wsApi against the configured wsSpotApiBase', async () => {
    let received: { method: string; params: Record<string, unknown> } | undefined;
    server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        received = JSON.parse(raw.toString()) as { method: string; params: Record<string, unknown> };
        socket.send(JSON.stringify({ id: 'x', status: 200, result: { orderId: 7 } }));
      });
    });

    const client = new BinanceClient({
      apiKey: 'k',
      apiSecret: 's',
      wsSpotApiBase: `ws://localhost:${port}`,
    });

    const res = await client.spot.wsApi.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });
    expect(received?.method).toBe('order.place');
    expect(res.result).toEqual({ orderId: 7 });

    client.futures.ws.close();
    client.spot.ws.close();
  });

  it('drives a full COIN-M user stream lifecycle against wsDapiBase/dapiBase overrides', async () => {
    server.on('connection', (socket) => {
      socket.send(
        JSON.stringify({
          e: 'ACCOUNT_UPDATE', E: 1, T: 1,
          a: { m: '0', B: [{ a: 'BTC', wb: '1', cw: '1', bc: '0' }], P: [] },
        }),
      );
    });

    let httpServer: Server | undefined;
    let httpPort: number;
    try {
      httpServer = createServer((req, res) => {
        if (req.url === '/dapi/v1/listenKey' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ listenKey: 'coinm-lk' }));
          return;
        }
        if (req.url === '/dapi/v1/listenKey' && req.method === 'DELETE') {
          res.setHeader('Content-Type', 'application/json');
          res.end('{}');
          return;
        }
        res.statusCode = 404;
        res.end();
      });
      await new Promise<void>((resolve) => httpServer!.listen(0, resolve));
      httpPort = (httpServer.address() as { port: number }).port;

      const client = new BinanceClient({
        apiKey: 'k',
        apiSecret: 's',
        dapiBase: `http://localhost:${httpPort}`,
        wsDapiBase: `ws://localhost:${port}`,
      });

      const received = new Promise<{ a: { B: { a: string }[] } }>((resolve) => {
        client.coinm.wsUser.once('ACCOUNT_UPDATE', (event: { a: { B: { a: string }[] } }) => resolve(event));
      });

      const listenKey = await client.startCoinMUserStream();
      expect(listenKey).toBe('coinm-lk');

      const event = await received;
      expect(event.a.B[0]?.a).toBe('BTC');

      client.closeCoinMUserStream();
      client.futures.ws.close();
      client.spot.ws.close();
    } finally {
      httpServer?.close();
    }
  });
});
