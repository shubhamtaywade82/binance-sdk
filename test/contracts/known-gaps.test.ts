import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY } from '../../src/registry/endpoints.js';

const CONTRACTS = join(import.meta.dirname, '..', '..', 'contracts');

interface CatalogEndpoint {
  method: string;
  path: string;
}

interface KnownGaps {
  endpoints: Array<{ method: string; path: string; reason: string }>;
  collections: Array<{ file: string; reason: string }>;
}

function readContract<T>(file: string): T {
  return JSON.parse(readFileSync(join(CONTRACTS, file), 'utf8')) as T;
}

const catalog = readContract<{ pinnedSha: string; pinnedAt: string; endpoints: CatalogEndpoint[] }>('postman-catalog.json');
const sourceIndex = readContract<{ pinnedSha: string; pinnedAt: string; unmappedCollections: string[] }>('postman-source-index.json');
const knownGaps = readContract<KnownGaps>('postman-known-gaps.json');
const key = (e: { method: string; path: string }): string => `${e.method} ${e.path}`;
const implemented = new Set(ENDPOINT_REGISTRY.map(key));
const catalogKeys = new Set(catalog.endpoints.map(key));
const gapKeys = new Set(knownGaps.endpoints.map(key));

describe('Postman known gaps', () => {
  it('should implement or record every upstream endpoint', () => {
    const unrecorded = catalog.endpoints.map(key).filter((k) => !implemented.has(k) && !gapKeys.has(k));
    expect(unrecorded, 'implement these or add them to contracts/postman-known-gaps.json with a reason').toEqual([]);
  });

  it('should drop known gaps that are implemented or gone upstream', () => {
    const stale = [...gapKeys].filter((k) => implemented.has(k) || !catalogKeys.has(k));
    expect(stale).toEqual([]);
  });

  it('should record every unmapped upstream collection, and only those', () => {
    const recorded = knownGaps.collections.map((c) => c.file).sort();
    expect(recorded).toEqual([...sourceIndex.unmappedCollections].sort());
  });

  it('should give every known gap a reason', () => {
    for (const gap of [...knownGaps.endpoints, ...knownGaps.collections]) {
      expect(gap.reason.trim(), JSON.stringify(gap)).not.toBe('');
    }
  });

  it('should pin the catalog and source index to the same upstream commit', () => {
    expect(catalog.pinnedSha).toMatch(/^[0-9a-f]{40}$/);
    expect(catalog.pinnedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sourceIndex.pinnedSha).toBe(catalog.pinnedSha);
    expect(sourceIndex.pinnedAt).toBe(catalog.pinnedAt);
  });
});
