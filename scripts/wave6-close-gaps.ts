/**
 * Wave 6 generator — augments the 7 hand-curated laggard products with
 * the endpoints they're still missing relative to the official Binance
 * Postman contract.
 *
 * For each laggard product (spot / options / portfolioPro / portfolio /
 * margin / wallet / subaccount) the script:
 *   1. Loads contracts/postman-coverage.json to find the missing endpoints
 *      for that product.
 *   2. Looks up the full EndpointContract for each missing endpoint in
 *      contracts/postman-catalog.json.
 *   3. Appends the endpoint rows to src/registry/<product>.endpoints.ts.
 *   4. Appends the resource method stubs to a NEW file
 *      src/resources/<Product>Wave6.ts — the hand-curated resource
 *      classes (Margin / Wallet / SubAccount / FuturesTrading /
 *      OptionsTrading / PortfolioMargin*) are intentionally NOT touched
 *      because they carry hand-written Zod schemas that we want to keep.
 *      Instead, Wave-6 methods live in a sibling class that the surface
 *      re-exports under a `wave6` field.
 *
 * The split keeps the hand-curated surface clean while still closing the
 * contract gap. A future wave can fold the Wave-6 methods back into the
 * hand-curated resources once each has a Zod schema + contract test.
 *
 * Run via: `npm run contracts:wave6-close-gaps`
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');
const REGISTRY_DIR = join(ROOT, 'src', 'registry');
const RESOURCES_DIR = join(ROOT, 'src', 'resources');

interface EndpointContract {
  product: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  auth: 'public' | 'apiKey' | 'signed';
  name: string;
  queryParams: Array<{ name: string; required: boolean; exampleValue?: string }>;
  bodyParams: Array<{ name: string; required: boolean; exampleValue?: string }>;
  docRef: string;
}

interface CoverageEntry {
  product: string;
  contractCount: number;
  existingCount: number;
  missing: string[];
  extra: string[];
}

const LAGGARDS: Array<{ product: string; registryFile: string; resourceClass: string; resourceFile: string }> = [
  { product: 'spot', registryFile: 'spot.endpoints.ts', resourceClass: 'SpotWave6', resourceFile: 'SpotWave6.ts' },
  { product: 'options', registryFile: 'options.endpoints.ts', resourceClass: 'OptionsWave6', resourceFile: 'OptionsWave6.ts' },
  { product: 'portfolioPro', registryFile: 'portfolioPro.endpoints.ts', resourceClass: 'PortfolioMarginProWave6', resourceFile: 'PortfolioMarginProWave6.ts' },
  { product: 'portfolio', registryFile: 'portfolio.endpoints.ts', resourceClass: 'PortfolioMarginWave6', resourceFile: 'PortfolioMarginWave6.ts' },
  { product: 'margin', registryFile: 'margin.endpoints.ts', resourceClass: 'MarginWave6', resourceFile: 'MarginWave6.ts' },
  { product: 'wallet', registryFile: 'wallet.endpoints.ts', resourceClass: 'WalletWave6', resourceFile: 'WalletWave6.ts' },
  { product: 'subaccount', registryFile: 'subaccount.endpoints.ts', resourceClass: 'SubAccountWave6', resourceFile: 'SubAccountWave6.ts' },
];

function toPascal(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tsMethodName(c: EndpointContract): string {
  return (c.name || '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+(.)/g, (_, ch) => ch.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase());
}

function guessTsType(exampleValue: string | undefined, name: string): string {
  if (exampleValue === undefined) return 'string | number';
  if (/^-?\d+(\.\d+)?$/.test(exampleValue)) return 'number';
  if (exampleValue === 'true' || exampleValue === 'false') return 'boolean';
  if (['BUY', 'SELL'].includes(exampleValue)) return "'BUY' | 'SELL'";
  return 'string | number';
}

function httpVerbCall(c: EndpointContract): string {
  const verb = c.method.toLowerCase();
  const mode = c.auth === 'public' ? "'public'" : c.auth === 'apiKey' ? "'apiKey'" : "'signed'";
  return `this.http.${verb}(${JSON.stringify(c.path)}, params, ${mode})`;
}

function endpointRow(c: EndpointContract, product: string, methodNameOverride?: string): string {
  const op = `${product}.${methodNameOverride ?? tsMethodName(c)}`;
  return `  [${JSON.stringify(op)}, ${JSON.stringify(c.method)}, ${JSON.stringify(c.path)}, ${JSON.stringify(c.auth)}, ${JSON.stringify(`${product}.${methodNameOverride ?? tsMethodName(c)}`)}]`;
}

function uniqueMethodNames(contracts: EndpointContract[]): string[] {
  const seen = new Map<string, number>();
  return contracts.map((c) => {
    let name = tsMethodName(c);
    if (seen.has(name)) {
      const count = seen.get(name)! + 1;
      seen.set(name, count);
      const pathSeg = c.path.split('/').filter(Boolean).slice(-2, -1)[0] ?? `dup${count}`;
      name = `${name}${toPascal(pathSeg)}`;
    } else {
      seen.set(name, 1);
    }
    return name;
  });
}

function appendRegistryRows(product: string, registryFile: string, contracts: EndpointContract[]): void {
  const filePath = join(REGISTRY_DIR, registryFile);
  const existing = readFileSync(filePath, 'utf8');
  const methodNames = uniqueMethodNames(contracts);
  const rows = contracts.map((c, i) => endpointRow(c, product, methodNames[i])).join(',\n');
  // Insert before the closing `];` of the rows array
  const insertion = `\n  // ---- Wave 6: contract-first gap closure (Postman-driven) ----\n${rows},\n`;
  const updated = existing.replace(
    /^(\s*const rows: Row\[\] = \[)/m,
    `$1${insertion}`,
  );
  writeFileSync(filePath, updated);
  console.log(`  ✓ ${registryFile} (+${contracts.length} rows)`);
}

function resourceMethod(c: EndpointContract): string {
  const name = tsMethodName(c);
  const params = [...c.queryParams, ...c.bodyParams]
    .filter((p) => p.name !== 'signature' && p.name !== 'timestamp' && p.name !== 'recvWindow');
  const paramSig = params.length === 0
    ? ''
    : `params: { ${params.map((p) => `${p.name}${p.required ? '' : '?'}: ${guessTsType(p.exampleValue, p.name)}`).join('; ')} }`;
  const argsForCall = params.length === 0 ? 'undefined' : 'params';
  const call = httpVerbCall(c).replace('params', argsForCall);
  const docRef = c.docRef.replace(/\n/g, ' ').slice(0, 200);
  return `  /** ${docRef}. \`${c.method} ${c.path}\` (${c.auth.toUpperCase()}). */\n  async ${name}(${paramSig}): Promise<unknown> {\n    return ${call};\n  }`;
}

function emitWave6ResourceFile(resourceClass: string, resourceFile: string, contracts: EndpointContract[], product: string): void {
  const filePath = join(RESOURCES_DIR, resourceFile);
  // Check if the file already exists — if so, only append NEW methods.
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    // Find which paths are already implemented by grepping for the path strings.
    const existingPaths = new Set<string>();
    for (const c of contracts) {
      if (existing.includes(JSON.stringify(c.path))) {
        existingPaths.add(`${c.method} ${c.path}`);
      }
    }
    const newContracts = contracts.filter((c) => !existingPaths.has(`${c.method} ${c.path}`));
    if (newContracts.length === 0) {
      console.log(`  • ${resourceFile} (no new methods to add)`);
      return;
    }
    // Append new methods before the closing `}` of the class.
    const seenNames = new Map<string, number>();
    // Also track names already in the file.
    const existingMethodRe = /async\s+(\w+)\s*\(/g;
    let m;
    while ((m = existingMethodRe.exec(existing)) !== null) {
      seenNames.set(m[1], 1);
    }
    const newMethods = newContracts.map((c) => {
      let name = tsMethodName(c);
      if (seenNames.has(name)) {
        const count = seenNames.get(name)! + 1;
        seenNames.set(name, count);
        const pathSeg = c.path.split('/').filter(Boolean).slice(-2, -1)[0] ?? `dup${count}`;
        name = `${name}${toPascal(pathSeg)}`;
      } else {
        seenNames.set(name, 1);
      }
      const params = [...c.queryParams, ...c.bodyParams]
        .filter((p) => p.name !== 'signature' && p.name !== 'timestamp' && p.name !== 'recvWindow');
      const paramSig = params.length === 0
        ? ''
        : `params: { ${params.map((p) => `${p.name}${p.required ? '' : '?'}: ${guessTsType(p.exampleValue, p.name)}`).join('; ')} }`;
      const argsForCall = params.length === 0 ? 'undefined' : 'params';
      const call = httpVerbCall(c).replace('params', argsForCall);
      const docRef = c.docRef.replace(/\n/g, ' ').slice(0, 200);
      return `  /** ${docRef}. \`${c.method} ${c.path}\` (${c.auth.toUpperCase()}). */\n  async ${name}(${paramSig}): Promise<unknown> {\n    return ${call};\n  }`;
    }).join('\n\n');
    // Insert before the last `}` in the file.
    const lastBrace = existing.lastIndexOf('\n}');
    if (lastBrace >= 0) {
      const updated = existing.slice(0, lastBrace) + '\n\n' + newMethods + '\n' + existing.slice(lastBrace);
      writeFileSync(filePath, updated);
      console.log(`  ✓ ${resourceFile} (+${newContracts.length} new methods appended)`);
    } else {
      console.warn(`  ⚠ ${resourceFile}: could not find class closing brace — skipping`);
    }
    return;
  }
  // File doesn't exist — create from scratch.
  const seenNames = new Map<string, number>();
  const methods = contracts.map((c) => {
    let name = tsMethodName(c);
    if (seenNames.has(name)) {
      const count = seenNames.get(name)! + 1;
      seenNames.set(name, count);
      const pathSeg = c.path.split('/').filter(Boolean).slice(-2, -1)[0] ?? `dup${count}`;
      name = `${name}${toPascal(pathSeg)}`;
    } else {
      seenNames.set(name, 1);
    }
    const params = [...c.queryParams, ...c.bodyParams]
      .filter((p) => p.name !== 'signature' && p.name !== 'timestamp' && p.name !== 'recvWindow');
    const paramSig = params.length === 0
      ? ''
      : `params: { ${params.map((p) => `${p.name}${p.required ? '' : '?'}: ${guessTsType(p.exampleValue, p.name)}`).join('; ')} }`;
    const argsForCall = params.length === 0 ? 'undefined' : 'params';
    const call = httpVerbCall(c).replace('params', argsForCall);
    const docRef = c.docRef.replace(/\n/g, ' ').slice(0, 200);
    return `  /** ${docRef}. \`${c.method} ${c.path}\` (${c.auth.toUpperCase()}). */\n  async ${name}(${paramSig}): Promise<unknown> {\n    return ${call};\n  }`;
  }).join('\n\n');
  const content = `import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance ${product} Wave-6 gap-closure resource.
 *
 * GENERATED by scripts/wave6-close-gaps.ts from the official Binance
 * Postman collections (https://github.com/binance/binance-api-postman).
 *
 * Each method closes one of the 188 endpoint-contract gaps identified
 * by \`contracts:generate-from-postman\`. Methods return \`Promise<unknown>\`
 * until a Zod schema is added (see existing src/types/*.types.ts pattern).
 * A future wave can fold these methods back into the hand-curated
 * ${toPascal(product)}* resource classes.
 */
export class ${resourceClass} {
  constructor(private readonly http: HttpClient) {}

${methods}
}
`;
  writeFileSync(filePath, content);
  console.log(`  ✓ ${resourceFile} (${contracts.length} methods)`);
}

