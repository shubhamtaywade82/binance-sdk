import { describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { RiskGateway } from '../../src/risk/RiskGateway.js';
import { ExecutionManager } from '../../src/execution/ExecutionManager.js';

describe('BinanceClient wiring', () => {
  it('exposes the futures execution manager', () => {
    const client = new BinanceClient();
    expect(client.futures.execution).toBeInstanceOf(ExecutionManager);
  });

  it('product aliases point at the same underlying objects', () => {
    const client = new BinanceClient();
    expect(client.futures.usdm).toBe(client.futures);
    expect(client.futures.coinm).toBe(client.coinm);
    expect(client.futures.usdm.trading).toBe(client.futures.trading);
    expect(client.futures.coinm.ws).toBe(client.coinm.ws);

    const products = client.products;
    expect(products.spot).toBe(client.spot);
    expect(products.usdm).toBe(client.futures);
    expect(products.coinm).toBe(client.coinm);
    expect(products.wallet).toBe(client.wallet);
  });

  it('safety builds a RiskGateway visible via getRiskStatus()', () => {
    const client = new BinanceClient({ safety: { maxDailyLoss: 100 } });
    expect(client.policy).toBeInstanceOf(RiskGateway);
    const status = client.getRiskStatus();
    expect(status?.circuitBreaker.tripped).toBe(false);
    expect(status?.dailyPnl).toBe('0');
  });

  it('without safety there is no policy and no risk status', () => {
    const client = new BinanceClient();
    expect(client.policy).toBeUndefined();
    expect(client.getRiskStatus()).toBeUndefined();
  });

  it('exposes the observability bus, and WS instances share it', () => {
    const client = new BinanceClient();
    expect(client.events).toBeDefined();
    const seen: string[] = [];
    client.events.on('ws.', (event) => seen.push(event.name));

    // Touch a WS lifecycle without a real network: a closed connection still
    // transitions states through the bus.
    client.spot.ws.close();
    expect(seen).toContain('ws.state');
    expect(seen.filter((name) => name === 'ws.state').length).toBeGreaterThan(0);
  });

  it('client-level futures namespaces carry execution + ops + data end-to-end', () => {
    const client = new BinanceClient();
    expect(client.futures.ops).toBeDefined();
    expect(client.futures.data).toBeDefined();
    expect(client.futures.wsApi).toBeDefined();
    expect(client.futures.userStream).toBeDefined();
    expect(client.spot.wsApi).toBeDefined();
    expect(client.coinm.wsUser).toBeDefined();
  });
});
