/**
 * Importable MCP surface — the side-effect-free counterpart to the CLI.
 *
 * `src/mcp/index.ts` is the *executable* (`binance-sdk-mcp`): it resolves a
 * mode, starts a server and takes over stdio on import, so it must never be
 * the target of the package's `./mcp` subpath export. This module re-exports
 * the programmatic API hosts embed when they manage the transport themselves:
 *
 * ```ts
 * import { createBinanceMcpServer, resolveMcpMode, mcpClientFromEnv } from '@nemesis-oss/binance-sdk/mcp';
 *
 * const mode = resolveMcpMode();                 // fail-closed: paper + read-only unless BINANCE_MCP_LIVE=1
 * const server = createBinanceMcpServer(mcpClientFromEnv(), { executionBackend: mode.backend });
 * ```
 */
export { createBinanceMcpServer } from './server.js';
export {
  resolveMcpMode,
  mcpClientFromEnv,
  mcpModeBanner,
  type McpMode,
} from './mode.js';
