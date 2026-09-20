import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import {
  createFuturesToolkit,
  toJsonSchema,
  type FuturesToolkit,
  type ToolAnnotations,
} from '../../src/tools/index.js';

const ROOT = join(import.meta.dirname, '..', '..');
const CONTRACTS = join(ROOT, 'contracts');
const CATEGORIES = ['market', 'account', 'trading', 'spot', 'derived', 'execution', 'ws', 'paper'] as const;

interface CatalogTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations | null;
}

interface Catalog {
  catalogVersion: number;
  totalTools: number;
  categories: Record<(typeof CATEGORIES)[number], { product: string | null; count: number; tools: CatalogTool[] }>;
}

function loadCatalog(): Catalog {
  return JSON.parse(readFileSync(join(CONTRACTS, 'schema-catalog.json'), 'utf8'));
}

describe('schema-catalog.json (tool request schemas)', () => {
  // Constructing the toolkit performs no network I/O — every client/resource is lazy.
  const toolkit: FuturesToolkit = createFuturesToolkit(new BinanceClient({}));

  it('totalTools matches the live toolkit exactly (no drift)', () => {
    expect(loadCatalog().totalTools).toBe(toolkit.tools.length);
  });

  it('every category count and tool name matches the live toolkit', () => {
    const catalog = loadCatalog();
    for (const category of CATEGORIES) {
      const live = toolkit[category];
      const cataloged = catalog.categories[category];
      expect(cataloged.count).toBe(live.length);
      expect(cataloged.tools.map((t) => t.name)).toEqual(live.map((t) => t.name));
    }
  });

  it('every cataloged schema matches a fresh conversion of the live tool\'s Zod inputSchema', () => {
    const catalog = loadCatalog();
    for (const category of CATEGORIES) {
      const live = toolkit[category];
      const cataloged = catalog.categories[category].tools;
      for (let i = 0; i < live.length; i++) {
        expect(cataloged[i].description).toBe(live[i].description);
        expect(cataloged[i].inputSchema).toEqual(toJsonSchema(live[i].inputSchema));
      }
    }
  });

  it('every cataloged annotations object matches the live tool\'s (no drift between catalog and MCP server)', () => {
    const catalog = loadCatalog();
    for (const category of CATEGORIES) {
      const live = toolkit[category];
      const cataloged = catalog.categories[category].tools;
      for (let i = 0; i < live.length; i++) {
        expect(cataloged[i].annotations).toEqual(live[i].annotations ?? null);
      }
    }
  });

  it('every tool has an explicit annotations object -- none fell through as null', () => {
    const catalog = loadCatalog();
    for (const category of Object.values(catalog.categories)) {
      for (const tool of category.tools) {
        expect(tool.annotations, `${tool.name} has no annotations`).not.toBeNull();
      }
    }
  });

  it('stays scoped to tool inputs — no hand-curated response-schema claims', () => {
    // The generator's whole point is refusing to guess response-schema
    // associations (see scripts/generate-schema-catalog.ts's header). If a
    // future edit adds a `responseSchema` field, it must be mechanically
    // derived and re-verified the same way inputSchema is above — not
    // silently hand-added.
    const catalog = loadCatalog();
    for (const category of Object.values(catalog.categories)) {
      for (const tool of category.tools) {
        expect(tool).not.toHaveProperty('responseSchema');
      }
    }
  });

  it('paper tools are labeled with no product (simulator, not a real product)', () => {
    expect(loadCatalog().categories.paper.product).toBeNull();
  });
});
