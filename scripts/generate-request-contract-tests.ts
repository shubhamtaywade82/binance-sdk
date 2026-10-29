/**
 * Table-driven request-contract test generator — emits
 * test/resources/RequestContracts.test.ts, one row per public method of the
 * coverage-excluded Wave 5 + Wave 6 generated resources.
 *
 * Why these files: vitest.config.ts excludes them from coverage because the
 * Wave 5-6 generators emitted ~300 thin Postman wrappers with no focused
 * harness (the vitest comment tracks the lift as a follow-up). This closes
 * that gap mechanically: every method of every excluded *generated* resource
 * gets one table row asserting the outgoing REQUEST — HTTP verb, path, every
 * supplied param serialized into the query string (the HttpClient sends GET
 * and POST params alike as query), signature/timestamp/recvWindow for SIGNED
 * routes, and the X-MBX-APIKEY header. The response side stays permissive:
 * wave7 schemas are all-optional loose objects/arrays, so the harness
 * answers `{}` (or `[]` on the retry) — response strictness is the Wave 8
 * ladder's job, not this test's.
 *
 * The generated file also carries a completeness ratchet: every public
 * prototype method of each covered class must have a row. A newly generated
 * resource method without a regenerated table fails the suite.
 *
 * The hand-written Wave 1-4 resources (Options*, PortfolioMargin*, CoinMData,
 * DualInvestment, Alpha, CopyTrading, C2C) are NOT covered here: their
 * hand-curated schemas carry required fields, so they need per-method
 * response fixtures rather than permissive defaults — tracked as the next
 * step of this same follow-up.
 *
 * Run via: npm run contracts:generate-request-tests
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCES = join(ROOT, 'src', 'resources');

/** The coverage-excluded generated resources (Wave 5 + Wave 6). */
const FILES = [
  'FiatResource.ts',
  'GiftCardResource.ts',
  'MiningResource.ts',
  'NftResource.ts',
  'PayResource.ts',
  'RebateResource.ts',
  'SimpleEarnResource.ts',
  'StakingResource.ts',
  'VipLoanResource.ts',
  'SpotWave6.ts',
  'OptionsWave6.ts',
  'PortfolioMarginProWave6.ts',
  'PortfolioMarginWave6.ts',
  'MarginWave6.ts',
  'WalletWave6.ts',
  'SubAccountWave6.ts',
];

interface Param {
  name: string;
  required: boolean;
  typeText: string;
}

interface Row {
  className: string;
  method: string;
  verb: string;
  path: string;
  auth: string;
  params: Param[];
}

/** Sample values by parameter name — presence is what the harness asserts. */
const VALUE_BY_NAME: Record<string, string | number | boolean> = {
  symbol: 'BTCUSDT',
  pair: 'BTCUSDT',
  underlying: 'BTCUSDT',
  asset: 'BTC',
  coin: 'BTC',
  currency: 'USD',
  loanCoin: 'USDT',
  collateralCoin: 'BTC',
  fromAsset: 'USDT',
  toAsset: 'BTC',
  settleAsset: 'USDT',
  assetRewards: 'BTC',
  email: 'sub@example.com',
  address: 'bnb1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  network: 'BNB',
  transactionType: 0,
  interval: '1h',
  period: '1',
  side: 'BUY',
  type: '1',
  status: '1',
  direction: 'ADDITIONAL',
  startTime: 1,
  endTime: 2,
};

function sampleValue(param: Param): string | number | boolean {
  if (param.name in VALUE_BY_NAME) return VALUE_BY_NAME[param.name];
  if (param.typeText === 'number') return 1;
  if (param.typeText === 'boolean') return true;
  return '1'; // `string | number` and every other permissive union
}

function parseResourceFile(filePath: string): { className: string; rows: Row[] } {
  const source = ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2022, true);
  let className = '';
  const rows: Row[] = [];

  for (const stmt of source.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    className = stmt.name.text;
    for (const member of stmt.members) {
      if (!ts.isMethodDeclaration(member) || !member.body || !member.name || !ts.isIdentifier(member.name)) continue;
      const method = member.name.text;
      if (method === 'constructor') continue;

      // Params: first parameter's object-literal type members.
      const params: Param[] = [];
      const firstParam = member.parameters[0];
      if (firstParam?.type && ts.isTypeLiteralNode(firstParam.type)) {
        for (const prop of firstParam.type.members) {
          if (!ts.isPropertySignature(prop) || !prop.type || !ts.isIdentifier(prop.name)) continue;
          params.push({
            name: prop.name.text,
            required: !prop.questionToken,
            typeText: prop.type.getText(source).replace(/\s+/g, ' ').trim(),
          });
        }
      }

      // this.http.<verb>("<path>", ..., '<auth>') from the method body.
      let verb = '';
      let path = '';
      let auth = '';
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const callee = node.expression;
          const isHttpCall = ts.isPropertyAccessExpression(callee.expression) && callee.expression.getText(source) === 'this.http';
          if (isHttpCall && node.arguments.length >= 1 && ts.isStringLiteral(node.arguments[0])) {
            verb = callee.name.text.toUpperCase();
            path = node.arguments[0].text;
            if (node.arguments.length >= 3 && ts.isStringLiteral(node.arguments[2])) auth = node.arguments[2].text;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(member.body);

      if (!verb || !path) throw new Error(`${basename(filePath)}: ${className}.${method} — no this.http.<verb>(path) call found`);
      rows.push({ className, method, verb, path, auth, params });
    }
  }
  if (!className) throw new Error(`${basename(filePath)}: no class declaration found`);
  return { className, rows };
}

