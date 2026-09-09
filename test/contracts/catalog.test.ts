import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_REGISTRY, endpointCounts } from '../../src/registry/endpoints.js';
import {
  WS_FAMILY_LIMITS,
  WS_PLATFORM_DEFAULTS,
} from '../../src/ws/platform/types.js';

const ROOT = join(import.meta.dirname, '..', '..');
const CONTRACTS = join(ROOT, 'contracts');

interface CatalogEntry {
  product: string;
  operation: string;
  transport: string;
  method: string;
  path: string;
  security: string;
  weight: number | null;
  implementedBy: string;
}

function loadCatalog(): { endpoints: CatalogEntry[] } {
  return JSON.parse(readFileSync(join(CONTRACTS, 'endpoint-catalog.json'), 'utf8'));
}

describe('contracts catalog (v3 inventory layer)', () => {
  it('endpoint-catalog.json exists and matches the registry exactly', () => {
    const catalog = loadCatalog();
    expect(catalog.endpoints).toHaveLength(ENDPOINT_REGISTRY.length);

    const registryKeys = ENDPOINT_REGISTRY.map((e) => `${e.method} ${e.path} ${e.operation}`).sort();
    const catalogKeys = catalog.endpoints
      .map((e: CatalogEntry) => `${e.method} ${e.path} ${e.operation}`)
      .sort();
    expect(catalogKeys).toEqual(registryKeys); // CI fails when the catalog rots
  });

  it('every entry carries the full machine-readable shape', () => {
    for (const entry of loadCatalog().endpoints) {
      expect(entry.transport).toBe('rest');
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(entry.method);
      expect(['PUBLIC', 'API_KEY', 'SIGNED']).toContain(entry.security);
      expect(entry.path.startsWith('/')).toBe(true);
      expect(entry.product.length).toBeGreaterThan(2);
      expect(entry.implementedBy.length).toBeGreaterThan(2);
      // weight: documented number or explicit null — never undefined
      expect(entry.weight === null || typeof entry.weight === 'number').toBe(true);
    }
  });

  it('security-catalog.json totals match the endpoint catalog per product', () => {
    const security = JSON.parse(readFileSync(join(CONTRACTS, 'security-catalog.json'), 'utf8'));
    const entries = loadCatalog().endpoints;
    for (const [product, row] of Object.entries<{ public: number; apiKey: number; signed: number; total: number }>(security.products)) {
      const productEntries = entries.filter((e: CatalogEntry) => e.product === product);
      expect(row.total).toBe(productEntries.length);
      expect(row.public).toBe(productEntries.filter((e: CatalogEntry) => e.security === 'PUBLIC').length);
      expect(row.apiKey).toBe(productEntries.filter((e: CatalogEntry) => e.security === 'API_KEY').length);
      expect(row.signed).toBe(productEntries.filter((e: CatalogEntry) => e.security === 'SIGNED').length);
    }
    // every registry product present in the security matrix
    for (const product of Object.keys(endpointCounts())) {
      expect(security.products[product]).toBeDefined();
    }
  });

  it('catalog.json index lists the files and correct totals', () => {
    const index = JSON.parse(readFileSync(join(CONTRACTS, 'catalog.json'), 'utf8'));
    expect(index.catalogVersion).toBe(1);
    expect(index.totalEndpoints).toBe(ENDPOINT_REGISTRY.length);
    expect(index.files).toContain('endpoint-catalog.json');
    expect(index.files).toContain('security-catalog.json');
    expect(index.files).toContain('websocket-catalog.json');
    expect(index.products.sort()).toEqual(Object.keys(endpointCounts()).sort());
  });
});

describe('websocket-catalog (v3 ws platform inventory layer)', () => {
  interface WsCatalogFamily {
    limits: { maxStreamsPerConnection: number; defaultMaxConnections: number };
    endpoints: Record<string, { market: string; wsApi?: string }>;
  }

  function loadWsCatalog(): {
    connectionLimits: Record<string, number>;
    listenKeyKeepaliveMinutes: number;
    families: Record<string, WsCatalogFamily>;
    platform: Record<string, number>;
  } {
    return JSON.parse(readFileSync(join(CONTRACTS, 'websocket-catalog.json'), 'utf8'));
  }

  it('matches the platform family limits exactly (no drift)', () => {
    const catalog = loadWsCatalog();
    expect(Object.keys(catalog.families).sort()).toEqual(['coinm', 'spot', 'usdm']);
    for (const [family, entry] of Object.entries(catalog.families)) {
      expect(entry.limits).toEqual(WS_FAMILY_LIMITS[family as keyof typeof WS_FAMILY_LIMITS]);
    }
  });

  it('matches the platform policy constants exactly (no drift)', () => {
    const { platform } = loadWsCatalog();
    expect(platform.rotationMs).toBe(WS_PLATFORM_DEFAULTS.rotationMs);
    expect(platform.renewalJitterMs).toBe(WS_PLATFORM_DEFAULTS.renewalJitterMs);
    expect(platform.staleMs).toBe(WS_PLATFORM_DEFAULTS.staleMs);
    expect(platform.heartbeatIntervalMs).toBe(WS_PLATFORM_DEFAULTS.heartbeatIntervalMs);
    expect(platform.maxConcurrentRenewals).toBe(WS_PLATFORM_DEFAULTS.maxConcurrentRenewals);
    expect(platform.requestTimeoutMs).toBe(WS_PLATFORM_DEFAULTS.requestTimeoutMs);
  });

  it('encodes Binance-documented connection semantics', () => {
    const catalog = loadWsCatalog();
    // 24h stream lifetime, renewed at 23h with jitter, pings every 3 min.
    expect(catalog.connectionLimits.lifetimeHours).toBe(24);
    expect(catalog.platform.rotationHours).toBe(23);
    expect(catalog.connectionLimits.serverPingIntervalMinutes).toBe(3);
    expect(catalog.listenKeyKeepaliveMinutes).toBe(30);
    // 10 minutes of total silence (with 3-minute pings) means a dead path.
    expect(catalog.platform.staleMs).toBe(10 * 60 * 1000);
  });

  it('lists live market endpoints for every family', () => {
    const { families } = loadWsCatalog();
    expect(families.usdm.endpoints.live.market).toContain('fstream.binance.com');
    expect(families.spot.endpoints.live.market).toContain('stream.binance.com');
    expect(families.coinm.endpoints.live.market).toContain('dstream.binance.com');
    expect(families.usdm.endpoints.live.wsApi).toContain('ws-fapi');
    expect(families.spot.endpoints.live.wsApi).toContain('ws-api');
  });
});
