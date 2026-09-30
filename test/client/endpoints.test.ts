import { describe, expect, it } from 'vitest';
import { resolveEnvironment } from '../../src/client/endpoints.js';

describe('resolveEnvironment', () => {
  it('routes USDⓈ-M market streams over /market and /public (legacy /stream is decommissioned)', () => {
    const live = resolveEnvironment().endpoints;
    expect(live.wsMarket).toBe('wss://fstream.binance.com/market/stream');
    expect(live.wsPublic).toBe('wss://fstream.binance.com/public/stream');
    expect(resolveEnvironment({ testnet: true }).endpoints.wsPublic).toBe('wss://fstream.binancefuture.com/public/stream');
    expect(resolveEnvironment({ demo: true }).endpoints.wsMarket).toBe('wss://demo-fstream.binance.com/market/stream');
  });

  it('derives the public URL from a wsBase override unless wsPublicBase is given', () => {
    const derived = resolveEnvironment({ wsBase: 'ws://localhost:9/market/stream' }).endpoints;
    expect(derived.wsMarket).toBe('ws://localhost:9/market/stream');
    expect(derived.wsPublic).toBe('ws://localhost:9/public/stream');
    const explicit = resolveEnvironment({ wsBase: 'ws://a/stream', wsPublicBase: 'ws://b/stream' }).endpoints;
    expect(explicit.wsPublic).toBe('ws://b/stream');
  });

  it('resolves live hosts including the new Spot WS API and COIN-M WS hosts', () => {
    const { env, endpoints } = resolveEnvironment();
    expect(env).toBe('live');
    expect(endpoints.wsSpotApi).toBe('wss://ws-api.binance.com:443/ws-api/v3');
    expect(endpoints.wsDapiMarket).toBe('wss://dstream.binance.com/stream');
    expect(endpoints.wsDapiUser).toBe('wss://dstream.binance.com/ws');
    expect(endpoints.restDapiRoot).toBe('https://dapi.binance.com');
    expect(endpoints.restDapi).toBe('https://dapi.binance.com/dapi/v1');
  });

  it('resolves testnet hosts for Spot WS API and COIN-M WS', () => {
    const { endpoints } = resolveEnvironment({ testnet: true });
    expect(endpoints.wsSpotApi).toBe('wss://testnet.binance.vision/ws-api/v3');
    expect(endpoints.wsDapiMarket).toBe('wss://dstream.binancefuture.com/stream');
    expect(endpoints.wsDapiUser).toBe('wss://dstream.binancefuture.com/ws');
    expect(endpoints.restDapiRoot).toBe('https://testnet.binancefuture.com');
  });

  it('falls back COIN-M WS demo mode to the testnet stream host (no dedicated demo host exists)', () => {
    const { endpoints } = resolveEnvironment({ demo: true });
    expect(endpoints.wsDapiMarket).toBe('wss://dstream.binancefuture.com/stream');
    expect(endpoints.restDapiRoot).toBe('https://testnet.binancefuture.com');
  });

  it('honors explicit wsSpotApiBase and wsDapiBase overrides', () => {
    const { endpoints } = resolveEnvironment({
      wsSpotApiBase: 'ws://localhost:1234',
      wsDapiBase: 'ws://localhost:5678',
    });
    expect(endpoints.wsSpotApi).toBe('ws://localhost:1234');
    expect(endpoints.wsDapiMarket).toBe('ws://localhost:5678/stream');
    expect(endpoints.wsDapiUser).toBe('ws://localhost:5678/ws');
  });
});
