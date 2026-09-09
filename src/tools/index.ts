import type { BinanceClient } from '../client/BinanceClient.js';
import type { ExecutionBackend } from '../execution/Gateway.js';
import type { PaperTradingOptions } from '../paper/PaperTradingEngine.js';
import { accountTools } from './account.tools.js';
import { derivedTools } from './derived.tools.js';
import { executionTools } from './execution.tools.js';
import { marketDataTools } from './market-data.tools.js';
import { createPaperContext, type PaperContext, paperTools } from './paper.tools.js';
import { spotTools } from './spot.tools.js';
import { tradingTools } from './trading.tools.js';
import { wsTools } from './ws.tools.js';
import type { ToolDefinition } from './types.js';
import { toToolList } from './types.js';

export type { ToolDefinition, ToolContext } from './types.js';
export { toJsonSchema, toOpenAITool, toAnthropicTool, toMCPTool, toToolList, textResult } from './types.js';
export { marketDataTools } from './market-data.tools.js';
export { accountTools } from './account.tools.js';
export { tradingTools } from './trading.tools.js';
export { executionTools } from './execution.tools.js';
export { spotTools } from './spot.tools.js';
export { derivedTools } from './derived.tools.js';
export { wsTools, getBufferedWsEvents, clearBufferedWsEvents } from './ws.tools.js';
export { createPaperContext, paperTools, type PaperState, type PaperPosition, type PaperEvent, type PaperContext } from './paper.tools.js';

export interface FuturesToolkitOptions {
  /**
   * Backend the execution tools use when a call does not specify one.
   * Default 'live'. Set 'paper' to run the whole toolkit against the
   * simulator (no API keys required, public market data only).
   */
  executionBackend?: ExecutionBackend;
  /** Simulator configuration for the paper backend (start balance, models). */
  paper?: PaperTradingOptions;
}

export interface FuturesToolkit {
  client: BinanceClient;
  tools: ToolDefinition[];
  market: ToolDefinition[];
  account: ToolDefinition[];
  trading: ToolDefinition[];
  spot: ToolDefinition[];
  ws: ToolDefinition[];
  /** Composite tools that fan out over several endpoints. */
  derived: ToolDefinition[];
  paper: ToolDefinition[];
  paperContext: PaperContext;
  /** Idempotent, reconciling, backend-routed order tools (v2.3). */
  execution: ToolDefinition[];
  /** The gateway the execution tools route through. */
  gateway: import('../execution/Gateway.js').ExecutionGateway;
}

export function createFuturesToolkit(client: BinanceClient, options: FuturesToolkitOptions = {}): FuturesToolkit {
  const market = marketDataTools(client);
  const account = accountTools(client);
  const trading = tradingTools(client);
  const spot = spotTools(client);
  const ws = wsTools(client);
  const derived = derivedTools(client);
  const paperContext = createPaperContext(client);
  const paper = paperTools(paperContext);
  const gateway = client.createExecutionGateway({
    paper: options.paper,
    defaultBackend: options.executionBackend,
  });
  const execution = executionTools(gateway, client);
  return {
    client,
    tools: [...market, ...account, ...trading, ...spot, ...ws, ...derived, ...paper, ...execution],
    market,
    account,
    trading,
    spot,
    ws,
    derived,
    paper,
    paperContext,
    execution,
    gateway,
  };
}

export function toolkitToFormats(toolkit: FuturesToolkit): {
  openai: Record<string, unknown>[];
  anthropic: Record<string, unknown>[];
  mcp: Record<string, unknown>[];
} {
  return {
    openai: toToolList(toolkit.tools, 'openai'),
    anthropic: toToolList(toolkit.tools, 'anthropic'),
    mcp: toToolList(toolkit.tools, 'mcp'),
  };
}
