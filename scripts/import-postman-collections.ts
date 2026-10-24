/**
 * Contract compiler — turns Binance Postman collections into the SDK's
 * machine-readable contract layer.
 *
 * Source of truth: the official Binance Postman repository
 *   https://github.com/binance/binance-api-postman
 * (verified by Binance Developer Docs:
 *   https://developers.binance.com/en/docs/sdks-tools/postman/collections)
 *
 * The compiler walks each Postman collection JSON, extracts every leaf
 * request, normalizes it into a canonical `EndpointContract`, and writes:
 *
 *   contracts/postman-catalog.json          — flat endpoint inventory
 *   contracts/postman-source-index.json     — per-collection source metadata
 *
 * The output is consumed by `scripts/generate-sdk-from-contracts.ts` to
 * drive a contract-first implementation across all Binance products.
 *
 * Run via: `npm run contracts:import-postman`
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTIONS_DIR = process.env.POSTMAN_COLLECTIONS_DIR
  ?? join(ROOT, '..', 'postman-extract', 'binance-api-postman-master', 'collections');
const CONTRACTS_DIR = join(ROOT, 'contracts');

/**
 * Canonical product family. Derived from the Postman collection filename
 * (e.g. "Binance Derivatives Trading USDS Futures API.json" → "usdm").
 * The mapping intentionally matches the existing EndpointEntry.product
 * union so generated registry rows plug directly into the existing SDK.
 */
const COLLECTION_TO_PRODUCT: Record<string, { product: string; hostKey: string }> = {
  'Binance Spot API.json': { product: 'spot', hostKey: 'apiRoot' },
  'Binance Margin Trading API.json': { product: 'margin', hostKey: 'apiRoot' },
  'Binance Wallet API.json': { product: 'wallet', hostKey: 'apiRoot' },
  'Binance Sub Account API.json': { product: 'subaccount', hostKey: 'apiRoot' },
  'Binance Derivatives Trading USDS Futures API.json': { product: 'usdm', hostKey: 'fapiRoot' },
  'Binance Derivatives Trading COIN Futures API.json': { product: 'coinm', hostKey: 'dapiRoot' },
  'Binance Derivatives Trading Options API.json': { product: 'options', hostKey: 'eapi' },
  'Binance Derivatives Trading Portfolio Margin API.json': { product: 'portfolio', hostKey: 'papi' },
  'Binance Derivatives Trading Portfolio Margin Pro API.json': { product: 'portfolioPro', hostKey: 'apiRoot' },
  'Binance Crypto Loan API.json': { product: 'cryptoLoan', hostKey: 'apiRoot' },
  'Binance Convert API.json': { product: 'convert', hostKey: 'apiRoot' },
  'Binance Algo API.json': { product: 'algo', hostKey: 'apiRoot' },
  'Binance Dual Investment API.json': { product: 'dualInvestment', hostKey: 'apiRoot' },
  'Binance Alpha API.json': { product: 'alpha', hostKey: 'bapi' },
  'Binance Copy Trading API.json': { product: 'copyTrading', hostKey: 'apiRoot' },
  'Binance C2C API.json': { product: 'c2c', hostKey: 'apiRoot' },
  'Binance Fiat API.json': { product: 'fiat', hostKey: 'apiRoot' },
  'Binance Gift Card API.json': { product: 'giftCard', hostKey: 'apiRoot' },
  'Binance Mining API.json': { product: 'mining', hostKey: 'apiRoot' },
  'Binance NFT API.json': { product: 'nft', hostKey: 'apiRoot' },
  'Binance Pay API.json': { product: 'pay', hostKey: 'apiRoot' },
  'Binance Rebate API.json': { product: 'rebate', hostKey: 'apiRoot' },
  'Binance Simple Earn API.json': { product: 'simpleEarn', hostKey: 'apiRoot' },
  'Binance Staking API.json': { product: 'staking', hostKey: 'apiRoot' },
  'Binance VIP Loan API.json': { product: 'vipLoan', hostKey: 'apiRoot' },
};

interface PostmanUrl {
  raw: string;
  host?: string[];
  path?: string[];
  query?: Array<{
    key: string;
    value?: string;
    description?: string;
    disabled?: boolean;
  }>;
  variable?: unknown[];
}

interface PostmanRequest {
  method: string;
  header?: Array<{ key: string; value?: string; disabled?: boolean }>;
  body?: { mode?: string; urlencoded?: Array<{ key: string; value?: string; description?: string; disabled?: boolean }> };
  url?: PostmanUrl | string;
  description?: string;
}

