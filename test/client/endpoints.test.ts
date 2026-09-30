import { describe, expect, it } from 'vitest';
import { resolveEnvironment } from '../../src/client/endpoints.js';

describe('resolveEnvironment', () => {
  it('resolves live hosts including the new Spot WS API and COIN-M WS hosts', () => {
    const { env, endpoints } = resolveEnvironment();
    expect(env).toBe('live');
    expect(endpoints.wsSpotApi).toBe('wss://ws-api.binance.com:443/ws-api/v3');
    expect(endpoints.wsDapiMarket).toBe('wss://dstream.binance.com/stream');
    expect(endpoints.wsDapiUser).toBe('wss://dstream.binance.com/ws');
    expect(endpoints.restDapiRoot).toBe('https://dapi.binance.com');
    expect(endpoints.restDapi).toBe('https://dapi.binance.com/dapi/v1');
  });

  it('uses the 2026 USDⓈ-M WS routing paths (/market and /public)', () => {
    // Binance migrated USDⓈ-M market streams off the legacy `/stream` path
    // (shutdown April 23, 2026) to the new `/market` and `/public` URL paths.
    const { endpoints } = resolveEnvironment();
    expect(endpoints.wsMarket).toBe('wss://fstream.binance.com/market/stream');
    expect(endpoints.wsMarketPublic).toBe('wss://fstream.binance.com/public/stream');
    expect(endpoints.wsUser).toBe('wss://fstream.binance.com/public/ws');
  });

  it('uses the 2026 USDⓈ-M WS routing paths on testnet', () => {
    const { endpoints } = resolveEnvironment({ testnet: true });
    expect(endpoints.wsMarket).toBe('wss://fstream.binancefuture.com/market/stream');
    expect(endpoints.wsMarketPublic).toBe('wss://fstream.binancefuture.com/public/stream');
    expect(endpoints.wsUser).toBe('wss://fstream.binancefuture.com/public/ws');
  });

  it('honors explicit wsBase and wsMarketPublicBase overrides', () => {
    const { endpoints } = resolveEnvironment({
      wsBase: 'ws://localhost:1234/market/stream',
      wsMarketPublicBase: 'ws://localhost:1234/public/stream',
    });
    expect(endpoints.wsMarket).toBe('ws://localhost:1234/market/stream');
    expect(endpoints.wsMarketPublic).toBe('ws://localhost:1234/public/stream');
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
    // USDⓈ-M demo host keeps the new /market and /public routing paths.
    expect(endpoints.wsMarket).toBe('wss://demo-fstream.binance.com/market/stream');
    expect(endpoints.wsMarketPublic).toBe('wss://demo-fstream.binance.com/public/stream');
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
