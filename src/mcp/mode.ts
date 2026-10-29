/**
 * Fail-closed mode resolution for the MCP CLI.
 *
 * Kept in its own (side-effect-free) module so tests can import it directly —
 * `mcp/index.ts` runs the server on import.
 */
import { BinanceClient } from '../client/BinanceClient.js';
import type { ExecutionBackend } from '../execution/Gateway.js';

export interface McpMode {
  /** Execution backend the toolkit routes order tools to. Default 'paper'. */
  backend: ExecutionBackend;
  /**
   * When true the client is built with a read-only safety fence: every
   * mutating request is refused by policy (signed GETs still work). Trading
   * tools are disabled in read-only mode by construction — there is no
   * configuration that can reach the exchange with an order.
   */
  readOnly: boolean;
}

/**
 * Resolution rules:
 *
 *  - execution defaults to the PAPER simulator — a missing environment flag
 *    must never silently select live trading for an autonomous host;
 *  - `BINANCE_MCP_LIVE=1` opts into live execution AND lifts the read-only
 *    fence;
 *  - `BINANCE_TESTNET=true` / `BINANCE_ENV=testnet` select testnet hosts.
 */
export function resolveMcpMode(env: NodeJS.ProcessEnv = process.env): McpMode {
  const live = env.BINANCE_MCP_LIVE === '1';
  return live ? { backend: 'live', readOnly: false } : { backend: 'paper', readOnly: true };
}

/** Client matching the mode: read-only fence on unless live was opted into. */
export function mcpClientFromEnv(env: NodeJS.ProcessEnv = process.env): BinanceClient {
  const { readOnly } = resolveMcpMode(env);
  return new BinanceClient({
    apiKey: env.BINANCE_API_KEY,
    apiSecret: env.BINANCE_API_SECRET,
    testnet: env.BINANCE_TESTNET === 'true' || env.BINANCE_ENV === 'testnet',
    demo: env.BINANCE_ENV === 'demo',
    safety: readOnly ? { readOnly: true } : undefined,
  });
}

/** Startup banner lines describing the effective mode (stderr-friendly). */
export function mcpModeBanner(mode: McpMode, env: NodeJS.ProcessEnv = process.env): string[] {
  const environment =
    env.BINANCE_TESTNET === 'true' || env.BINANCE_ENV === 'testnet' ? 'testnet' : 'mainnet';
  return [
    `binance-sdk MCP: execution backend=${mode.backend.toUpperCase()}` +
      (mode.backend === 'paper' ? ' (default; set BINANCE_MCP_LIVE=1 for live execution)' : ' (LIVE — real orders, real funds)'),
    `binance-sdk MCP: read-only fence=${mode.readOnly ? 'ON (mutating requests refused)' : 'OFF (live opted in)'}`,
    `binance-sdk MCP: environment=${environment}`,
  ];
}
