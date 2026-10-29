/**
 * Wave 8 generator — derives strict response Zod schemas from the vendored
 * connector-js oracle (Binance's official OpenAPI documents, generated).
 *
 * Input:  contracts/wave8-oracle/<product>/*.ts — vendored connector-js
 *         response interfaces, each carrying a provenance header with the
 *         pinned upstream commit (see contracts/wave8-oracle/README.md).
 *         Plus <product>.overrides.json — the SDK conventions layered on
 *         top of the oracle (numeric transforms, id flexibility, extra
 *         wire fields). Overrides are the review surface for deliberate
 *         divergences; the oracle drives everything else.
 * Output: src/types/<product>.wave8.types.ts — strict, field-level Zod
 *         schemas + inferred types, marked GENERATED (do not hand-edit),
 *         plus contracts/wave8-coverage/<product>.json (schema/field census
 *         for the ratchet gates).
 *
 * Design rules:
 *   - Oracle field presence drives schema fields (all-optional upstream
 *     stays optional here). Object schemas stay `.loose()` so unknown
 *     Binance-side additions pass through — strictness lives at the
 *     FIELD level (exact types per endpoint, not permissive unions).
 *   - numericStringFields overrides: oracle `string` amount fields emit
 *     `z.string().transform(Number)` — the SDK's established numeric
 *     convention from Wave 1 (asserted by existing tests).
 *   - flexibleIdFields overrides: fields the upstream OpenAPI types as
 *     `number | bigint` but that Binance also returns as strings (docs
 *     examples vary across the catalog migration) emit
 *     `z.coerce.string()` — both wire forms accepted, established SDK
 *     string type emitted.
 *   - extraFields overrides: fields the wire carries that the current
 *     upstream OpenAPI omits — appended verbatim, with the reason in
 *     the overrides file.
 *   - Interfaces that `extends Array<Inner>` emit `z.array(inner)`;
 *     wrapper interfaces with a `list` property stay objects. Where the
 *     wire has shipped both shapes, the resource composes a transition
 *     union at the call site (see src/resources/Convert.ts) — the
 *     generator itself stays oracle-faithful.
 *
 * Run via: `npm run contracts:wave8-strict-schemas -- --product convert`
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE_DIR = join(ROOT, 'contracts', 'wave8-oracle');
const SRC_TYPES = join(ROOT, 'src', 'types');

interface OracleProperty {
  name: string;
  optional: boolean;
  /** e.g. 'string', 'number | bigint', 'Array<Foo>', 'Foo' */
  typeText: string;
  /** first @description-ish line of the oracle docblock, '' when absent */
  description: string;
}

interface OracleInterface {
  name: string;
  /** set when `extends Array<Inner>` */
  arrayOf?: string;
  properties: OracleProperty[];
}

interface FieldGroup {
  $comment?: string;
  fields: string[];
}

interface Overrides {
  numericStringFields?: FieldGroup;
  flexibleIdFields?: FieldGroup;
  extraFields?: Record<string, { $comment?: string; fields: Record<string, string> }>;
}

interface ProductMeta {
  product: string;
  pinnedSha: string;
  pinnedAt: string;
  sourceUrl: string;
  sourcePath: string;
}

// ---------------------------------------------------------------------------
// Oracle parsing (TypeScript compiler API)
// ---------------------------------------------------------------------------

function parseOracleFile(filePath: string): OracleInterface[] {
  const source = ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2022, true);
  const interfaces: OracleInterface[] = [];

  for (const stmt of source.statements) {
    if (!ts.isInterfaceDeclaration(stmt)) continue;
    const iface: OracleInterface = { name: stmt.name.text, properties: [] };

    for (const clause of stmt.heritageClauses ?? []) {
      for (const t of clause.types) {
        const text = t.getText(source);
        const m = text.match(/^Array<(\w+)>$/);
        if (m) iface.arrayOf = m[1];
      }
    }

    for (const member of stmt.members) {
      if (!ts.isPropertySignature(member) || !member.type) continue;
      // JSDoc description = first non-@ line of the property's docblock.
      let description = '';
      for (const tag of ts.getJSDocCommentsAndTags(member)) {
        const text = typeof tag.comment === 'string' ? tag.comment : Array.isArray(tag.comment) ? tag.comment.map((p) => p.getText?.() ?? String(p)).join('') : '';
        const first = text
          .split('\n')
          .map((l) => l.replace(/^[\s*]+/, '').trim())
          .find((l) => l && !l.startsWith('@'));
        if (first) {
          description = first;
          break;
        }
      }
      iface.properties.push({
        name: member.name.getText(source),
        optional: !!member.questionToken,
        typeText: member.type.getText(source).replace(/\s+/g, ' ').trim(),
        description,
      });
    }
    interfaces.push(iface);
  }
  return interfaces;
}

