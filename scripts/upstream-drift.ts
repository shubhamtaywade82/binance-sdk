/**
 * Upstream drift check for the Postman contract layer.
 *
 * Extracts the endpoint contracts from the latest binance-api-postman
 * commit (in memory) and diffs them against the committed
 * contracts/postman-catalog.json. Drift means the endpoint inventory or a
 * parameter list changed, not merely that upstream committed: the Postman
 * repo is bot-updated almost daily, mostly without contract changes.
 *
 * Exit codes: 0 no drift, 1 drift found, 2 the check itself failed.
 * Run via: `npm run contracts:upstream-drift [-- --out <file>]`
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  commitsTouching,
  extractContracts,
  fetchCollectionsAt,
  latestCollectionsCommit,
  type EndpointContract,
  type UpstreamCommit,
} from './import-postman-collections.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = join(ROOT, 'contracts', 'postman-catalog.json');
const SPOT_DOCS_REPO = 'binance/binance-spot-api-docs';
// developers.binance.com answers scripted requests with an empty 202 (bot
// protection), so these changelogs are linked for human review, not parsed.
const CHANGELOG_LINKS = [
  'https://developers.binance.com/docs/derivatives/change-log',
  'https://developers.binance.com/docs/binance-spot-api-docs/CHANGELOG',
];

export interface ContractDrift {
  added: EndpointContract[];
  removed: EndpointContract[];
  /** `METHOD path` keys whose query/body parameter names or required flags changed. */
  paramsChanged: string[];
}

function contractKey(contract: EndpointContract): string {
  return `${contract.method} ${contract.path}`;
}

function paramSignature(contract: EndpointContract): string {
  return [...contract.queryParams, ...contract.bodyParams]
    .map((param) => `${param.name}:${param.required}`)
    .sort()
    .join(',');
}

/** Endpoints added, removed, or with changed parameters between two contract lists. */
export function diffContracts(pinned: EndpointContract[], latest: EndpointContract[]): ContractDrift {
  const pinnedByKey = new Map(pinned.map((c) => [contractKey(c), c]));
  const latestByKey = new Map(latest.map((c) => [contractKey(c), c]));
  const paramsChanged: string[] = [];
  for (const [key, contract] of latestByKey) {
    const before = pinnedByKey.get(key);
    if (before && paramSignature(before) !== paramSignature(contract)) paramsChanged.push(key);
  }
  return {
    added: [...latestByKey].filter(([key]) => !pinnedByKey.has(key)).map(([, c]) => c),
    removed: [...pinnedByKey].filter(([key]) => !latestByKey.has(key)).map(([, c]) => c),
    paramsChanged: paramsChanged.sort(),
  };
}

export function hasDrift(drift: ContractDrift): boolean {
  return drift.added.length + drift.removed.length + drift.paramsChanged.length > 0;
}

function endpointLines(title: string, contracts: EndpointContract[]): string[] {
  if (contracts.length === 0) return [];
  return [`### ${title} (${contracts.length})`, '', ...contracts.map((c) => `- \`${contractKey(c)}\` — ${c.product}: ${c.name}`), ''];
}

function driftSection(drift: ContractDrift, pinnedSha: string, latest: UpstreamCommit): string[] {
  const header = [`Pinned \`${pinnedSha.slice(0, 7)}\` → latest [\`${latest.sha.slice(0, 7)}\`](${latest.url}) (${latest.date.slice(0, 10)})`, ''];
  if (!hasDrift(drift)) return [...header, 'No contract drift: endpoint inventory and parameters match the pin.', ''];
  const params = drift.paramsChanged.length
    ? [`### Parameters changed (${drift.paramsChanged.length})`, '', ...drift.paramsChanged.map((key) => `- \`${key}\``), '']
    : [];
  return [...header, ...endpointLines('Added upstream', drift.added), ...endpointLines('Removed upstream', drift.removed), ...params];
}

async function informationalSection(pinnedAt: string, unmapped: string[]): Promise<string[]> {
  const spotDocs = await commitsTouching(SPOT_DOCS_REPO, 'CHANGELOG.md', `${pinnedAt}T00:00:00Z`);
  const commitLine = (c: UpstreamCommit): string => `- [\`${c.sha.slice(0, 7)}\`](${c.url}) ${c.date.slice(0, 10)} — ${c.subject}`;
  return [
    '## Informational',
    '',
    `### \`${SPOT_DOCS_REPO}\` CHANGELOG.md since ${pinnedAt}`,
    ...(spotDocs.length ? spotDocs.map(commitLine) : ['- none']),
    '',
    '### Unmapped upstream collections (not imported)',
    ...(unmapped.length ? unmapped.map((file) => `- ${file}`) : ['- none']),
    '',
    '### Changelogs to review by hand',
    ...CHANGELOG_LINKS.map((link) => `- ${link}`),
    '',
  ];
}

function parseOutPath(argv: string[]): string | undefined {
  const index = argv.indexOf('--out');
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value) throw new Error('--out requires a value');
  return value;
}

function writeGithubOutput(drifted: boolean, sha: string): void {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `drifted=${drifted}\nsha=${sha}\n`);
}

async function main(): Promise<void> {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as { pinnedSha: string; pinnedAt: string; endpoints: EndpointContract[] };
  const latest = await latestCollectionsCommit();
  const extracted = extractContracts(await fetchCollectionsAt(latest.sha));
  const drift = diffContracts(catalog.endpoints, extracted.contracts);
  const report = [
    '## Binance Postman contract drift',
    '',
    ...driftSection(drift, catalog.pinnedSha, latest),
    ...(await informationalSection(catalog.pinnedAt, extracted.unmappedCollections)),
  ].join('\n');
  console.log(report);
  const outPath = parseOutPath(process.argv.slice(2));
  if (outPath) writeFileSync(outPath, report);
  writeGithubOutput(hasDrift(drift), latest.sha);
  if (hasDrift(drift)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error('[contracts:upstream-drift] FAILED:', error);
    process.exitCode = 2;
  });
}
