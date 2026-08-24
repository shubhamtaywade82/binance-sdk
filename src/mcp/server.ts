import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BinanceClient } from '../client/BinanceClient.js';
import { createFuturesToolkit } from '../tools/index.js';

export function createBinanceMcpServer(client: BinanceClient): McpServer {
  const server = new McpServer({ name: 'binance-sdk', version: '2.0.0' });
  const toolkit = createFuturesToolkit(client);

  toolkit.tools.forEach((tool) => {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args) => ({
      content: [{ type: 'text', text: String(await tool.handler(args, { env: 'live', isSigned: true })) }],
    }));
  });

  registerResources(server, client);

  return server;
}

/**
 * Reference data exposed as MCP resources rather than tools: hosts can attach these
 * to context directly, without the model having to decide to call something first.
 */
function registerResources(server: McpServer, client: BinanceClient): void {
  const json = (uri: string, data: unknown) => ({
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
  });

  server.registerResource(
    'futures-symbols',
    'binance://futures/symbols',
    {
      title: 'Futures Trading Symbols',
      description: 'Every tradeable USD-M futures symbol with its contract type and status',
      mimeType: 'application/json',
    },
    async (uri) => {
      const info = await client.futures.market.exchangeInfo();
      return json(uri.href, info.symbols);
    },
  );

  server.registerResource(
    'futures-premium-index',
    'binance://futures/premium-index',
    {
      title: 'Premium Index',
      description: 'Mark price, index price and funding rate across all USD-M pairs',
      mimeType: 'application/json',
    },
    async (uri) => json(uri.href, await client.futures.data.assetIndex()),
  );

  server.registerResource(
    'spot-symbols',
    'binance://spot/symbols',
    {
      title: 'Spot Trading Symbols',
      description: 'Every tradeable Spot symbol with its status, base/quote assets and permissions',
      mimeType: 'application/json',
    },
    async (uri) => {
      const info = await client.spot.market.exchangeInfo();
      return json(uri.href, info.symbols);
    },
  );
}