interface PostmanItem {
  name?: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
}

interface PostmanCollection {
  info?: { name?: string; description?: { content?: string } | string; _postman_id?: string };
  item?: PostmanItem[];
}

/** Canonical endpoint contract derived from a Postman request. */
export interface EndpointContract {
  /** Source collection filename (e.g. "Binance Spot API.json"). */
  sourceCollection: string;
  /** Folder path inside the collection (e.g. ["Market Data", "Symbol Price"]). */
  sourceFolder: string[];
  /** Human-readable request name from Postman (e.g. "Account information"). */
  name: string;
  /** Canonical Binance product family (e.g. "spot", "usdm", "options"). */
  product: string;
  /** REST host key (e.g. "apiRoot", "fapiRoot", "eapi"). */
  hostKey: string;
  /** HTTP method upper-cased. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Canonical path including version prefix (e.g. "/api/v3/account"). */
  path: string;
  /** Auth mode derived from headers + query params. */
  auth: 'public' | 'apiKey' | 'signed';
  /** Query parameters with descriptions and required flag. */
  queryParams: ParamContract[];
  /** Body parameters (for urlencoded POST/PUT bodies). */
  bodyParams: ParamContract[];
  /** Documentation reference (collection + request name). */
  docRef: string;
}

export interface ParamContract {
  name: string;
  description?: string;
  required: boolean;
  /** Default value if specified in the collection. */
  defaultValue?: string;
  /** Example value used in the collection. */
  exampleValue?: string;
}

interface SourceIndexEntry {
  collectionFile: string;
  collectionName: string;
  postmanId?: string;
  description?: string;
  endpointCount: number;
  sourceUrl: string;
}

const SOURCE_URL = 'https://github.com/binance/binance-api-postman';
const OFFICIAL_DOCS_URL = 'https://developers.binance.com/en/docs/sdks-tools/postman/collections';

function walkItems(items: PostmanItem[] | undefined, folderPath: string[], out: { item: PostmanItem; folder: string[] }[]): void {
  if (!items) return;
  for (const item of items) {
    if (item.request) {
      out.push({ item, folder: folderPath });
    } else if (item.item) {
      walkItems(item.item, [...folderPath, item.name ?? ''], out);
    }
  }
}

function normalizePath(url: PostmanUrl | string | undefined): string {
  if (!url) return '';
  if (typeof url === 'string') {
    // raw like "{{url}}/api/v3/account?symbol=BTCUSDT"
    const stripped = url.replace(/^\{\{[^}]+\}\}/, '');
    return stripped.split('?')[0];
  }
  if (url.path && url.path.length) {
    return '/' + url.path.join('/');
  }
  if (url.raw) {
    return normalizePath(url.raw);
  }
  return '';
}

function deriveAuth(request: PostmanRequest): 'public' | 'apiKey' | 'signed' {
  const headers = request.header ?? [];
  const hasApiKeyHeader = headers.some((h) => h.key?.toLowerCase() === 'x-mbx-apikey' && !h.disabled);
  if (!hasApiKeyHeader) return 'public';
  // If query or body has `signature`, it's signed; otherwise API-key only.
  const url = typeof request.url === 'object' ? request.url : undefined;
  const queryParams = url?.query ?? [];
  const bodyParams = request.body?.urlencoded ?? [];
  const hasSignature = [...queryParams, ...bodyParams].some((p) => p.key === 'signature');
  return hasSignature ? 'signed' : 'apiKey';
}

function toParamContract(p: { key: string; value?: string; description?: string; disabled?: boolean }): ParamContract {
  // In Postman, `disabled: true` means optional / commented-out.
  // `signature` and `timestamp` are always auto-injected by the SDK signing layer,
  // so we mark them as `required: true` but downstream generators will skip them.
  const isAutoInjected = p.key === 'signature' || p.key === 'timestamp' || p.key === 'recvWindow';
  return {
    name: p.key,
    description: p.description?.trim() || undefined,
    required: !p.disabled && isAutoInjected ? true : !p.disabled,
    defaultValue: p.disabled ? undefined : (p.value || undefined),
    exampleValue: p.value || undefined,
  };
}

