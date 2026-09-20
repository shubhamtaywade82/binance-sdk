import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENDPOINT_REGISTRY, endpointCounts, type EndpointEntry } from '../../src/registry/endpoints.js';

const ROOT = join(import.meta.dirname, '..', '..');
const CONTRACTS = join(ROOT, 'contracts');

interface ProductRow {
  officialProduct: string;
  npmPackage: string;
  title: string;
  implemented: boolean;
  sdkProduct: string | null;
  endpointCount: number;
  hasToolSurface: boolean;
  note: string | null;
}

interface Catalog {
  catalogVersion: number;
  totalOfficialProducts: number;
  implementedProducts: number;
  implementedPct: number;
  toolCoverage: { checkedProducts: string[]; coveragePct: number } | null;
  products: ProductRow[];
}

function loadCatalog(): Catalog {
  return JSON.parse(readFileSync(join(CONTRACTS, 'product-coverage.json'), 'utf8'));
}

describe('product-coverage.json (SDK vs. Binance official product catalog)', () => {
  it('lists exactly the 26 official Binance connector packages, each exactly once', () => {
    const catalog = loadCatalog();
    expect(catalog.totalOfficialProducts).toBe(26);
    expect(catalog.products).toHaveLength(26);
    const keys = catalog.products.map((p) => p.officialProduct);
    expect(new Set(keys).size).toBe(26); // no duplicates
  });

  it('implementedProducts/implementedPct match the rows exactly', () => {
    const catalog = loadCatalog();
    const implementedRows = catalog.products.filter((p) => p.implemented);
    expect(catalog.implementedProducts).toBe(implementedRows.length);
    expect(catalog.implementedPct).toBe(Math.round((implementedRows.length / 26) * 1000) / 10);
  });

  it('every implemented row has a non-null sdkProduct that is a real registry product', () => {
    const registryProducts = new Set(ENDPOINT_REGISTRY.map((e) => e.product));
    const catalog = loadCatalog();
    for (const row of catalog.products) {
      if (row.implemented) {
        expect(row.sdkProduct, `${row.officialProduct} is implemented but has no sdkProduct`).not.toBeNull();
        expect(registryProducts.has(row.sdkProduct as EndpointEntry['product'])).toBe(true);
      } else {
        expect(row.sdkProduct).toBeNull();
      }
    }
  });

  it("every implemented row's endpointCount matches the live registry count for its sdkProduct", () => {
    const counts = endpointCounts();
    const catalog = loadCatalog();
    for (const row of catalog.products.filter((p) => p.implemented)) {
      expect(row.endpointCount).toBe(counts[row.sdkProduct as string] ?? 0);
    }
  });

  it('every registry product this SDK actually implements is mapped to some official product (no silent gap)', () => {
    const catalog = loadCatalog();
    const mappedSdkProducts = new Set(catalog.products.filter((p) => p.sdkProduct).map((p) => p.sdkProduct));
    const registryProducts = new Set(ENDPOINT_REGISTRY.map((e) => e.product));
    for (const product of registryProducts) {
      expect(mappedSdkProducts.has(product), `registry product "${product}" has no OFFICIAL_PRODUCTS mapping`).toBe(true);
    }
  });

  it('unimplemented rows carry a zero endpoint count and no tool surface', () => {
    const catalog = loadCatalog();
    for (const row of catalog.products.filter((p) => !p.implemented)) {
      expect(row.endpointCount).toBe(0);
      expect(row.hasToolSurface).toBe(false);
    }
  });

  it('the six currently-implemented products are exactly spot/usdm/coinm/margin/wallet/subaccount', () => {
    const catalog = loadCatalog();
    const implemented = catalog.products.filter((p) => p.implemented).map((p) => p.sdkProduct).sort();
    expect(implemented).toEqual(['coinm', 'margin', 'spot', 'subaccount', 'usdm', 'wallet']);
  });
});
