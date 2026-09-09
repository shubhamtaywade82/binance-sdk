import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY, endpointCounts, findEndpoint, listEndpoints } from '../../src/registry/endpoints.js';

const ROOT = join(import.meta.dirname, '../..');

describe('endpoint registry', () => {
  it('has no duplicate (product, operation) entries', () => {
    const operationKeys = ENDPOINT_REGISTRY.map((e) => `${e.product}:${e.operation}`);
    expect(new Set(operationKeys).size).toBe(operationKeys.length);
  });

  it('every entry carries a full canonical path and an SDK surface', () => {
    for (const entry of ENDPOINT_REGISTRY) {
      expect(entry.path).toMatch(/^\/(api|fapi|dapi|sapi|futures)\//);
      expect(entry.implementedBy).toMatch(/^[a-z]+(\.[a-zA-Z0-9]+)+$/);
      expect(['public', 'apiKey', 'signed']).toContain(entry.authentication);
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(entry.method);
    }
  });

  it('queries filter by product, method and auth', () => {
    const signedUsdm = listEndpoints({ product: 'usdm', authentication: 'signed' });
    expect(signedUsdm.length).toBeGreaterThan(10);
    for (const entry of signedUsdm) {
      expect(entry.product).toBe('usdm');
      expect(entry.authentication).toBe('signed');
    }

    const publicSpot = listEndpoints({ product: 'spot', authentication: 'public' });
    expect(publicSpot.length).toBeGreaterThan(5);

    expect(listEndpoints({ pathPrefix: '/sapi/v1/capital/' }).length).toBeGreaterThan(2);
  });

  it('findEndpoint locates entries by method+path', () => {
    const entry = findEndpoint('/fapi/v1/order', 'POST');
    expect(entry?.operation).toBe('trading.createOrder');
    expect(entry?.implementedBy).toBe('futures.trading.createOrder');
    expect(findEndpoint('/fapi/v1/order', 'PUT')?.operation).toBe('trading.modifyOrder');
  });

  it('counts per product match the registry contents', () => {
    const counts = endpointCounts();
    expect(counts.spot).toBe(listEndpoints({ product: 'spot' }).length);
    expect(counts.usdm).toBe(listEndpoints({ product: 'usdm' }).length);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(ENDPOINT_REGISTRY.length);
    expect(ENDPOINT_REGISTRY.length).toBeGreaterThan(200);
  });

  it('generated docs exist and stay in sync with the registry', () => {
    expect(existsSync(join(ROOT, 'llms.txt'))).toBe(true);
    expect(existsSync(join(ROOT, 'llms-full.txt'))).toBe(true);
    const full = readFileSync(join(ROOT, 'llms-full.txt'), 'utf8');
    for (const entry of listEndpoints({ product: 'spot' })) {
      expect(full).toContain(`${entry.method} ${entry.path}`);
    }
    for (const product of ['spot', 'usdm', 'coinm', 'margin', 'wallet', 'subaccount'] as const) {
      expect(existsSync(join(ROOT, 'docs', 'endpoint-map', `${product}.md`))).toBe(true);
    }
  });
});
