#!/usr/bin/env node
import http from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBinanceMcpServer } from './server.js';
import { mcpClientFromEnv, mcpModeBanner, resolveMcpMode } from './mode.js';

async function startStdio(): Promise<void> {
  const mode = resolveMcpMode();
  for (const line of mcpModeBanner(mode)) console.error(line);
  const server = createBinanceMcpServer(mcpClientFromEnv(), {
    executionBackend: mode.backend,
  });
  await server.connect(new StdioServerTransport());
}

function startHttp(): void {
  const port = Number(process.env.PORT || process.env.MCP_PORT || 3100);
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, name: 'binance-sdk-mcp' }));
      return;
    }
    res.statusCode = 501;
    res.end(JSON.stringify({ error: 'Use stdio for MCP JSON-RPC. HTTP health endpoint is available at /health.' }));
  });
  server.listen(port, () => console.error(`binance-sdk MCP HTTP health server listening on ${port}`));
}

if (process.argv.includes('--http') || process.env.MCP_TRANSPORT === 'http') startHttp();
else startStdio().catch((error) => {
  console.error(error);
  process.exit(1);
});
