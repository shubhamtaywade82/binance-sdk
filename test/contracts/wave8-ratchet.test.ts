/**
 * Wave 8 ratchet gate — locks the permissive-schema debt at its recorded
 * level and only allows it to shrink.
 *
 * The Wave 5-7 expansion shipped response typing that was permissive by
 * construction (see scripts/wave7-add-schemas.ts: every field a
 * string|number union, every response shape inferred from the method
 * name). Wave 8 replaces that with oracle-derived strict schemas,
 * product by product. Until a product migrates, its permissiveness is
 * *known debt*: recorded in contracts/wave8-ratchet.json, never allowed
 * to grow, lowered with every migration.
 *
 * Two counters:
 *
 * 1. `unvalidatedResourceReturns` — resource methods that hand raw JSON
 *    to the caller (`Promise<Record<string, unknown>>`,
 *    `Promise<unknown>`, `Promise<any>`), i.e. responses with no schema
 *    parse at all. The convert pilot removed one of these
 *    (Convert.limitCancelOrder).
 *
 * 2. `permissiveUnionFields` — `z.union([z.string(), z.number()])`
 *    fields across the generated wave7 type files: the per-field debt
 *    of the long tail. Migrating a product's resources to strict
 *    schemas means the wave7 file's schemas stop being referenced;
 *    remove them and this counter drops.
 *
 * Ratchet policy: a PR may lower a counter (and must update the JSON in
 * the same commit); a PR that raises one fails here with the exact
 * files to fix. When both counters reach 0, replace this gate with a
 * hard assertion that no resource returns unparsed responses.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RATCHET_FILE = join(ROOT, 'contracts', 'wave8-ratchet.json');
const RESOURCES_DIR = join(ROOT, 'src', 'resources');
const TYPES_DIR = join(ROOT, 'src', 'types');

interface RatchetBaseline {
  schemaVersion: number;
  $comment: string;
  unvalidatedResourceReturns: number;
  permissiveUnionFields: number;
}

const UNVALIDATED_RETURN = /Promise<(Record<string,\s*unknown>|unknown|any)>/;

function countUnvalidatedResourceReturns(): { count: number; files: string[] } {
  const files: string[] = [];
  let count = 0;
  for (const f of readdirSync(RESOURCES_DIR)) {
    if (!f.endsWith('.ts')) continue;
    const text = readFileSync(join(RESOURCES_DIR, f), 'utf8');
    const hits = text.split('\n').filter((l) => UNVALIDATED_RETURN.test(l)).length;
    if (hits > 0) {
      count += hits;
      files.push(`${f} (${hits})`);
    }
  }
  return { count, files };
}

function countPermissiveUnionFields(): { count: number; files: string[] } {
  const files: string[] = [];
  let count = 0;
  for (const f of readdirSync(TYPES_DIR)) {
    if (!f.endsWith('.wave7.types.ts')) continue;
    const text = readFileSync(join(TYPES_DIR, f), 'utf8');
    const hits = (text.match(/z\.union\(\[z\.string\(\),\s*z\.number\(\)\]\)/g) ?? []).length;
    if (hits > 0) {
      count += hits;
      files.push(`${f} (${hits})`);
    }
  }
  return { count, files };
}

describe('Wave 8 ratchet — permissive-schema debt never grows', () => {
  const baseline = JSON.parse(readFileSync(RATCHET_FILE, 'utf8')) as RatchetBaseline;

  it('unvalidated resource returns are at or below the baseline', () => {
    const { count, files } = countUnvalidatedResourceReturns();
    expect(
      count,
      `unvalidated resource returns grew: baseline ${baseline.unvalidatedResourceReturns}, now ${count}.\n` +
        `Every resource method must parse its response with a Zod schema; new methods must not return raw JSON.\n` +
        `Offending files: ${files.join(', ')}\n` +
        `If a count genuinely dropped, lower contracts/wave8-ratchet.json in the same commit.`,
    ).toBeLessThanOrEqual(baseline.unvalidatedResourceReturns);
  });

  it('permissive union fields in wave7 type files are at or below the baseline', () => {
    const { count, files } = countPermissiveUnionFields();
    expect(
      count,
      `permissive wave7 union fields grew: baseline ${baseline.permissiveUnionFields}, now ${count}.\n` +
        `New response schemas must be oracle-derived (see contracts/wave8-oracle/README.md), not wave7 unions.\n` +
        `Top files: ${files.sort((a, b) => parseInt(b.split('(')[1]) - parseInt(a.split('(')[1])).slice(0, 5).join(', ')}\n` +
        `If a count genuinely dropped (product migrated), lower contracts/wave8-ratchet.json in the same commit.`,
    ).toBeLessThanOrEqual(baseline.permissiveUnionFields);
  });

  it('the pilot product (convert) contributes zero unvalidated returns', () => {
    const text = readFileSync(join(RESOURCES_DIR, 'Convert.ts'), 'utf8');
    const hits = text.split('\n').filter((l) => UNVALIDATED_RETURN.test(l));
    expect(
      hits,
      'Convert migrated to Wave 8 strict schemas — every response must be parsed. Raw returns are forbidden here.',
    ).toHaveLength(0);
  });
});
