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
 * Collections are fetched from GitHub at a pinned commit, recorded as
 * `pinnedSha`/`pinnedAt` so the catalog's provenance is reproducible:
 *
 *   npm run contracts:import-postman                    # latest commit touching collections/
 *   npm run contracts:import-postman -- --ref <sha>     # a specific upstream commit
 *
 * Offline: set POSTMAN_COLLECTIONS_DIR to a local `collections/` directory
 * (pass --ref to record which commit it is).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');
const POSTMAN_REPO = 'binance/binance-api-postman';
const COLLECTIONS_PATH = 'collections';
const FETCH_TIMEOUT_MS = 30_000;

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

export interface CollectionFile {
  file: string;
  collection: PostmanCollection;
}

export interface ImportResult {
  contracts: EndpointContract[];
  sourceIndex: SourceIndexEntry[];
  /** Upstream collections with no COLLECTION_TO_PRODUCT mapping (not imported). */
  unmappedCollections: string[];
}

export interface UpstreamCommit {
  sha: string;
  date: string;
  subject: string;
  url: string;
}

interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: { message: string; committer: { date: string } };
}

/** GET a GitHub REST endpoint for `repo` (authenticated via GITHUB_TOKEN when set). */
export async function githubJson<T>(repo: string, endpoint: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const url = `https://api.github.com/repos/${repo}${endpoint}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`GitHub API ${url} failed: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/** Commits on `repo` touching `path`, newest first. */
export async function commitsTouching(repo: string, path: string, since?: string): Promise<UpstreamCommit[]> {
  const query = new URLSearchParams({ path, per_page: '50' });
  if (since) query.set('since', since);
  const commits = await githubJson<GitHubCommit[]>(repo, `/commits?${query.toString()}`);
  return commits.map(toUpstreamCommit);
}

function toUpstreamCommit(c: GitHubCommit): UpstreamCommit {
  return { sha: c.sha, date: c.commit.committer.date, subject: c.commit.message.split('\n')[0] ?? '', url: c.html_url };
}

/** A binance-api-postman commit by SHA. */
export async function collectionsCommit(sha: string): Promise<UpstreamCommit> {
  return toUpstreamCommit(await githubJson<GitHubCommit>(POSTMAN_REPO, `/commits/${sha}`));
}

/** Latest binance-api-postman commit touching collections/. */
export async function latestCollectionsCommit(): Promise<UpstreamCommit> {
  const [latest] = await commitsTouching(POSTMAN_REPO, COLLECTIONS_PATH);
  if (!latest) throw new Error(`No commits found touching ${POSTMAN_REPO}/${COLLECTIONS_PATH}`);
  return latest;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

/** Every collection JSON in binance-api-postman at commit `sha`. */
export async function fetchCollectionsAt(sha: string): Promise<CollectionFile[]> {
  const tree = await githubJson<{ tree: Array<{ path: string; type: string }> }>(
    POSTMAN_REPO,
    `/git/trees/${sha}?recursive=1`,
  );
  const paths = tree.tree
    .filter((node) => node.type === 'blob' && node.path.startsWith(`${COLLECTIONS_PATH}/`) && node.path.endsWith('.json'))
    .map((node) => node.path)
    .sort();
  const files: CollectionFile[] = [];
  for (const path of paths) {
    const file = path.slice(COLLECTIONS_PATH.length + 1);
    const raw = await fetchText(`https://raw.githubusercontent.com/${POSTMAN_REPO}/${sha}/${COLLECTIONS_PATH}/${encodeURIComponent(file)}`);
    files.push({ file, collection: JSON.parse(raw) as PostmanCollection });
  }
  return files;
}

function readCollectionsDir(dir: string): CollectionFile[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, collection: JSON.parse(readFileSync(join(dir, file), 'utf8')) as PostmanCollection }));
}

function toContract(file: string, collName: string, mapping: { product: string; hostKey: string }, leaf: { item: PostmanItem; folder: string[] }): EndpointContract {
  const req = leaf.item.request as PostmanRequest;
  const path = normalizePath(req.url);
  const url = typeof req.url === 'object' ? req.url : undefined;
  return {
    sourceCollection: file,
    sourceFolder: leaf.folder,
    name: leaf.item.name ?? path,
    product: mapping.product,
    hostKey: mapping.hostKey,
    method: (req.method ?? 'GET').toUpperCase() as EndpointContract['method'],
    path,
    auth: deriveAuth(req),
    queryParams: (url?.query ?? []).map(toParamContract),
    bodyParams: (req.body?.urlencoded ?? []).map(toParamContract),
    docRef: `${collName} → ${[...leaf.folder, leaf.item.name].filter(Boolean).join(' > ')}`,
  };
}

