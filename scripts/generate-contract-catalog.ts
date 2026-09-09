/**
 * Generates the v3 machine-readable contract catalogs under `contracts/` —
 * the inventory layer of the specification-driven architecture:
 *
 *   contracts/catalog.json          — index (version, counts, file list)
 *   contracts/endpoint-catalog.json — every implemented REST operation
 *   contracts/security-catalog.json — authentication matrix per product
 *
 * Run: npm run contracts:generate
 *
 * The catalog is the input contract layer for future generated bindings:
 * REST method generation, tool metadata, coverage tests and docs all
 * consume this file, so there is exactly one source of truth (the
 * registry) and one derived artifact per concern.
 *
 * It is validated in CI by test/contracts/catalog.test.ts, which fails
 * when the checked-in catalog drifts from the registry — the catalog
 * cannot silently rot.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY, endpointCounts, type EndpointEntry } from '../src/registry/endpoints.js';

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
    'Machine-readable inventory of the SDK REST surface, derived from src/registry. WebSocket and schema catalogs land with the v3 WS platform milestone.',
  products,
  totalEndpoints: entries.length,
  files: ['catalog.json', 'endpoint-catalog.json', 'security-catalog.json'],
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

console.log(
  `[contracts] generated catalog.json, endpoint-catalog.json, security-catalog.json ` +
    `(${entries.length} endpoints across ${products.length} products)`,
);
