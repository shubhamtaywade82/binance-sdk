/**
 * Generates `contracts/schema-catalog.json` — machine-readable JSON Schema
 * for every LLM/agent tool's request parameters (`src/tools/*.tools.ts`, as
 * assembled by `createFuturesToolkit()`).
 *
 * Run: npm run schema:generate
 *
 * Scope, deliberately: this catalogs *tool* request parameters, not a
 * request/response schema for every registry endpoint (~220 of them). That
 * would be a bigger, riskier undertaking, checked and rejected here:
 * fewer than two-thirds of resource methods return through a Zod `.parse()`
 * call at all (`grep -c 'Schema\.parse(' src/resources/*.ts` across 220
 * registry endpoints comes to 147, and several of *those* return via a
 * schema shared across multiple methods — e.g. `CoinMOrderResponseSchema`
 * backs `createOrder`/`getOrder`/`cancelOrder` alike). There is no
 * mechanical, drift-proof way to say which registry operation a given
 * schema export belongs to without hand-curating ~220 associations by eye,
 * which this project's own contract layer explicitly avoids doing (see
 * `src/contracts/index.ts`'s header: hand-curated but *mechanically
 * checked*, never hand-curated and trusted).
 *
 * Tool *input* schemas have no such problem: every `ToolDefinition` already
 * carries its own Zod `inputSchema` — hand-authored, but 1:1 with the tool,
 * never shared across tools — so the conversion below is exact, not a
 * guess. All 159 tools converted cleanly through `z.toJSONSchema` before
 * this script was written; if a future tool's schema doesn't, this script
 * throws rather than silently emitting a bad catalog entry.
 *
 * Each entry also carries `annotations` — the standard MCP `ToolAnnotations`
 * (readOnlyHint/destructiveHint/idempotentHint/openWorldHint) assigned in
 * `src/tools/annotations.ts` by reading every tool's actual handler, not
 * its name. `createFuturesToolkit()` attaches these to every tool before
 * this script ever sees them, so the catalog and the live MCP server
 * (`src/mcp/server.ts`) can never disagree about a tool's classification.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BinanceClient } from '../src/client/BinanceClient.js';
import {
  createFuturesToolkit,
  toJsonSchema,
  type FuturesToolkit,
  type ToolDefinition,
} from '../src/tools/index.js';

const ROOT = join(import.meta.dirname, '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');

const CATEGORIES = ['market', 'account', 'trading', 'spot', 'derived', 'execution', 'ws', 'paper'] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * Product each tool category calls against. `derived`/`execution`/`ws` all
 * operate on the USDⓈ-M surface today (`client.futures.*`); `paper` is the
 * simulator, not a real product.
 */
const CATEGORY_PRODUCTS: Record<Category, string | null> = {
  market: 'usdm',
  account: 'usdm',
  trading: 'usdm',
  spot: 'spot',
  derived: 'usdm',
  execution: 'usdm',
  ws: 'usdm',
  paper: null,
};

function schemaFor(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toJsonSchema(tool.inputSchema),
    annotations: tool.annotations ?? null,
  };
}

function categoryEntry(tools: ToolDefinition[], product: string | null) {
  return { product, count: tools.length, tools: tools.map(schemaFor) };
}

// Constructing a client and toolkit performs no network I/O — every REST
// client and resource is lazy — so this is safe to run at build/CI time.
const client = new BinanceClient({});
const toolkit: FuturesToolkit = createFuturesToolkit(client);

const categories: Record<Category, ReturnType<typeof categoryEntry>> = {} as Record<
  Category,
  ReturnType<typeof categoryEntry>
>;
for (const category of CATEGORIES) {
  categories[category] = categoryEntry(toolkit[category], CATEGORY_PRODUCTS[category]);
}

const catalog = {
  catalogVersion: 1,
  generatedAt: new Date().toISOString(),
  description:
    "JSON Schema + MCP ToolAnnotations for every LLM/agent tool (src/tools/*.tools.ts via " +
    "createFuturesToolkit()). Scope: tool inputs only, not a response schema per registry " +
    "endpoint -- see this file's generator script header for why that's a separate, harder " +
    'problem. inputSchema is generated directly from each tool\'s own Zod schema (zero ' +
    'hand-curation); annotations are hand-classified per tool in src/tools/annotations.ts ' +
    '(readOnlyHint/destructiveHint/idempotentHint/openWorldHint) and attached before this ' +
    'script runs, so this file and the live MCP server can never disagree.',
  totalTools: toolkit.tools.length,
  categories,
};

mkdirSync(CONTRACTS_DIR, { recursive: true });
writeFileSync(join(CONTRACTS_DIR, 'schema-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');

console.log(
  `[schema-catalog] generated schema-catalog.json: ${toolkit.tools.length} tool schemas across ` +
    `${CATEGORIES.length} categories`,
);
