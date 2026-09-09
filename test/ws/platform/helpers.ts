import { WebSocketServer, WebSocket } from 'ws';

/**
 * Binance-style mock server shared by the v3 WS platform tests.
 *
 * Emulates the combined-stream control protocol (SUBSCRIBE / UNSUBSCRIBE /
 * LIST_SUBSCRIPTIONS with numeric ids) and the WS API envelope (string ids,
 * `{id, status, result}` responses) on one socket endpoint — distinguished
 * by the shape of the inbound frame, exactly like Binance's real servers.
 */
export interface ControlRequest {
  method: string;
  params?: string[];
  id: number | string;
}

export interface MockWsServer {
  port: number;
  url: string;
  /** All accepted sockets, in connect order. */
  sockets: WebSocket[];
  /** Control requests (market protocol) received, in order. */
  controlRequests: ControlRequest[];
  /** WS API requests received, in order. */
  apiRequests: ControlRequest[];
  /** Subscribe a stream server-side and start emitting nothing (caller drives). */
  addSubscription(socket: WebSocket, stream: string): void;
  removeSubscription(socket: WebSocket, stream: string): void;
  subscriptionsOf(socket: WebSocket): string[];
  /** Emit one combined-stream data frame to every socket subscribed to it. */
  emitStream(stream: string, data: unknown): void;
  /** Respond to WS API requests automatically (default true). */
  setAutoRespond(enabled: boolean): void;
  /** Fail the next WS API request with an error envelope. */
  failNextApiRequest(code: number, msg: string): void;
  /** Drop all client sockets (server stays up for reconnects). */
  dropClients(): void;
  close(): Promise<void>;
}

export async function startMockWsServer(): Promise<MockWsServer> {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;

  const sockets: WebSocket[] = [];
  const controlRequests: ControlRequest[] = [];
  const apiRequests: ControlRequest[] = [];
  const perSocketSubs = new WeakMap<WebSocket, Set<string>>();
  let autoRespond = true;
  let failNext: { code: number; msg: string } | null = null;

  const addSubscription = (socket: WebSocket, stream: string): void => {
    const set = perSocketSubs.get(socket) ?? new Set<string>();
    set.add(stream);
    perSocketSubs.set(socket, set);
  };
  const removeSubscription = (socket: WebSocket, stream: string): void => {
    perSocketSubs.get(socket)?.delete(stream);
  };

  server.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (raw) => {
      const parsed = JSON.parse(raw.toString()) as {
        method?: string;
        params?: string[] | Record<string, unknown>;
        id?: number | string;
      };
      // WS API frames carry string (uuid) ids; market control frames carry
      // numeric ids — same discriminator Binance's two protocols have.
      if (typeof parsed.id === 'string') {
        apiRequests.push({ method: parsed.method ?? '', params: parsed.params as string[], id: parsed.id });
        if (!autoRespond) return;
        const failure = failNext;
        failNext = null;
        if (failure) {
          socket.send(JSON.stringify({ id: parsed.id, status: failure.code, error: { code: -1, msg: failure.msg } }));
        } else {
          socket.send(
            JSON.stringify({
              id: parsed.id,
              status: 200,
              result: { method: parsed.method, echoed: parsed.params },
            }),
          );
        }
        return;
      }
      const id = (parsed.id ?? 0) as number;
      controlRequests.push({ method: parsed.method ?? '', params: parsed.params as string[], id });
      if (parsed.method === 'SUBSCRIBE') {
        for (const stream of (parsed.params as string[]) ?? []) addSubscription(socket, stream);
        socket.send(JSON.stringify({ result: null, id }));
      } else if (parsed.method === 'UNSUBSCRIBE') {
        for (const stream of (parsed.params as string[]) ?? []) removeSubscription(socket, stream);
        socket.send(JSON.stringify({ result: null, id }));
      } else if (parsed.method === 'LIST_SUBSCRIPTIONS') {
        socket.send(JSON.stringify({ result: [...(perSocketSubs.get(socket) ?? [])], id }));
      }
    });
  });

  return {
    port,
    url: `ws://127.0.0.1:${port}`,
    sockets,
    controlRequests,
    apiRequests,
    addSubscription,
    removeSubscription,
    subscriptionsOf: (socket) => [...(perSocketSubs.get(socket) ?? [])],
    emitStream: (stream, data) => {
      for (const socket of sockets) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        if (!(perSocketSubs.get(socket) ?? new Set()).has(stream)) continue;
        socket.send(JSON.stringify({ stream, data }));
      }
    },
    setAutoRespond: (enabled) => {
      autoRespond = enabled;
    },
    failNextApiRequest: (code, msg) => {
      failNext = { code, msg };
    },
    dropClients: () => {
      for (const socket of [...sockets]) socket.terminate();
      sockets.length = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of server.clients) socket.terminate();
        server.close(() => resolve());
      }),
  };
}

/** A minimal aggTrade-style stream frame payload. */
export function aggTradeData(price: string, qty: string): Record<string, unknown> {
  return {
    e: 'aggTrade',
    E: Date.now(),
    s: 'BTCUSDT',
    a: 1,
    p: price,
    q: qty,
    f: 100,
    l: 101,
    T: Date.now(),
    m: false,
  };
}
