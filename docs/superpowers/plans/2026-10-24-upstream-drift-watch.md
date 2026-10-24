# Plan: Postman upstream drift watch + known-gaps coverage gate

Date: 2026-10-24 · Stacked on PR #49 (`feature/waves-8-11-ws-mcp-docs-ci`): the Postman contract layer only exists on that branch.

## Context

The SDK is contract-first from Binance's official Postman collections:
- `scripts/import-postman-collections.ts` → `contracts/postman-catalog.json` (713 endpoints, 24 collections)
- `scripts/generate-sdk-from-postman.ts` → registry, resources and `contracts/postman-coverage.json` (0 missing)

Three gaps:
1. **No provenance.** The import reads a local extract (`../postman-extract/...`) that no longer exists, and the catalog records only `generatedAt`. Nobody can tell which upstream commit it reflects, and nobody can re-run it.
2. **Nothing notices upstream moving.** binance-api-postman is bot-updated almost daily (its latest commit touching `collections/` is 2026-10-22, after the catalog was generated).
3. **Gaps aren't explicit.** Collections without a product mapping are skipped with a console warning. The 0-missing claim comes from a generated file that only refreshes when the generator runs.

## Upstream survey (github.com/binance + developers.binance.com)

| Source | Status | Use |
|---|---|---|
| `binance/binance-api-postman` | bot-updated ~daily, 26 collections, structured JSON | **Pinned contract source** (already the SDK's source) |
| `binance/binance-connector-js` | official, generated from the same specs, 27 client packages | Reference only. A second extractor would just duplicate Postman. Revisit if Postman lags it. |
| `binance/binance-spot-api-docs` | official spot docs + `CHANGELOG.md`, pushed 2026-10-20 | Informational watch: `CHANGELOG.md` commits in the weekly report |
| developers.binance.com changelogs (derivatives etc.) | Carry param-level changes (e.g. 2026-10-22 PM Pro uniMMR notification endpoints). Bot-protected: curl gets an empty `202`. | Linked in the report, not scraped |
| `binance-api-swagger` | last push 2024 | Not used (stale) |
| `binance-connector-typescript`, `binance-futures-connector-node` | superseded by connector-js | Not used |
| `binance-public-data`, SBE sample apps, `binance-signature-examples`, `asymmetric-key-generator` | adjacent tooling | Reference only |

## Decisions

- **Gap policy:** existing gaps are recorded as known with a baseline reason; every new gap needs a written reason.
- **Reference:** Postman over connector-js. It is structured JSON, already wired into the SDK, and generated from the same specs.
- **Drift = endpoint inventory change, not commit movement.** Daily bot commits that don't change endpoints or params open no PR.

## Changes

1. **`scripts/import-postman-collections.ts`**
   - Fetches collections from GitHub at `--ref <sha>`, defaulting to the latest commit touching `collections/`. Uses the trees API plus raw downloads. `POSTMAN_COLLECTIONS_DIR` stays as the offline path.
   - Writes `pinnedSha`/`pinnedAt` to the catalog and the source index, replacing the churning `generatedAt`.
   - Records collections without a mapping in `unmappedCollections`.
   - Exports `extractContracts()`; `main()` runs only behind a CLI guard.
2. **`scripts/upstream-drift.ts`** (`npm run contracts:upstream-drift`)
   - Extracts contracts at the latest upstream commit in memory and diffs them against the committed catalog by `METHOD path`: added and removed endpoints, plus param changes (name and required flag).
   - Informational sections: unmapped collections, `binance-spot-api-docs` CHANGELOG commits since the pin, derivatives changelog link.
   - Exit codes: 0 clean, 1 drift, 2 check failed. Writes `drifted`/`sha` to `$GITHUB_OUTPUT`.
3. **`contracts/postman-known-gaps.json`** plus **`test/contracts/known-gaps.test.ts`**:
   - every catalog endpoint is in `ENDPOINT_REGISTRY` or in known-gaps, with a reason;
   - no stale known-gap (already implemented, or gone from the catalog);
   - every unmapped collection is listed with a reason.
4. **`.github/workflows/upstream-watch.yml`**: the ollama-sdk workflow adapted.
   - Runs Mondays at 09:00 IST and on dispatch.
   - On drift: re-imports at the latest SHA, runs typecheck, tests, `contracts:check` and build (each gate's own exit code), opens or updates a PR on `upstream-sync/auto` and the `upstream-drift` issue.
   - Never auto-merges. Never runs the code generator: generated code is a human decision.
5. **Docs:** `package.json` script, CHANGELOG entry.

## Verification

1. Re-import at the commit the current catalog came from (latest `collections/` commit before 2026-10-22T05:22Z). The endpoint list must match the committed catalog; this establishes provenance.
2. Fill known-gaps from a real run; `npm test`, `typecheck`, `contracts:check` and `build` must be green.
3. Run `contracts:upstream-drift` live and record the drift it reports.