function collectionDescription(collection: PostmanCollection): string | undefined {
  const description = collection.info?.description;
  return typeof description === 'string' ? description : description?.content;
}

/** Normalize collections into endpoint contracts plus per-collection source metadata. */
export function extractContracts(files: CollectionFile[]): ImportResult {
  const result: ImportResult = { contracts: [], sourceIndex: [], unmappedCollections: [] };
  for (const { file, collection } of files) {
    const mapping = COLLECTION_TO_PRODUCT[file];
    if (!mapping) {
      result.unmappedCollections.push(file);
      continue;
    }
    const leaves: { item: PostmanItem; folder: string[] }[] = [];
    walkItems(collection.item, [], leaves);
    const collName = collection.info?.name ?? file.replace(/\.json$/, '');
    result.contracts.push(...leaves.map((leaf) => toContract(file, collName, mapping, leaf)));
    result.sourceIndex.push({
      collectionFile: file,
      collectionName: collName,
      postmanId: collection.info?._postman_id,
      description: collectionDescription(collection),
      endpointCount: leaves.length,
      sourceUrl: `${SOURCE_URL}/blob/master/collections/${encodeURIComponent(file)}`,
    });
  }
  return result;
}

/** Write postman-catalog.json and postman-source-index.json for a pinned import. */
export function writeContracts(result: ImportResult, pinnedSha: string, pinnedAt: string): void {
  const pin = { schemaVersion: 1, sourceUrl: SOURCE_URL, officialDocsUrl: OFFICIAL_DOCS_URL, pinnedSha, pinnedAt };
  const catalog = {
    ...pin,
    totalEndpoints: result.contracts.length,
    totalCollections: result.sourceIndex.length,
    endpoints: result.contracts,
  };
  writeFileSync(join(CONTRACTS_DIR, 'postman-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  const index = { ...pin, unmappedCollections: result.unmappedCollections, collections: result.sourceIndex };
  writeFileSync(join(CONTRACTS_DIR, 'postman-source-index.json'), `${JSON.stringify(index, null, 2)}\n`);
}

function parseRef(argv: string[]): string | undefined {
  const index = argv.indexOf('--ref');
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || !/^[0-9a-f]{40}$/.test(value)) throw new Error('--ref requires a 40-hex commit SHA');
  return value;
}

function printSummary(result: ImportResult): void {
  for (const entry of result.sourceIndex) {
    console.log(`  ✓ ${entry.collectionFile.padEnd(60)} ${entry.endpointCount} endpoints`);
  }
  for (const file of result.unmappedCollections) {
    console.log(`  ⚠ ${file.padEnd(60)} no product mapping — recorded in unmappedCollections`);
  }
  console.log(`  TOTAL ${result.contracts.length} endpoints from ${result.sourceIndex.length} collections`);
}

async function main(): Promise<void> {
  const ref = parseRef(process.argv.slice(2));
  const offlineDir = process.env.POSTMAN_COLLECTIONS_DIR;
  if (offlineDir) {
    console.log(`[contracts:import-postman] reading ${offlineDir}`);
    const result = extractContracts(readCollectionsDir(offlineDir));
    writeContracts(result, ref ?? 'unknown', new Date().toISOString().slice(0, 10));
    printSummary(result);
    return;
  }
  // pinnedAt is the upstream commit date, not the import date, so the
  // drift report's "since" window starts where the pinned content does.
  const commit = ref ? await collectionsCommit(ref) : await latestCollectionsCommit();
  console.log(`[contracts:import-postman] fetching ${POSTMAN_REPO}@${commit.sha}`);
  const result = extractContracts(await fetchCollectionsAt(commit.sha));
  writeContracts(result, commit.sha, commit.date.slice(0, 10));
  printSummary(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error('[contracts:import-postman] FAILED:', error);
    process.exitCode = 1;
  });
}
