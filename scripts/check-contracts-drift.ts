/**
 * CI drift check — verifies that the endpoint catalog, security catalog,
 * llms.txt docs and endpoint map stay in sync with the live registry.
 *
 * Run via `npm run contracts:check` in CI. Fails (exit 1) on any drift.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDPOINT_REGISTRY, endpointCounts, listEndpoints } from '../src/registry/endpoints.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS = join(ROOT, 'contracts');
const DOCS = join(ROOT, 'docs', 'endpoint-map');

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

function loadSecurityCatalog(): {
  products: Record<string, { public: number; apiKey: number; signed: number; total: number }>;
} {
  return JSON.parse(readFileSync(join(CONTRACTS, 'security-catalog.json'), 'utf8'));
}

function loadCatalogIndex(): {
  catalogVersion: number;
  totalEndpoints: number;
  files: string[];
  products: string[];
} {
  return JSON.parse(readFileSync(join(CONTRACTS, 'catalog.json'), 'utf8'));
}

let failures = 0;
function fail(msg: string): void {
  // The message is a developer-facing drift description (no user input, no
  // secret material). CodeQL's clear-text-logging rule previously flagged
  // this because `msg` is sometimes built from catalog-derived field names
  // that include the literal substring "apiKey" (e.g. the catalog counts
  // API-key-authenticated endpoints). Those are field names, not secrets.
  // codeql-disable-next-line ts-express/clear-text-logging
  console.error(`  ✗ ${msg}`);
  failures++;
}
function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

console.log('\n[contracts:check] Validating endpoint catalog ↔ registry sync…');

// 1. endpoint-catalog.json matches the registry exactly
const catalog = loadCatalog();
const registryKeys = ENDPOINT_REGISTRY.map((e) => `${e.method} ${e.path} ${e.operation}`).sort();
const catalogKeys = catalog.endpoints.map((e) => `${e.method} ${e.path} ${e.operation}`).sort();
if (registryKeys.length !== catalogKeys.length) {
  fail(`endpoint-catalog has ${catalogKeys.length} entries but registry has ${registryKeys.length}`);
} else if (JSON.stringify(registryKeys) !== JSON.stringify(catalogKeys)) {
  fail('endpoint-catalog entries do not match registry entries (method+path+operation)');
  // diff first 5 mismatches
  const regset = new Set(registryKeys);
  const catset = new Set(catalogKeys);
  const missing = registryKeys.filter((k) => !catset.has(k)).slice(0, 5);
  const extra = catalogKeys.filter((k) => !regset.has(k)).slice(0, 5);
  if (missing.length) console.error('    Missing from catalog:', missing);
  if (extra.length) console.error('    Extra in catalog:', extra);
} else {
  ok(`endpoint-catalog matches registry (${registryKeys.length} entries)`);
}

// 2. security-catalog totals match the endpoint catalog per product
const security = loadSecurityCatalog();
let securityOk = true;
for (const [product, row] of Object.entries(security.products)) {
  const productEntries = catalog.endpoints.filter((e) => e.product === product);
  if (row.total !== productEntries.length) {
    fail(`security-catalog[${product}].total = ${row.total} but catalog has ${productEntries.length}`);
    securityOk = false;
  }
  const pub = productEntries.filter((e) => e.security === 'PUBLIC').length;
  const key = productEntries.filter((e) => e.security === 'API_KEY').length;
  const sig = productEntries.filter((e) => e.security === 'SIGNED').length;
  if (row.public !== pub || row.apiKey !== key || row.signed !== sig) {
    fail(`security-catalog[${product}] breakdown mismatch: ${row.public}/${row.apiKey}/${row.signed} vs ${pub}/${key}/${sig}`);
    securityOk = false;
  }
}
if (securityOk) ok('security-catalog totals match endpoint catalog per product');

// 3. every registry product is present in the security matrix
let productsOk = true;
for (const product of Object.keys(endpointCounts())) {
  if (security.products[product] === undefined) {
    fail(`security-catalog missing product '${product}'`);
    productsOk = false;
  }
}
if (productsOk) ok('security-catalog covers every registry product');

// 4. catalog.json index lists the files and correct totals
const index = loadCatalogIndex();
if (index.catalogVersion !== 1) {
  fail(`catalog.json catalogVersion = ${index.catalogVersion}, expected 1`);
} else {
  ok('catalog.json catalogVersion = 1');
}
if (index.totalEndpoints !== ENDPOINT_REGISTRY.length) {
  fail(`catalog.json totalEndpoints = ${index.totalEndpoints}, expected ${ENDPOINT_REGISTRY.length}`);
} else {
  ok(`catalog.json totalEndpoints = ${index.totalEndpoints}`);
}
for (const file of ['endpoint-catalog.json', 'security-catalog.json', 'websocket-catalog.json']) {
  if (!index.files.includes(file)) {
    fail(`catalog.json missing file '${file}'`);
  }
}
if (!index.files.includes('endpoint-catalog.json')) fail('catalog.json missing endpoint-catalog.json');
const sortedIndex = [...index.products].sort();
const sortedCounts = Object.keys(endpointCounts()).sort();
if (JSON.stringify(sortedIndex) !== JSON.stringify(sortedCounts)) {
  fail(`catalog.json products list does not match registry: ${JSON.stringify(sortedIndex)} vs ${JSON.stringify(sortedCounts)}`);
} else {
  ok('catalog.json products list matches registry');
}

// 5. per-product docs/endpoint-map/*.md exists for the 6 first-class products
const legacyDocsProducts = ['spot', 'usdm', 'coinm', 'margin', 'wallet', 'subaccount'] as const;
for (const product of legacyDocsProducts) {
  if (!existsSync(join(DOCS, `${product}.md`))) {
    fail(`docs/endpoint-map/${product}.md missing`);
  }
}
ok(`docs/endpoint-map/ has all ${legacyDocsProducts.length} first-class product docs`);

// 6. llms.txt and llms-full.txt exist and contain at least one entry per product
const llmsPath = join(ROOT, 'llms.txt');
const llmsFullPath = join(ROOT, 'llms-full.txt');
if (!existsSync(llmsPath)) fail('llms.txt missing');
if (!existsSync(llmsFullPath)) fail('llms-full.txt missing');
if (existsSync(llmsFullPath)) {
  const full = readFileSync(llmsFullPath, 'utf8');
  const missingFromFull = [];
  for (const entry of listEndpoints({ product: 'spot' })) {
    if (!full.includes(`${entry.method} ${entry.path}`)) {
      missingFromFull.push(`${entry.method} ${entry.path}`);
    }
  }
  if (missingFromFull.length) {
    fail(`llms-full.txt missing ${missingFromFull.length} spot endpoints (e.g. ${missingFromFull[0]})`);
  } else {
    ok('llms-full.txt contains all spot endpoint lines');
  }
}

// 7. coverage summary across products
const counts = endpointCounts();
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log('\n[contracts:check] Coverage summary:');
const productOrder = [
  'spot', 'usdm', 'coinm', 'margin', 'wallet', 'subaccount',
  'options', 'portfolio', 'portfolioPro',
  'cryptoLoan', 'convert', 'algo', 'dualInvestment', 'alpha', 'copyTrading', 'c2c',
] as const;
for (const product of productOrder) {
  if (counts[product] !== undefined) {
    console.log(`  ${product.padEnd(20)} ${counts[product]} endpoints`);
  }
}
console.log(`  ${'TOTAL'.padEnd(20)} ${total} endpoints\n`);

if (failures > 0) {
  console.error(`[contracts:check] FAILED — ${failures} drift issue(s) detected.`);
  console.error('  Run `npm run contracts:generate && npm run docs:generate` to regenerate.');
  process.exit(1);
}
console.log(`[contracts:check] OK — endpoint catalog, security catalog, docs, and registry are in sync.`);
