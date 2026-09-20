/**
 * Cross-checks the endpoint registry against the LLM/agent tool layer
 * (`src/tools/*.tools.ts`): which registry endpoints have a tool that calls
 * their implementing SDK method, and which don't.
 *
 * Run: npm run tools:coverage
 * Writes: contracts/tool-coverage.json
 *
 * This is a coverage report, not a tool generator. Auto-generating a tool's
 * *handler* from the registry alone isn't possible today — the registry
 * carries product/operation/method/path/security/weight, but no parameter
 * or response schema, so there is nothing to derive an `inputSchema`/handler
 * body from without inventing one (a request/response schema catalog would
 * be the actual prerequisite for that — tracked separately). What this
 * closes is the drift risk the 3.0.0 CHANGELOG's own follow-up named:
 * tool-to-endpoint correspondence was implicit and unverified; this makes
 * it explicit and checkable, the same way generate-endpoint-map.ts already
 * does one layer down (registry vs. `http.<verb>()` call sites).
 *
 * The match is a heuristic: it greps each product's tool file source for
 * `.methodName(` call sites and compares against the trailing segment of
 * each registry entry's `implementedBy` (e.g. "futures.account.balance" ->
 * "balance"). Tool files are scoped to the one product they're written
 * against (TOOL_FILE_PRODUCTS below) specifically so a same-named method on
 * a *different* product's resource (e.g. every product has a `getOrder`)
 * can't produce a false positive. Composite layers that don't map 1:1 to a
 * single registry row — derived ops, the execution gateway, WS, paper — are
 * intentionally excluded, not reported as "uncovered".
 *
 * Building this surfaced a real bug, now fixed: four `implementedBy`
 * entries in src/registry/usdm.endpoints.ts (FuturesAccount) carried a
 * stale `get`-prefixed method name (e.g. `getCommissionRate`) the resource
 * class doesn't have (`commissionRate`) — silently wrong in generated docs
 * and llms.txt, invisible to the registry-vs-HTTP-path check because that
 * check never looks at `implementedBy` at all.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY, type EndpointEntry } from '../src/registry/endpoints.js';

const ROOT = join(import.meta.dirname, '..');
const TOOLS_DIR = join(ROOT, 'src', 'tools');
const CONTRACTS_DIR = join(ROOT, 'contracts');

/**
 * Which product each raw per-endpoint tool file is written against — the
 * only files checked here. Files not listed (derived, execution, ws, paper,
 * index, types) are composite/non-REST layers, out of scope for this check.
 */
const TOOL_FILE_PRODUCTS: Record<string, EndpointEntry['product']> = {
  'market-data.tools.ts': 'usdm',
  'account.tools.ts': 'usdm',
  'trading.tools.ts': 'usdm',
  'spot.tools.ts': 'spot',
};

function methodNameOf(implementedBy: string): string {
  const parts = implementedBy.split('.');
  return parts[parts.length - 1];
}

function callSitesIn(source: string): Set<string> {
  const names = new Set<string>();
  const pattern = /\.([a-zA-Z_$][\w$]*)\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) names.add(match[1]);
  return names;
}

interface UncoveredRow {
  product: string;
  operation: string;
  method: string;
  path: string;
}

const productSource = new Map<EndpointEntry['product'], string>();
for (const [file, product] of Object.entries(TOOL_FILE_PRODUCTS)) {
  const filePath = join(TOOLS_DIR, file);
  const existing = productSource.get(product) ?? '';
  productSource.set(product, existing + (existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''));
}

const productCallSites = new Map<EndpointEntry['product'], Set<string>>();
for (const [product, source] of productSource) {
  productCallSites.set(product, callSitesIn(source));
}

const CHECKED_PRODUCTS = new Set(Object.values(TOOL_FILE_PRODUCTS));
const ALL_PRODUCTS = [...new Set(ENDPOINT_REGISTRY.map((e) => e.product))];
const productsWithNoToolSurface = ALL_PRODUCTS.filter((p) => !CHECKED_PRODUCTS.has(p)).sort();

let checkedCount = 0;
let coveredCount = 0;
const uncovered: UncoveredRow[] = [];

for (const entry of ENDPOINT_REGISTRY) {
  if (!CHECKED_PRODUCTS.has(entry.product)) continue; // no tool surface at all for this product yet
  checkedCount += 1;
  const calls = productCallSites.get(entry.product) ?? new Set();
  const method = methodNameOf(entry.implementedBy);
  if (calls.has(method)) {
    coveredCount += 1;
  } else {
    uncovered.push({ product: entry.product, operation: entry.operation, method: entry.method, path: entry.path });
  }
}

const coveragePct = checkedCount ? Math.round((coveredCount / checkedCount) * 1000) / 10 : 0;

const report = {
  catalogVersion: 1,
  generatedAt: new Date().toISOString(),
  description:
    'Heuristic coverage of the LLM/agent tool layer (src/tools/*.tools.ts) against the endpoint ' +
    'registry — see this script\'s header for the matching method and its limits. Not a substitute ' +
    'for a schema-driven tool generator.',
  checkedProducts: [...CHECKED_PRODUCTS].sort(),
  productsWithNoToolSurface,
  totalCheckedEndpoints: checkedCount,
  coveredEndpoints: coveredCount,
  coveragePct,
  uncovered,
};

mkdirSync(CONTRACTS_DIR, { recursive: true });
writeFileSync(join(CONTRACTS_DIR, 'tool-coverage.json'), JSON.stringify(report, null, 2) + '\n');

console.log(
  `[tool-coverage] ${coveredCount}/${checkedCount} (${coveragePct}%) checked endpoints have a ` +
    `matching tool call site across ${[...CHECKED_PRODUCTS].sort().join(', ')}.`,
);
if (productsWithNoToolSurface.length) {
  console.log(`[tool-coverage] no tool file at all for: ${productsWithNoToolSurface.join(', ')}.`);
}
if (uncovered.length) {
  console.log(`[tool-coverage] ${uncovered.length} endpoint(s) with no matching tool call site:`);
  for (const row of uncovered) {
    console.log(`  - ${row.product} ${row.operation} (${row.method} ${row.path})`);
  }
}