function deriveOperationId(product: string, path: string, method: string, name: string): string {
  // Convert the request name into an operationId like "trading.createOrder".
  // Heuristic: take the last folder + a camelCase version of the request name.
  // Falls back to method + path tail if no name available.
  const cleanName = (name || '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+(.)/g, (_, c) => c.toUpperCase());
  // Avoid clashing with reserved words / collisions across collections.
  const pathTail = path.split('/').filter(Boolean).pop() ?? '';
  const tail = pathTail.replace(/[^\w]/g, '');
  return `${product}.${cleanName || `${method.toLowerCase()}${tail}`}`;
}

function loadCollection(filePath: string): { collection: PostmanCollection; file: string } {
  const raw = readFileSync(filePath, 'utf8');
  return { collection: JSON.parse(raw), file: basename(filePath) };
}

function main(): void {
  if (!statSync(COLLECTIONS_DIR).isDirectory()) {
    console.error(`[contracts:import-postman] COLLECTIONS_DIR not found: ${COLLECTIONS_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(COLLECTIONS_DIR).filter((f) => f.endsWith('.json')).sort();
  console.log(`[contracts:import-postman] Scanning ${files.length} collections in ${COLLECTIONS_DIR}`);

  const contracts: EndpointContract[] = [];
  const sourceIndex: SourceIndexEntry[] = [];

  for (const file of files) {
    const mapping = COLLECTION_TO_PRODUCT[file];
    if (!mapping) {
      console.warn(`  ⚠ no product mapping for ${file} — skipping`);
      continue;
    }
    const { collection } = loadCollection(join(COLLECTIONS_DIR, file));
    const leaves: { item: PostmanItem; folder: string[] }[] = [];
    walkItems(collection.item, [], leaves);

    const collName = collection.info?.name ?? file.replace(/\.json$/, '');
    const collDesc = typeof collection.info?.description === 'string'
      ? collection.info.description
      : collection.info?.description?.content;

    for (const { item, folder } of leaves) {
      const req = item.request;
      if (!req) continue;
      const method = (req.method ?? 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE';
      const path = normalizePath(req.url);
      const auth = deriveAuth(req);
      const url = typeof req.url === 'object' ? req.url : undefined;
      const queryParams = (url?.query ?? []).map(toParamContract);
      const bodyParams = (req.body?.urlencoded ?? []).map(toParamContract);

      contracts.push({
        sourceCollection: file,
        sourceFolder: folder,
        name: item.name ?? path,
        product: mapping.product,
        hostKey: mapping.hostKey,
        method,
        path,
        auth,
        queryParams,
        bodyParams,
        docRef: `${collName} → ${[...folder, item.name].filter(Boolean).join(' > ')}`,
      });
    }

    sourceIndex.push({
      collectionFile: file,
      collectionName: collName,
      postmanId: collection.info?._postman_id,
      description: collDesc,
      endpointCount: leaves.length,
      sourceUrl: `${SOURCE_URL}/blob/master/collections/${encodeURIComponent(file)}`,
    });
    console.log(`  ✓ ${file.padEnd(60)} ${leaves.length} endpoints → ${mapping.product}`);
  }

  // Write the contract catalog.
  const catalogPath = join(CONTRACTS_DIR, 'postman-catalog.json');
  const catalog = {
    schemaVersion: 1,
    sourceUrl: SOURCE_URL,
    officialDocsUrl: OFFICIAL_DOCS_URL,
    generatedAt: new Date().toISOString(),
    totalEndpoints: contracts.length,
    totalCollections: sourceIndex.length,
    endpoints: contracts,
  };
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`\n[contracts:import-postman] wrote ${catalogPath} (${contracts.length} endpoints, ${sourceIndex.length} collections)`);

  // Write the source index (per-collection metadata).
  const indexPath = join(CONTRACTS_DIR, 'postman-source-index.json');
  writeFileSync(indexPath, JSON.stringify({
    schemaVersion: 1,
    sourceUrl: SOURCE_URL,
    officialDocsUrl: OFFICIAL_DOCS_URL,
    collections: sourceIndex,
  }, null, 2));
  console.log(`[contracts:import-postman] wrote ${indexPath}`);

  // Print coverage summary.
  const byProduct = new Map<string, number>();
  for (const c of contracts) {
    byProduct.set(c.product, (byProduct.get(c.product) ?? 0) + 1);
  }
  console.log('\n[contracts:import-postman] Coverage by product:');
  const sortedProducts = [...byProduct.entries()].sort((a, b) => b[1] - a[1]);
  for (const [product, count] of sortedProducts) {
    console.log(`  ${product.padEnd(20)} ${count} endpoints`);
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${contracts.length} endpoints`);
}

main();