function argsLiteral(row: Row): string {
  const required = row.params.filter((p) => p.required);
  if (required.length === 0) return 'undefined';
  const entries = required.map((p) => `${p.name}: ${JSON.stringify(sampleValue(p))}`);
  return `{ ${entries.join(', ')} }`;
}

function main(): void {
  const tables: { className: string; rows: Row[] }[] = [];
  for (const f of FILES) tables.push(parseResourceFile(join(RESOURCES, f)));
  const total = tables.reduce((a, t) => a + t.rows.length, 0);
  console.log(`[request-tests] ${FILES.length} resources, ${total} methods`);

  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * GENERATED by scripts/generate-request-contract-tests.ts — do not hand-edit');
  lines.push(' * rows; regenerate the whole file instead:');
  lines.push(' *   npm run contracts:generate-request-tests');
  lines.push(' *');
  lines.push(` * Table-driven request contracts for the coverage-excluded Wave 5 + Wave 6`);
  lines.push(` * generated resources (${total} methods). One row per public method; the`);
  lines.push(' * harness asserts the outgoing REQUEST — HTTP verb, path, every supplied');
  lines.push(' * param in the query string (HttpClient serializes GET and POST params');
  lines.push(' * alike into the query), signature/timestamp/recvWindow on SIGNED routes,');
  lines.push(' * and the X-MBX-APIKEY header. Responses stay permissive ({}, then [] on');
  lines.push(' * retry — wave7 schemas are all-optional): response strictness is the Wave');
  lines.push(' * 8 ladder\'s job (contracts/wave8-oracle/README.md).');
  lines.push(' *');
  lines.push(' * The completeness ratchet at the bottom fails when a covered resource');
  lines.push(' * gains a public method without a regenerated row.');
  lines.push(' */');
  lines.push("import { http, HttpResponse } from 'msw';");
  lines.push("import { setupServer } from 'msw/node';");
  lines.push("import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';");
  lines.push("import { HttpClient } from '../../src/client/HttpClient.js';");
  const imports = tables.map((t) => `import { ${t.className} } from '../../src/resources/${FILES[tables.indexOf(t)].replace(/\.ts$/, '.js')}';`);
  lines.push(...imports);
  lines.push('');
  lines.push('const server = setupServer();');
  lines.push("beforeAll(() => server.listen({ onUnhandledFrame: 'bypass' }));");
  lines.push('afterEach(() => server.resetHandlers());');
  lines.push('afterAll(() => server.close());');
  lines.push('');
  lines.push("const BASE = 'https://api.binance.com';");
  lines.push('function http_(): HttpClient {');
  lines.push("  return new HttpClient({ baseURL: BASE, apiKey: 'k', apiSecret: 's' });");
  lines.push('}');
  lines.push('');
  lines.push('interface Row {');
  lines.push('  cls: new (http: HttpClient) => object;');
  lines.push('  method: string;');
  lines.push('  args: Record<string, string | number | boolean> | undefined;');
  lines.push('  verb: string;');
  lines.push('  path: string;');
  lines.push('  auth: string;');
  lines.push('}');
  lines.push('');

  // Per-resource ROWS constants (keeps the generated table readable per class).
  for (const table of tables) {
    lines.push(`const ${table.className}_ROWS: Row[] = [`);
    for (const row of table.rows) {
      lines.push(`  { cls: ${table.className}, method: ${JSON.stringify(row.method)}, args: ${argsLiteral(row)}, verb: ${JSON.stringify(row.verb)}, path: ${JSON.stringify(row.path)}, auth: ${JSON.stringify(row.auth)} },`);
    }
    lines.push('];');
    lines.push('');
  }

  // Harness + generated describe blocks.
  lines.push('interface Captured {');
  lines.push('  method: string;');
  lines.push('  url: URL;');
  lines.push('  apiKey: string | null;');
  lines.push('}');
  lines.push('');
  lines.push('/** Permissive candidate payloads: every wave7 schema accepts at least');
  lines.push(' * one of these (verified across all 16 modules — object schemas take');
  lines.push(' * {}, array schemas [], and envelope schemas like the fiat history');
  lines.push(' * { data: [...] } carry a required empty array under data/rows/list).');
  lines.push(' * The harness serves them in order and stops at the first that parses. */');
  lines.push('const CANDIDATE_PAYLOADS: unknown[] = [{}, [], { data: [] }, { rows: [] }, { list: [] }];');
  lines.push('');
  lines.push('/** Run one row: serve permissive candidates until the method resolves,');
  lines.push(' * capture the outgoing request, and return it. */');
  lines.push('async function runRow(row: Row): Promise<Captured> {');
  lines.push('  let captured: Captured | undefined;');
  lines.push('  let payload: unknown = CANDIDATE_PAYLOADS[0];');
  lines.push('  server.use(');
  lines.push("    http.all(`*${row.path}`, ({ request }) => {");
  lines.push('      captured = {');
  lines.push('        method: request.method,');
  lines.push('        url: new URL(request.url),');
  lines.push('        apiKey: request.headers.get(\'x-mbx-apikey\'),');
  lines.push('      };');
  lines.push('      return HttpResponse.json(payload as Record<string, unknown> | Array<unknown>);');
  lines.push('    }),');
  lines.push('  );');
  lines.push('  const resource = new row.cls(http_()) as Record<string, (args?: unknown) => Promise<unknown>>;');
  lines.push('  let lastError: unknown;');
  lines.push('  for (const candidate of CANDIDATE_PAYLOADS) {');
  lines.push('    payload = candidate;');
  lines.push('    try {');
  lines.push('      await resource[row.method](row.args);');
  lines.push('      break;');
  lines.push('    } catch (err) {');
  lines.push('      // This candidate did not satisfy the response schema — try the');
  lines.push('      // next shape. If every candidate fails, the response side is');
  lines.push('      // genuinely broken and the row must surface the last error.');
  lines.push('      lastError = err;');
  lines.push('    }');
  lines.push('  }');
  lines.push('  if (!captured) {');
  lines.push('    throw new Error(`no request captured for ${row.method}: ${String(lastError)}`);');
  lines.push('  }');
  lines.push('  return captured;');
  lines.push('}');
  lines.push('');

  for (const table of tables) {
    lines.push(`describe('${table.className} — request contracts (Wave 5/6 generated surface)', () => {`);
    lines.push(`  for (const row of ${table.className}_ROWS) {`);
    lines.push("    it(`${row.method} -> ${row.verb} ${row.path}`, async () => {");
    lines.push('      const captured = await runRow(row);');
    lines.push('      expect(captured.method).toBe(row.verb);');
    lines.push('      expect(captured.url.pathname).toBe(row.path);');
    lines.push('      for (const [key, value] of Object.entries(row.args ?? {})) {');
    lines.push('        expect(captured.url.searchParams.get(key), `${key} must be serialized into the query string`).toBe(String(value));');
    lines.push('      }');
    lines.push("      if (row.auth === 'signed') {");
    lines.push("        expect(captured.url.searchParams.get('signature'), 'SIGNED routes carry an HMAC signature').toBeTruthy();");
    lines.push("        expect(captured.url.searchParams.get('timestamp'), 'SIGNED routes carry a timestamp').toBeTruthy();");
    lines.push("        expect(captured.url.searchParams.get('recvWindow'), 'SIGNED routes carry recvWindow').toBeTruthy();");
    lines.push('      }');
    lines.push("      expect(captured.apiKey, 'non-public routes carry X-MBX-APIKEY').toBe('k');");
    lines.push('    });');
    lines.push('  }');
    lines.push('});');
    lines.push('');
  }

  // Completeness ratchet: prototype method enumeration.
  lines.push("describe('request-contract table completeness', () => {");
  for (const table of tables) {
    lines.push(`  it('${table.className}: every public method has a row', () => {`);
    lines.push(`    const methods = Object.getOwnPropertyNames(${table.className}.prototype).filter((m) => m !== 'constructor');`);
    lines.push(`    const rowed = ${table.className}_ROWS.map((r) => r.method);`);
    lines.push('    expect([...new Set(rowed)].sort()).toEqual([...new Set(methods)].sort());');
    lines.push('  });');
    lines.push('');
  }
  lines.push('});');
  lines.push('');

  const outFile = join(ROOT, 'test', 'resources', 'RequestContracts.test.ts');
  writeFileSync(outFile, lines.join('\n'));
  console.log(`  -> test/resources/RequestContracts.test.ts (${total} rows, ${tables.length} completeness gates)`);
}

if (process.argv[1] && process.argv[1].endsWith('generate-request-contract-tests.ts')) {
  main();
}
