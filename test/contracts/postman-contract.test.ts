import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY } from '../../src/registry/endpoints.js';

const ROOT = join(import.meta.dirname, '..', '..');
const CONTRACTS = join(ROOT, 'contracts');

describe('Postman contract layer', () => {
  it('postman-catalog.json is the authoritative source from Binance official repo', () => {
    const catalog = JSON.parse(readFileSync(join(CONTRACTS, 'postman-catalog.json'), 'utf8'));
    expect(catalog.sourceUrl).toBe('https://github.com/binance/binance-api-postman');
    expect(catalog.officialDocsUrl).toBe(
      'https://developers.binance.com/en/docs/sdks-tools/postman/collections',
    );
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.totalEndpoints).toBeGreaterThan(680);
    expect(catalog.totalCollections).toBeGreaterThan(20);
    expect(Array.isArray(catalog.endpoints)).toBe(true);
  });

  it('every endpoint in the catalog carries a full canonical shape', () => {
    const catalog = JSON.parse(readFileSync(join(CONTRACTS, 'postman-catalog.json'), 'utf8'));
    for (const c of catalog.endpoints) {
      expect(c.product).toBeTruthy();
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(c.method);
      expect(c.path.startsWith('/')).toBe(true);
      expect(['public', 'apiKey', 'signed']).toContain(c.auth);
      expect(c.hostKey).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.docRef).toBeTruthy();
    }
  });

  it('postman-source-index.json records every collection with a source URL', () => {
    const index = JSON.parse(readFileSync(join(CONTRACTS, 'postman-source-index.json'), 'utf8'));
    expect(index.sourceUrl).toBe('https://github.com/binance/binance-api-postman');
    for (const entry of index.collections) {
      expect(entry.collectionFile).toBeTruthy();
      expect(entry.collectionName).toBeTruthy();
      expect(entry.endpointCount).toBeGreaterThan(0);
      expect(entry.sourceUrl).toContain('github.com/binance/binance-api-postman/blob/master/collections/');
    }
  });

  it('postman-coverage.json compares the contract against the live registry', () => {
    const coverage = JSON.parse(readFileSync(join(CONTRACTS, 'postman-coverage.json'), 'utf8'));
    expect(coverage.sourceUrl).toBe('https://github.com/binance/binance-api-postman');
    expect(Array.isArray(coverage.products)).toBe(true);
    const totalContract = coverage.products.reduce((a: number, p: { contractCount: number }) => a + p.contractCount, 0);
    const totalExisting = coverage.products.reduce((a: number, p: { existingCount: number }) => a + p.existingCount, 0);
    expect(totalContract).toBeGreaterThan(680);
    expect(totalExisting).toBe(ENDPOINT_REGISTRY.length);
    // Match rate is at least 50% — growing toward 100% as the contract-first
    // migration progresses.
    const matchRate = (totalExisting - coverage.products.reduce((a: number, p: { missing: string[] }) => a + p.missing.length, 0)) / totalContract;
    expect(matchRate).toBeGreaterThan(0.5);
  });

  it('the SDK now implements more endpoints than the previous 469 baseline', () => {
    // Wave 5 lifted coverage from 469 (across 16 products) to 587+ (across 25 products).
    expect(ENDPOINT_REGISTRY.length).toBeGreaterThan(580);
    const products = new Set(ENDPOINT_REGISTRY.map((e) => e.product));
    expect(products.size).toBeGreaterThanOrEqual(25);
  });

  it('all 9 Wave-5 product families are present in the registry', () => {
    const products = new Set(ENDPOINT_REGISTRY.map((e) => e.product));
    const wave5 = ['fiat', 'giftCard', 'mining', 'nft', 'pay', 'rebate', 'simpleEarn', 'staking', 'vipLoan'];
    for (const p of wave5) {
      expect(products.has(p as typeof ENDPOINT_REGISTRY[number]['product'])).toBe(true);
    }
  });
});
