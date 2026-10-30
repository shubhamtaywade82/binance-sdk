/**
 * Single source of truth for the package version string.
 *
 * Read by:
 *  - {@link ./index.js} — re-exports as the public `VERSION` constant.
 *  - {@link ../mcp/server.js} — the MCP server identifies itself with this
 *    value when negotiating with hosts (was previously hard-coded as
 *    `'2.0.0'`, which drifted from `package.json`).
 *
 * Bumped together with `package.json` by release-please (the trailing
 * marker below); rename the `[Unreleased]` section of `CHANGELOG.md` on the
 * release PR branch before merging it.
 */
export const VERSION = '3.5.1'; // x-release-please-version
