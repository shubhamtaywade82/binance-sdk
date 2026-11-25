import { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortfolioMarginUserWS } from '../../src/ws/PortfolioMarginUserWS.js';
import type {
  OpenOrderLoss,
  PmAlgoUpdate,
  PmProAccountUpdate,
  RiskLevelChange,
} from '../../src/types/pmUserdata.types.js';

describe('PortfolioMarginUserWS event handling', () => {
  let server: WebSocketServer;
  let url: string;

  beforeEach(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    url = `ws://localhost:${(server.address() as { port: number }).port}`;
  });

  afterEach(() => {
    server.close();
  });

  it('connects to <base>/<listenKey> and emits typed PM_PRO_ACCOUNT_UPDATE', async () => {
    let seenPath = '';
    server.on('connection', (socket, req) => {
      seenPath = req.url ?? '';
      socket.send(
        JSON.stringify({
          e: 'PM_PRO_ACCOUNT_UPDATE',
          E: 1777041666123,
          u: '3112.12781385',
          eq: '122607.35137904',
          ae: '10607.39915911',
        }),
      );
    });

    const client = new PortfolioMarginUserWS({
      baseUserUrl: `${url}/pm-classic`,
      getListenKey: () => 'pmKey123',
    });
    const received = await new Promise<PmProAccountUpdate>((resolve) => {
      client.on('PM_PRO_ACCOUNT_UPDATE', (event) => resolve(event));
      client.connect();
    });

    expect(seenPath).toBe('/pm-classic/pmKey123');
    expect(received.u).toBe('3112.12781385');
    expect(received.eq).toBe('122607.35137904');
    client.close();
  });

  it('emits typed openOrderLoss, riskLevelChange and ALGO_UPDATE events', async () => {
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({ e: 'openOrderLoss', E: 1766500000000, o: '-123.45' }));
      socket.send(JSON.stringify({ e: 'riskLevelChange', E: 1766500000001, riskLevel: 'REDUCE_ONLY' }));
      socket.send(JSON.stringify({ e: 'ALGO_UPDATE', E: 1766500000002, ao: { aid: 1, X: 'NEW', ia: true } }));
    });

    const client = new PortfolioMarginUserWS({ baseUserUrl: url, getListenKey: () => 'k' });
    client.connect();
    const [loss, risk, algo] = await Promise.all([
      new Promise<OpenOrderLoss>((resolve) => client.on('openOrderLoss', resolve)),
      new Promise<RiskLevelChange>((resolve) => client.on('riskLevelChange', resolve)),
      new Promise<PmAlgoUpdate>((resolve) => client.on('ALGO_UPDATE', resolve)),
    ]);

    expect(loss.o).toBe('-123.45');
    expect(risk.riskLevel).toBe('REDUCE_ONLY');
    expect(algo.ao.ia).toBe(true);
    client.close();
  });

  it('surfaces unmodelled events as unknownEvent with fields preserved', async () => {
    server.on('connection', (socket) =>
      socket.send(JSON.stringify({ e: 'ACCOUNT_UPDATE', E: 1, a: { m: 'ORDER' }, ao: { aid: 3 } })),
    );
    const client = new PortfolioMarginUserWS({ baseUserUrl: url, getListenKey: () => 'k' });
    client.connect();
    const [unknown, viaUserData] = await Promise.all([
      new Promise<Record<string, unknown>>((resolve) => client.on('unknownEvent', (e) => resolve(e as Record<string, unknown>))),
      new Promise<Record<string, unknown>>((resolve) => client.on('userData', (e) => resolve(e as Record<string, unknown>))),
    ]);

    // Fields are preserved on the passthrough — nothing is stripped.
    expect(unknown.e).toBe('ACCOUNT_UPDATE');
    expect(unknown.a).toEqual({ m: 'ORDER' });
    expect(viaUserData.e).toBe('ACCOUNT_UPDATE');
    expect(viaUserData.ao).toEqual({ aid: 3 });
    client.close();
  });

  it('emits raw for frames without an event type (legacy contract)', async () => {
    server.on('connection', (socket) => socket.send(JSON.stringify({ ping: 'pong' })));)
    const client = new PortfolioMarginUserWS({ baseUserUrl: url, getListenKey: () => 'k' });
    const raw = await new Promise<Record<string, unknown>>((resolve) => {
      client.on('raw', (frame) => resolve(frame as Record<string, unknown>));
      client.connect();
    });
    expect(raw).toEqual({ ping: 'pong' });
    client.close();
  });
});
