import { WebSocketServer, WebSocket } from 'ws';

/**
 * Binance-style mock user-data stream server for the v3 execution platform
 * tests. A listen-key user stream carries no control protocol — the server
 * just accepts connections (path = `/<listenKey>`) and pushes event frames —
 * so this helper records connection paths, pushes frames on demand, and can
 * drop or reject connections to drive reconnect/rotation behavior.
 */
export interface MockUserStreamServer {
  port: number;
  /** Base URL (`ws://127.0.0.1:<port>`) — append `/<listenKey>`. */
  baseUrl: string;
  /** Path of every accepted connection, in order (e.g. `/key-1`). */
  connectionPaths: string[];
  /** Accepted sockets, in connect order. */
  sockets: WebSocket[];
  /** Send one raw frame to every currently-open socket. */
  send(frame: unknown): void;
  /** Terminate all client sockets (server stays up for reconnects). */
  dropClients(): void;
  /** When true, every new connection is terminated on arrival. */
  setRejectNewConnections(reject: boolean): void;
  close(): Promise<void>;
}

export async function startMockUserStreamServer(): Promise<MockUserStreamServer> {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;

  const connectionPaths: string[] = [];
  const sockets: WebSocket[] = [];
  let rejectNew = false;

  server.on('connection', (socket, request) => {
    connectionPaths.push(request.url ?? '/');
    sockets.push(socket);
    if (rejectNew) {
      socket.terminate();
      return;
    }
  });

  return {
    port,
    baseUrl: `ws://127.0.0.1:${port}`,
    connectionPaths,
    sockets,
    send: (frame) => {
      const text = typeof frame === 'string' ? frame : JSON.stringify(frame);
      for (const socket of server.clients) {
        if (socket.readyState === WebSocket.OPEN) socket.send(text);
      }
    },
    dropClients: () => {
      for (const socket of [...server.clients]) socket.terminate();
      sockets.length = 0;
    },
    setRejectNewConnections: (reject) => {
      rejectNew = reject;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of server.clients) socket.terminate();
        server.close(() => resolve());
      }),
  };
}

/** A realistic USDⓈ-M `ORDER_TRADE_UPDATE` frame. */
export function orderTradeUpdateFrame(overrides: {
  clientOrderId?: string;
  executionType?: string;
  orderStatus?: string;
  lastQty?: string;
  lastPrice?: string;
  cumulativeQty?: string;
  avgPrice?: string;
  tradeId?: number;
  commission?: string;
}): Record<string, unknown> {
  return {
    e: 'ORDER_TRADE_UPDATE',
    E: 1562306474651,
    T: 1562306474650,
    o: {
      s: 'BTCUSDT',
      c: overrides.clientOrderId ?? 'nbsdk-frame-1',
      S: 'BUY',
      o: 'LIMIT',
      f: 'GTC',
      q: '0.001',
      p: '50000.00',
      ap: overrides.avgPrice ?? '0',
      sp: '0',
      x: overrides.executionType ?? 'NEW',
      X: overrides.orderStatus ?? 'NEW',
      i: 12345,
      l: overrides.lastQty ?? '0',
      z: overrides.cumulativeQty ?? '0',
      L: overrides.lastPrice ?? '0',
      n: overrides.commission ?? '0',
      N: 'USDT',
      T: 1562306474650,
      t: overrides.tradeId ?? -1,
      b: '0',
      a: '0',
      m: false,
      R: false,
      wt: 'CONTRACT_PRICE',
      ot: 'LIMIT',
      ps: 'BOTH',
      cp: false,
      AP: '0',
      cr: '0',
      rp: '0',
    },
  };
}

/** A realistic USDⓈ-M `ACCOUNT_UPDATE` frame. */
export function accountUpdateFrame(overrides?: {
  symbol?: string;
  amount?: string;
  entryPrice?: string;
  unrealizedPnl?: string;
  positionSide?: string;
  marginType?: string;
}): Record<string, unknown> {
  return {
    e: 'ACCOUNT_UPDATE',
    E: 1564745738939,
    T: 1564745738939,
    a: {
      m: 'ORDER',
      B: [{ a: 'USDT', wb: '122624.12345678', cw: '10000.18432', bc: '-49.55470426' }],
      P: [
        {
          s: overrides?.symbol ?? 'BTCUSDT',
          pa: overrides?.amount ?? '0.001',
          ep: overrides?.entryPrice ?? '50000.0',
          cr: '-0.09142',
          up: overrides?.unrealizedPnl ?? '-0.00091',
          mt: overrides?.marginType ?? 'cross',
          iw: '0.0',
          ps: overrides?.positionSide ?? 'BOTH',
        },
      ],
    },
  };
}

/** A realistic spot `executionReport` frame. */
export function spotExecutionReportFrame(overrides?: {
  clientOrderId?: string;
  orderStatus?: string;
  lastQty?: string;
  lastPrice?: string;
  cumulativeQty?: string;
  cumulativeQuote?: string;
  tradeId?: number;
}): Record<string, unknown> {
  return {
    e: 'executionReport',
    E: 1499405658658,
    s: 'ETHBTC',
    c: overrides?.clientOrderId ?? 'spot-client-1',
    S: 'BUY',
    o: 'LIMIT',
    f: 'GTC',
    q: '1.00000000',
    p: '0.00650000',
    x: 'TRADE',
    X: overrides?.orderStatus ?? 'PARTIALLY_FILLED',
    i: 4292353,
    l: overrides?.lastQty ?? '0.50000000',
    z: overrides?.cumulativeQty ?? '0.50000000',
    L: overrides?.lastPrice ?? '0.00640000',
    n: '0.00032000',
    N: 'ETH',
    T: 1499405658657,
    t: overrides?.tradeId ?? 99887,
    Z: overrides?.cumulativeQuote ?? '0.00320000',
  };
}
