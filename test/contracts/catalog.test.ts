import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_REGISTRY, endpointCounts } from '../../src/registry/endpoints.js';

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
    expect(index.products.sort()).toEqual(Object.keys(endpointCounts()).sort());
  });
});
