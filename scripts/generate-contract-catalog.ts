/**
 * Generates the v3 machine-readable contract catalogs under `contracts/` —
 * the inventory layer of the specification-driven architecture:
 *
 *   contracts/catalog.json          — index (version, counts, file list)
 *   contracts/endpoint-catalog.json — every implemented REST operation
 *   contracts/security-catalog.json — authentication matrix per product
 *   contracts/websocket-catalog.json — WS families, limits, renewal policy
 *
 * Run: npm run contracts:generate
 *
 * The catalog is the input contract layer for future generated bindings:
 * REST method generation, tool metadata, coverage tests and docs all
 * consume this file, so there is exactly one source of truth (the
 * registry + the WS platform constants) and one derived artifact per
 * concern.
 *
 * It is validated in CI by test/contracts/catalog.test.ts, which fails
 * when the checked-in catalog drifts from the registry or the platform
 * constants — the catalogs cannot silently rot.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY, endpointCounts, type EndpointEntry } from '../src/registry/endpoints.js';
import {
  WS_FAMILY_LIMITS,
  WS_PLATFORM_DEFAULTS,
  type WsFamily,
} from '../src/ws/platform/types.js';
import { resolveEnvironment } from '../src/client/endpoints.js';

const ROOT = join(import.meta.dirname, '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');

interface CatalogEntry {
  product: string;
  operation: string;
  transport: 'rest';
  method: EndpointEntry['method'];
  path: string;
  security: 'PUBLIC' | 'API_KEY' | 'SIGNED';
  weight: number | null;
  implementedBy: string;
}

function securityFromAuth(auth: EndpointEntry['authentication']): CatalogEntry['security'] {
  switch (auth) {
    case 'signed':
      return 'SIGNED';
    case 'apiKey':
      return 'API_KEY';
    default:
      return 'PUBLIC';
  }
}

const entries: CatalogEntry[] = ENDPOINT_REGISTRY.map((entry) => ({
  product: entry.product,
  operation: entry.operation,
  transport: 'rest',
  method: entry.method,
  path: entry.path,
  security: securityFromAuth(entry.authentication),
  weight: entry.weight ?? null,
  implementedBy: entry.implementedBy,
}));

const counts = endpointCounts();
const products = Object.keys(counts).sort();

const securityMatrix: Record<
  string,
  { public: number; apiKey: number; signed: number; total: number }
> = {};
for (const product of products) {
  securityMatrix[product] = { public: 0, apiKey: 0, signed: 0, total: counts[product] };
}
for (const entry of entries) {
  const row = securityMatrix[entry.product];
  if (entry.security === 'PUBLIC') row.public += 1;
  else if (entry.security === 'API_KEY') row.apiKey += 1;
  else row.signed += 1;
}

const index = {
  $schema: './catalog.schema.json',
  catalogVersion: 1,
  sdkVersion: '3.0.0-next',
  generatedAt: new Date().toISOString(),
  description:
    'Machine-readable inventory of the SDK REST + WebSocket surface, derived from src/registry and the v3 WS platform. Schema catalogs land with the coverage compiler milestone.',
  products,
  totalEndpoints: entries.length,
  wsFamilies: Object.keys(WS_FAMILY_LIMITS).sort(),
  files: [
    'catalog.json',
    'endpoint-catalog.json',
    'security-catalog.json',
    'websocket-catalog.json',
  ],
};

function endpointsFor(env: 'live' | 'testnet' | 'demo'): Record<WsFamily, { market: string; wsApi?: string }> {
  const { endpoints } = resolveEnvironment(env === 'live' ? {} : env === 'testnet' ? { testnet: true } : { demo: true });
  return {
    usdm: { market: endpoints.wsMarket, wsApi: endpoints.wsApi },
    spot: { market: endpoints.wsSpotMarket, wsApi: endpoints.wsSpotApi },
    coinm: { market: endpoints.wsDapiMarket },
  };
}

const websocketCatalog = {
  catalogVersion: 1,
  generatedAt: index.generatedAt,
  description:
    'WebSocket platform contract: stream families with documented Binance connection limits, endpoints per environment, and the SDK renewal/liveness policy. Derived from src/ws/platform/types.ts (WS_FAMILY_LIMITS / WS_PLATFORM_DEFAULTS) and src/client/endpoints.ts.',
  connectionLimits: {
    lifetimeHours: 24,
    serverPingIntervalMinutes: 3,
    pongWindowMinutes: 10,
  },
  listenKeyKeepaliveMinutes: 30,
  families: {
    usdm: {
      limits: WS_FAMILY_LIMITS.usdm,
      endpoints: {
        live: endpointsFor('live').usdm,
        testnet: endpointsFor('testnet').usdm,
        demo: endpointsFor('demo').usdm,
      },
    },
    spot: {
      limits: WS_FAMILY_LIMITS.spot,
      endpoints: {
        live: endpointsFor('live').spot,
        testnet: endpointsFor('testnet').spot,
        demo: endpointsFor('demo').spot,
      },
    },
    coinm: {
      limits: WS_FAMILY_LIMITS.coinm,
      endpoints: {
        live: endpointsFor('live').coinm,
        testnet: endpointsFor('testnet').coinm,
        demo: endpointsFor('demo').coinm,
      },
    },
  },
  platform: {
    rotationMs: WS_PLATFORM_DEFAULTS.rotationMs,
    rotationHours: WS_PLATFORM_DEFAULTS.rotationMs / 3_600_000,
    renewalJitterMs: WS_PLATFORM_DEFAULTS.renewalJitterMs,
    staleMs: WS_PLATFORM_DEFAULTS.staleMs,
    heartbeatIntervalMs: WS_PLATFORM_DEFAULTS.heartbeatIntervalMs,
    maxConcurrentRenewals: WS_PLATFORM_DEFAULTS.maxConcurrentRenewals,
    requestTimeoutMs: WS_PLATFORM_DEFAULTS.requestTimeoutMs,
    reconnectBaseDelayMs: WS_PLATFORM_DEFAULTS.reconnectBaseDelayMs,
    reconnectMaxDelayMs: WS_PLATFORM_DEFAULTS.reconnectMaxDelayMs,
  },
};

mkdirSync(CONTRACTS_DIR, { recursive: true });
writeFileSync(
  join(CONTRACTS_DIR, 'catalog.json'),
  JSON.stringify(index, null, 2) + '\n',
);
writeFileSync(
  join(CONTRACTS_DIR, 'endpoint-catalog.json'),
  JSON.stringify({ catalogVersion: 1, generatedAt: index.generatedAt, endpoints: entries }, null, 2) + '\n',
);
writeFileSync(
  join(CONTRACTS_DIR, 'security-catalog.json'),
  JSON.stringify({ catalogVersion: 1, generatedAt: index.generatedAt, products: securityMatrix }, null, 2) + '\n',
);
writeFileSync(
  join(CONTRACTS_DIR, 'websocket-catalog.json'),
  JSON.stringify(websocketCatalog, null, 2) + '\n',
);

console.log(
  `[contracts] generated catalog.json, endpoint-catalog.json, security-catalog.json, websocket-catalog.json ` +
    `(${entries.length} endpoints across ${products.length} products, ${Object.keys(WS_FAMILY_LIMITS).length} ws families)`,
);
