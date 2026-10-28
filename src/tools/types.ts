import { z } from 'zod';

export interface ToolContext {
  env: 'live' | 'testnet' | 'demo';
  isSigned: boolean;
}

export interface ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  // Tool lists mix schemas, so the element type erases TInput; each handler's
  // args are validated against its own inputSchema by MCP registerTool.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, ctx: ToolContext) => Promise<unknown>;
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
} {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toJsonSchema(tool.inputSchema),
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