async function main(): Promise<void> {
  const coveragePath = join(CONTRACTS_DIR, 'postman-coverage.json');
  const catalogPath = join(CONTRACTS_DIR, 'postman-catalog.json');
  if (!existsSync(coveragePath) || !existsSync(catalogPath)) {
    console.error(`[wave6] coverage/catalog files missing. Run \`npm run contracts:import-postman && npm run contracts:generate-from-postman\` first.`);
    process.exit(1);
  }

  const coverage: { products: CoverageEntry[] } = JSON.parse(readFileSync(coveragePath, 'utf8'));
  const catalog: { endpoints: EndpointContract[] } = JSON.parse(readFileSync(catalogPath, 'utf8'));

  // Index contracts by `${method} ${path}` for O(1) lookup
  const byKey = new Map<string, EndpointContract>();
  for (const c of catalog.endpoints) byKey.set(`${c.method} ${c.path}`, c);

  let totalClosed = 0;
  for (const { product, registryFile, resourceClass, resourceFile } of LAGGARDS) {
    const covEntry = coverage.products.find((p) => p.product === product);
    if (!covEntry) {
      console.warn(`  ⚠ no coverage entry for ${product} — skipping`);
      continue;
    }
    const missingContracts = covEntry.missing
      .map((key) => byKey.get(key))
      .filter((c): c is EndpointContract => c !== undefined);

    if (missingContracts.length === 0) {
      console.log(`  • ${product}: nothing to do`);
      continue;
    }
    console.log(`\n[wave6] ${product}: closing ${missingContracts.length} missing endpoints`);
    appendRegistryRows(product, registryFile, missingContracts);
    emitWave6ResourceFile(resourceClass, resourceFile, missingContracts, product);
    totalClosed += missingContracts.length;
  }

  console.log(`\n[wave6] Total endpoints closed: ${totalClosed}`);
  console.log('[wave6] Next: npm run contracts:generate && npm run docs:generate');
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
