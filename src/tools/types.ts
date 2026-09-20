import { z } from 'zod';

export interface ToolContext {
  env: 'live' | 'testnet' | 'demo';
  isSigned: boolean;
}

/**
 * Tool risk/behavior hints — the standard MCP `ToolAnnotations` vocabulary
 * (https://modelcontextprotocol.io), not an invented risk scale, so any
 * conformant MCP host already knows how to use them (e.g. to decide
 * whether to prompt the user before calling a tool). Defined locally
 * rather than imported from `@modelcontextprotocol/sdk` so this tool layer
 * stays framework-agnostic (same reason `toOpenAITool`/`toAnthropicTool`/
 * `toMCPTool` exist as separate adapters below); `toMCPTool` maps this
 * 1:1 onto the real protocol field.
 *
 * - `readOnlyHint` — no side effects on the account or exchange; safe to
 *   call freely.
 * - `destructiveHint` — may cause a hard-to-reverse, real-world
 *   consequence (order placement/cancellation, a conversion, an
 *   account-config change with a cooldown). Meaningless when
 *   `readOnlyHint` is true.
 * - `idempotentHint` — calling it more than once with the same arguments
 *   converges to the same end state (never worse than calling it once).
 * - `openWorldHint` — touches live external state (the real exchange)
 *   rather than only local/simulated state (e.g. every `paper_*` tool is
 *   `false` — it mutates an in-memory simulator only, never a real order).
 *
 * See `src/tools/annotations.ts` for the per-tool classification and why
 * a few entries contradict what the tool's name alone would suggest.
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: (args: any, ctx: ToolContext) => Promise<unknown>;
  /** Risk/behavior hints for MCP hosts and other agent runtimes. See {@link ToolAnnotations}. */
  annotations?: ToolAnnotations;
}

export function normalizeSymbol(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}
export function normalizeLimit(value: unknown): number {
  return Number(value);
}

export function toJsonSchema(inputSchema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(inputSchema, { target: 'json' });
}

export function toOpenAITool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema(tool.inputSchema),
    },
  };
}

export function toAnthropicTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: toJsonSchema(tool.inputSchema),
  };
}

export function toMCPTool(tool: ToolDefinition): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
} {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toJsonSchema(tool.inputSchema),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
  };
}

export function toToolList<TInput extends z.ZodTypeAny>(
  tools: ToolDefinition<TInput>[],
  format: 'openai' | 'anthropic' | 'mcp',
): Record<string, unknown>[] {
  const adapter =
    format === 'openai' ? toOpenAITool : format === 'anthropic' ? toAnthropicTool : toMCPTool;
  return tools.map(adapter);
}

export function textResult(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