// ---------------------------------------------------------------------------
// Oracle type → Zod expression
// ---------------------------------------------------------------------------

function zodForType(typeText: string, schemaNameFor: (iface: string) => string): string {
  if (typeText === 'string') return 'z.string()';
  if (typeText === 'number | bigint' || typeText === 'number' || typeText === 'bigint') return 'z.number()';
  if (typeText === 'boolean') return 'z.boolean()';
  const arr = typeText.match(/^Array<(\w+)>$/);
  if (arr) return `z.array(${schemaNameFor(arr[1])})`;
  if (/^\w+$/.test(typeText)) return schemaNameFor(typeText); // interface ref
  throw new Error(`Unsupported oracle type: ${typeText}`);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function schemaNameFor(ifaceName: string): string {
  return `${lowerFirst(ifaceName)}Schema`;
}

function emitProperty(p: OracleProperty, overrides: Overrides): { name: string; zod: string; description: string } {
  const flexibleIds = overrides.flexibleIdFields?.fields ?? [];
  const numericStrings = overrides.numericStringFields?.fields ?? [];
  let zod: string;

  if (flexibleIds.includes(p.name) && (p.typeText === 'number | bigint' || p.typeText === 'number')) {
    zod = 'z.coerce.string()';
  } else if (numericStrings.includes(p.name) && p.typeText === 'string') {
    zod = 'z.string().transform(Number)';
  } else {
    zod = zodForType(p.typeText, schemaNameFor);
  }
  if (p.optional) zod += '.optional()';
  return { name: p.name, zod, description: p.description };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function emitGeneratedFile(meta: ProductMeta, interfaces: OracleInterface[], overrides: Overrides, outFile: string): { schemas: number; fields: number } {
  // Topological order: an interface referencing another (via Array<Inner> or
  // a bare type ref) must be emitted AFTER its dependencies — const
  // declarations are not hoisted, so a forward reference would crash at
  // module load.
  const byName = new Map(interfaces.map((i) => [i.name, i]));
  const emitted = new Set<string>();
  const ordered: OracleInterface[] = [];
  let progress = true;
  while (ordered.length < interfaces.length && progress) {
    progress = false;
    for (const iface of interfaces) {
      if (emitted.has(iface.name)) continue;
      const deps = [iface.arrayOf, ...iface.properties.map((p) => (/^\w+$/.test(p.typeText) ? p.typeText : null))].filter(
        (d): d is string => !!d && byName.has(d as string),
      );
      if (deps.every((d) => emitted.has(d) || d === iface.name)) {
        ordered.push(iface);
        emitted.add(iface.name);
        progress = true;
      }
    }
  }
  if (ordered.length < interfaces.length) {
    const stuck = interfaces.filter((i) => !emitted.has(i.name)).map((i) => i.name);
    throw new Error(`Dependency cycle or unresolved refs in oracle: ${stuck.join(', ')}`);
  }

  const lines: string[] = [
    '/**',
    ` * GENERATED by scripts/wave8-strict-schemas.ts from contracts/wave8-oracle/${meta.product}`,
    ` * Oracle: ${meta.sourceUrl} @ ${meta.pinnedSha.slice(0, 12)} (${meta.pinnedAt}), ${meta.sourcePath}.`,
    ` * Upstream interfaces are OpenAPI Generator output of Binance's official`,
    ` * ${meta.product} OpenAPI documents (developers.binance.com).`,
    ` * Do not hand-edit. Regenerate via`,
    ` *   npm run contracts:wave8-strict-schemas -- --product ${meta.product}`,
    ` * (re-vendor the oracle first — contracts/wave8-oracle/README.md).`,
    ' *',
    ' * Strictness contract: field types and presence mirror the oracle; SDK',
    ' * conventions (numeric-amount transforms, id coercion, extra wire fields)',
    ` * come from contracts/wave8-oracle/${meta.product}.overrides.json. Objects stay`,
    ' * .loose() so unknown Binance-side additions pass through — strictness is',
    ' * at the field level, not the object level.',
    ' */',
    "import { z } from 'zod';",
    '',
  ];

  let schemaCount = 0;
  let fieldCount = 0;

  for (const iface of ordered) {
    const schema = schemaNameFor(iface.name);
    const type = iface.name;
    lines.push(`/** ${iface.name} — response shape from the pinned oracle. */`);
    if (iface.arrayOf) {
      lines.push(`export const ${schema} = z.array(${schemaNameFor(iface.arrayOf)});`);
    } else {
      lines.push(`export const ${schema} = z.object({`);
      const extras = overrides.extraFields?.[iface.name]?.fields ?? {};
      const emitted = new Set<string>();
      for (const p of iface.properties) {
        const { name, zod, description } = emitProperty(p, overrides);
        if (emitted.has(name)) continue; // dedupe: extraFields wins, emit later
        lines.push(`  /** ${description || name} */`);
        lines.push(`  ${name}: ${zod},`);
        emitted.add(name);
        fieldCount++;
      }
      for (const [name, zod] of Object.entries(extras)) {
        if (emitted.has(name)) continue;
        lines.push(`  /** ${name} — SDK extra-field override (see ${meta.product}.overrides.json). */`);
        lines.push(`  ${name}: ${zod},`);
        emitted.add(name);
        fieldCount++;
      }
      lines.push('}).loose();');
    }
    lines.push(`export type ${type} = z.infer<typeof ${schema}>;`);
    lines.push('');
    schemaCount++;
  }

  writeFileSync(outFile, lines.join('\n'));
  return { schemas: schemaCount, fields: fieldCount };
}

function emitCoverage(meta: ProductMeta, interfaces: OracleInterface[], census: { schemas: number; fields: number }, outFile: string): void {
  const coverage = {
    schemaVersion: 1,
    product: meta.product,
    oracleSource: {
      repo: meta.sourceUrl,
      commit: meta.pinnedSha,
      pinnedAt: meta.pinnedAt,
      path: meta.sourcePath,
    },
    generatedFile: `src/types/${meta.product}.wave8.types.ts`,
    interfaces: interfaces.map((i) => ({ name: i.name, arrayBase: i.arrayOf ?? null, fields: i.properties.length })),
    schemaCount: census.schemas,
    fieldCount: census.fields,
  };
  writeFileSync(outFile, `${JSON.stringify(coverage, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const product = process.argv.includes('--product')
    ? process.argv[process.argv.indexOf('--product') + 1]
    : process.argv[2];
  if (!product || product.startsWith('--')) {
    console.error('[wave8] usage: wave8-strict-schemas -- --product <product> (dir under contracts/wave8-oracle/)');
    process.exit(2);
  }

  const productDir = join(ORACLE_DIR, product);
  const indexFile = join(ORACLE_DIR, `${product}.index.json`);
  const overridesFile = join(ORACLE_DIR, `${product}.overrides.json`);
  const meta = JSON.parse(readFileSync(indexFile, 'utf8')) as ProductMeta;
  const overrides = JSON.parse(readFileSync(overridesFile, 'utf8')) as Overrides;

  const files = readdirSync(productDir)
    .filter((f) => f.endsWith('.ts'))
    .sort();
  console.log(`[wave8] ${product}: ${files.length} oracle files @ ${meta.pinnedSha.slice(0, 12)}`);

  const interfaces: OracleInterface[] = [];
  for (const f of files) interfaces.push(...parseOracleFile(join(productDir, f)));
  console.log(`[wave8] parsed ${interfaces.length} interfaces`);

  const outFile = join(SRC_TYPES, `${product}.wave8.types.ts`);
  const census = emitGeneratedFile(meta, interfaces, overrides, outFile);
  console.log(`  -> ${basename(outFile)}: ${census.schemas} schemas, ${census.fields} fields`);

  const coverageFile = join(ROOT, 'contracts', 'wave8-coverage', `${meta.product}.json`);
  emitCoverage(meta, interfaces, census, coverageFile);
  console.log(`  -> contracts/wave8-coverage/${meta.product}.json`);
}

if (process.argv[1] && process.argv[1].endsWith('wave8-strict-schemas.ts')) {
  main();
}
