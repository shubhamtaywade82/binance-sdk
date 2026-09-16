import { describe, expect, it, vi } from 'vitest';

/**
 * We replace @modelcontextprotocol/sdk/server/mcp.js McpServer with a thin
 * recorder that captures every registerTool / registerResource call, and we
 * replace createFuturesToolkit with a stub returning a fixed tool list.
 * vi.mock is hoisted above the imports below.
 */
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class FakeMcpServer {
    name: string;
    version: string;
    tools: { name: string; description: string; inputSchema: unknown }[] = [];
    resources: { name: string; uri: string; description: string }[] = [];
    constructor(opts: { name: string; version: string }) {
      this.name = opts.name;
      this.version = opts.version;
    }
    registerTool(name: string, meta: { description: string; inputSchema: unknown }, _handler: unknown) {
      this.tools.push({ name, description: meta.description, inputSchema: meta.inputSchema });
    }
    registerResource(name: string, uri: string, meta: { description: string }) {
      this.resources.push({ name, uri, description: meta.description });
    }
  }
  return { McpServer: FakeMcpServer };
});

vi.mock('../../src/tools/index.js', () => ({
  createFuturesToolkit: vi.fn(() => ({
    tools: [
      { name: 'market.klines', description: 'klines', inputSchema: { type: 'object', properties: {} }, handler: async () => 'k' },
      { name: 'account.balance', description: 'balance', inputSchema: { type: 'object', properties: {} }, handler: async () => 'b' },
      { name: 'execution.place_order', description: 'place order', inputSchema: { type: 'object', properties: {} }, handler: async () => 'p' },
    ],
  })),
}));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createFuturesToolkit } from '../../src/tools/index.js';
import { createBinanceMcpServer } from '../../src/mcp/server.js';
import { VERSION } from '../../src/version.js';
import type { BinanceClient } from '../../src/client/BinanceClient.js';

function fakeClient(): BinanceClient {
  // createFuturesToolkit is mocked — the client never gets touched at
  // server-construction time, so an empty object cast is safe.
  return {} as unknown as BinanceClient;
}

describe('createBinanceMcpServer', () => {
  it('builds an McpServer named binance-sdk with the package VERSION', () => {
    const server = createBinanceMcpServer(fakeClient());
    expect(server).toBeInstanceOf(McpServer);
    expect((server as unknown as { name: string }).name).toBe('binance-sdk');
    expect((server as unknown as { version: string }).version).toBe(VERSION);
  });

  it('registers every toolkit tool with name + description + inputSchema', () => {
    const server = createBinanceMcpServer(fakeClient());
    const tools = (server as unknown as { tools: { name: string; description: string; inputSchema: unknown }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual([
      'market.klines', 'account.balance', 'execution.place_order',
    ]);
    expect(tools.every((t) => typeof t.description === 'string')).toBe(true);
    expect(tools.every((t) => t.inputSchema !== undefined)).toBe(true);
  });

  it('registers the futures-symbols, futures-premium-index and spot-symbols resources', () => {
    const server = createBinanceMcpServer(fakeClient());
    const resources = (server as unknown as { resources: { name: string; uri: string }[] }).resources;
    expect(resources.map((r) => r.name)).toEqual([
      'futures-symbols', 'futures-premium-index', 'spot-symbols',
    ]);
    expect(resources.map((r) => r.uri)).toEqual([
      'binance://futures/symbols',
      'binance://futures/premium-index',
      'binance://spot/symbols',
    ]);
  });

  it('toolkit options flow through to the toolkit constructor (paper backend)', async () => {
    const client = fakeClient();
    createBinanceMcpServer(client, { executionBackend: 'paper', paper: { initialBalance: 50_000 } });
    expect(createFuturesToolkit).toHaveBeenCalledWith(client, {
      executionBackend: 'paper',
      paper: { initialBalance: 50_000 },
    });
  });

  it('passes an empty options object when no toolkit options are provided', async () => {
    const client = fakeClient();
    createBinanceMcpServer(client);
    expect(createFuturesToolkit).toHaveBeenCalledWith(client, {});
  });
});
