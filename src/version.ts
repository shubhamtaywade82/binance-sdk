/**
 * Single source of truth for the package version string.
 *
 * Read by:
 *  - {@link ./index.js} — re-exports as the public `VERSION` constant.
 *  - {@link ../mcp/server.js} — the MCP server identifies itself with this
 *    value when negotiating with hosts (was previously hard-coded as
 *    `'2.0.0'`, which drifted from `package.json`).
 *
 * Update in lockstep with the `version` field in `package.json` and the
 * `[Unreleased]` / latest release section in `CHANGELOG.md`.
 */
export const VERSION = '3.0.0';
