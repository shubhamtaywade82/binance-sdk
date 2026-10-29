/**
 * Package-footprint gate — fails when the publishable npm artifact regresses.
 *
 * Two assertions over `npm pack --dry-run --json`:
 *
 * 1. No `.map` entries ship. Source maps are debug artifacts: tsup embeds
 *    sourcesContent, so each map duplicates the bundle AND the source tree.
 *    At the 3.4.1 state that was 36.8 MB of a 64.2 MB unpacked package
 *    (57%). Consumers who need maps can build from source; the published
 *    package carries code + types only. Exclusion lives in package.json
 *    files (a negation glob over dist .map files); this gate catches anyone
 *    reverting it (or adding a map through a different path).
 *
 * 2. Unpacked size stays within the budget (default 30 MB, override with
 *    FOOTPRINT_BUDGET_MB). The budget is a ratchet: shrink it in the same
 *    commit that legitimately shrinks the package; growth needs a conscious
 *    budget bump, not a silent slip. Post-fix reality: ~27.4 MB (dual-format
 *    bundles 20.8 MB + .d.ts/.d.cts declarations 6.6 MB).
 *
 * Exit codes: 0 clean, 1 footprint regression, 2 tool error.
 *
 * Run via: npm run package:check-footprint
 */
import { spawnSync } from 'node:child_process';

const BUDGET_MB = Number(process.env.FOOTPRINT_BUDGET_MB ?? 30);
const MB = 1048576;

interface PackedFile {
  path: string;
  size: number;
}

interface PackSummary {
  filename: string;
  files: PackedFile[];
  size: number;
  unpackedSize: number;
  entryCount: number;
}

function main(): void {
  // npm pack --dry-run never writes the tarball; --json emits the manifest.
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8', shell: false });
  if (res.status !== 0) {
    console.error(`[footprint] npm pack failed (${res.status}):\n${res.stderr}`);
    process.exit(2);
  }
  let summary: PackSummary;
  try {
    summary = JSON.parse(res.stdout)[0] as PackSummary;
  } catch {
    console.error(`[footprint] could not parse npm pack --json output:\n${res.stdout.slice(0, 500)}`);
    process.exit(2);
  }

  const failures: string[] = [];

  const maps = summary.files.filter((f) => f.path.endsWith('.map'));
  if (maps.length > 0) {
    failures.push(
      `${maps.length} source-map entries would ship (${(maps.reduce((a, f) => a + f.size, 0) / MB).toFixed(1)} MB): ` +
        maps.slice(0, 5).map((f) => f.path).join(', '),
    );
    console.error('[footprint] source maps must not ship — package.json files should carry "!dist/**/*.map".');
  }

  const unpackedMb = summary.unpackedSize / MB;
  if (unpackedMb > BUDGET_MB) {
    failures.push(`unpacked size ${unpackedMb.toFixed(1)} MB exceeds the ${BUDGET_MB} MB budget`);
    console.error('[footprint] unpacked size over budget — shrink the package or bump the budget deliberately (FOOTPRINT_BUDGET_MB).');
  }

  // Composition summary (CI log artifact — informational).
  const byExt = new Map<string, number>();
  for (const f of summary.files) {
    const ext = f.path.match(/\.([a-z]+)$/i)?.[1] ?? 'other';
    byExt.set(ext, (byExt.get(ext) ?? 0) + f.size);
  }
  const composition = [...byExt.entries()].sort((a, b) => b[1] - a[1]).map(([e, s]) => `.${e} ${(s / MB).toFixed(2)}MB`).join('  ');

  if (failures.length > 0) {
    console.error(`[footprint] FAIL — ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log(
    `[footprint] OK — tarball ${(summary.size / MB).toFixed(2)} MB, unpacked ${unpackedMb.toFixed(1)} MB (budget ${BUDGET_MB} MB), ${summary.entryCount} entries.`,
  );
  console.log(`[footprint]    composition: ${composition}`);
}

main();
