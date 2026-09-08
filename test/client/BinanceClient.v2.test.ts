import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { WsState } from '../../src/ws/BaseWS.js';
import { createTestLogger } from '../../src/util/logger.js';

const FAPI = 'https://fapi.binance.com';

const server = setupServer();
beforeEach(() =>
  server.listen({
    // Local WebSocket test servers must not be intercepted by MSW (the WS
    // upgrade surfaces as a localhost HTTP request).
    onUnhandledRequest: (request, print) => {
      const url = request.url.toLowerCase();
      if (url.startsWith('ws://') || url.startsWith('wss://') || url.includes('://localhost:')) return;
      print.error();
    },
  }),
);
afterEach(() => {
  server.resetHandlers();
  server.close();
});

describe('BinanceClient v2.1 wiring', () => {
  it('exposes the product registry with capability metadata and identical instances', () => {
    const client = new BinanceClient();
    expect(client.products.spot).toBe(client.spot);
    expect(client.products.futures.usdm).toBe(client.futures);
    expect(client.products.futures.coinm).toBe(client.coinm);
    expect(client.products.margin.account).toBe(client.margin.account);

    expect(client.spot.id).toBe('spot');
    expect(client.spot.capabilities).toContain('marketData');
    expect(client.futures.id).toBe('futures.usdm');
    expect(client.futures.capabilities).toContain('executionGuard');
    expect(client.coinm.id).toBe('futures.coinm');
    expect(client.wallet.id).toBe('wallet');
    expect(client.subaccount.id).toBe('subaccount');
  });

  it('futures.usdm and futures.coinm are ergonomic aliases', () => {
    const client = new BinanceClient();
    expect(client.futures.usdm).toBe(client.futures);
    expect(client.futures.usdm.trading).toBe(client.futures.trading);
    expect(client.futures.coinm).toBe(client.coinm);
    expect(client.futures.coinm.market).toBe(client.coinm.market);
  });

  it('wallet and subaccount product surfaces keep full resource behavior', () => {
    const client = new BinanceClient();
    expect(typeof client.wallet.fundingWallet).toBe('function');
    expect(typeof client.wallet.apiKeyPermissions).toBe('function');
    expect(typeof client.subaccount.list).toBe('function');
    expect(typeof client.subaccount.status).toBe('function');
  });

  it('safety options construct a RiskGateway accessible as client.risk', () => {
    const client = new BinanceClient({
      safety: { maxOrdersPerMinute: 5, maxDailyLoss: 1000 },
    });
    expect(client.risk).toBeDefined();
    expect(client.risk?.status().breaker.tripped).toBe(false);

    // policy and risk are the same enforcement point.
    expect(client.policy).toBe(client.risk);

    const bare = new BinanceClient();
    expect(bare.risk).toBeUndefined();
    expect(bare.policy).toBeUndefined();
  });

  it('client.futures.execution and client.spot.execution exist with reconciler semantics', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(typeof client.futures.execution.submitOrder).toBe('function');
    expect(typeof client.futures.execution.createOrder).toBe('function');
    expect(typeof client.spot.execution.submitOrder).toBe('function');
    expect(client.futures.execution.getInFlightClientOrderIds()).toEqual([]);
  });

  it('execution submissions flow through risk-gateway accounting', async () => {
    server.use(
      http.post(`${FAPI}/fapi/v1/order`, () =>
        HttpResponse.json({
          orderId: 123,
          symbol: 'BTCUSDT',
          status: 'NEW',
          clientOrderId: 'sdk-test-1',
          price: '0',
          avgPrice: '0',
          origQty: '1',
          executedQty: '0',
          cumQuote: '0',
          type: 'MARKET',
          reduceOnly: false,
          side: 'BUY',
          positionSide: 'BOTH',
          time: 1,
          updateTime: 1,
        }),
      ),
    );

    const client = new BinanceClient({
      apiKey: 'k',
      apiSecret: 's',
      safety: { maxOrdersPerMinute: 1 },
    });

    const result = await client.futures.execution.createOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
      newClientOrderId: 'sdk-test-1',
    });
    expect(result.orderId).toBe(123);
    expect(client.risk?.status().openOrders).toBe(1);
  });

  it('wires a logger through the client into http telemetry', async () => {
    const logger = createTestLogger();
    server.use(
      http.get(`${FAPI}/fapi/v1/ping`, () => HttpResponse.json({})),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's', logger });
    await client.futures.market.ping();
    // Requests that flow through the request pipeline emit telemetry.
    expect(logger.records.length).toBeGreaterThan(0);
    expect(logger.records.every((r) => typeof r.ts === 'string' && typeof r.event === 'string')).toBe(true);
  });
});

describe('BinanceClient.watchOrderBook end-to-end', () => {
  let wsServer: WebSocketServer;
  let port: number;
  let updateId = 400;

  beforeEach(async () => {
    wsServer = new WebSocketServer({ port: 0 });
    wsServer.on('connection', (socket, req) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const streams = (url.searchParams.get('streams') ?? '').split('/').filter(Boolean);
      // Ack SUBSCRIBE/UNSUBSCRIBE control frames like Binance does.
      socket.on('message', (raw) => {
        const frame = JSON.parse(raw.toString()) as { id?: number };
        if (frame.id !== undefined) socket.send(JSON.stringify({ result: null, id: frame.id }));
      });
      for (const stream of streams) {
        if (stream.startsWith('btcusdt@depth')) {
          // Stream a sequence of diff events the client must consume in order.
          const interval = setInterval(() => {
            updateId += 1;
            socket.send(
              JSON.stringify({
                stream,
                data: {
                  e: 'depthUpdate', E: Date.now(), s: 'BTCUSDT',
                  U: updateId, u: updateId, pu: updateId - 1,
                  b: [['60000.10', '2']],
                  a: [['60000.20', '3']],
                },
              }),
            );
          }, 30);
          socket.on('close', () => clearInterval(interval));
        }
      }
    });
    await new Promise<void>((resolve) => wsServer.once('listening', resolve));
    port = (wsServer.address() as { port: number }).port;
  });

  afterEach(() => {
    wsServer.close();
  });

  it('maintains a synced book from snapshot + diff stream and resyncs on gaps', async () => {
    server.use(
      http.get(`${FAPI}/fapi/v1/depth`, () =>
        HttpResponse.json({
          lastUpdateId: 400,
          bids: [['60000.10', '1']],
          asks: [['60000.20', '2']],
        }),
      ),
    );

    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    // Point the futures market WS at the test server.
    (client.futures.ws as unknown as { options: { baseStreamUrl: string } }).options.baseStreamUrl =
      `ws://localhost:${port}/stream`;

    const feed = await client.watchFuturesOrderBook('BTCUSDT');
    try {
      expect(feed.book.synced).toBe(true);
      const updated = new Promise<void>((resolve) => feed.book.once('update', () => resolve()));
      await updated;
      // Levels merge across formats (number-parsed snapshot '60000.1' + raw
      // diff '60000.10' are the same price).
      expect(feed.book.bestBid()).toEqual({ price: '60000.1', quantity: '2' });
      expect(feed.book.bestAsk()).toEqual({ price: '60000.2', quantity: '3' });
      expect(feed.book.getBids()).toHaveLength(1);
      expect(feed.book.getAsks()).toHaveLength(1);
      expect(client.futures.ws.getState()).toBe(WsState.OPEN);
    } finally {
      await feed.close();
      client.closeAllWebSockets();
    }
  });
});
