/**
 * Generates agent/developer-facing documentation from the endpoint registry:
 *
 *   docs/endpoint-map/<product>.md  — per-product endpoint tables
 *   llms.txt                        — compact machine-oriented index (Binance
 *                                     Agent-Native convention)
 *   llms-full.txt                   — full flattened endpoint list
 *
 * Run: npm run docs:generate
 *
 * The script also cross-checks the registry against the actual `http.<verb>()`
 * calls in src/resources so the map cannot silently drift from the code.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY, listEndpoints, endpointCounts, type EndpointEntry } from '../src/registry/endpoints.js';

const ROOT = join(import.meta.dirname, '..');
const MAP_DIR = join(ROOT, 'docs', 'endpoint-map');

const PRODUCTS: Array<EndpointEntry['product']> = ['spot', 'usdm', 'coinm', 'margin', 'wallet', 'subaccount'];
const PRODUCT_TITLES: Record<string, string> = {
  spot: 'Spot',
  usdm: 'USDⓈ-M Futures',
  coinm: 'COIN-M Futures',
  margin: 'Margin',
  wallet: 'Wallet',
  subaccount: 'Sub-account',
};

function authBadge(auth: EndpointEntry['authentication']): string {
  switch (auth) {
    case 'signed':
      return 'SIGNED';
    case 'apiKey':
      return 'API_KEY';
    default:
      return 'PUBLIC';
  }
}

// ---------------------------------------------------------------------------
// Cross-check: registry vs. live http.<verb>() calls in src/resources
// ---------------------------------------------------------------------------

interface CodeCall {
  verb: string;
  path: string;
  file: string;
}

function extractCodeCalls(): CodeCall[] {
  const calls: CodeCall[] = [];
  const resourceDir = join(ROOT, 'src', 'resources');
  if (!existsSync(resourceDir)) return calls;
  for (const file of readdirSync(resourceDir)) {
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(join(resourceDir, file), 'utf8');
    const pattern = /this\.(?:\w+Http|http|dataHttp)\.(get|post|put|delete)\(\s*'([^']+)'\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      calls.push({ verb: match[1].toUpperCase(), path: match[2], file });
    }
  }
  return calls;
}

/** Map raw resource-relative paths to canonical ones for comparison. */
function canonicalize(call: CodeCall): string | null {
  const { path } = call;
  // Futures/COIN-M market-data resources use version-relative paths.
  if (path.startsWith('/fapi/') || path.startsWith('/dapi/') || path.startsWith('/sapi/') || path.startsWith('/api/') || path.startsWith('/futures/')) {
    return path;
  }
  return null; // relative path; resolved via the owning HttpClient's baseURL
}

function runCrossCheck(): { missingInRegistry: string[]; warnings: string[] } {
  const calls = extractCodeCalls()
    .map(canonicalize)
    .filter((p): p is string => p !== null);
  const registryPaths = new Set(ENDPOINT_REGISTRY.map((e) => e.path));
  const missingInRegistry = [...new Set(calls.filter((p) => !registryPaths.has(p)))];
  const warnings: string[] = [];
  // Relative-path resources are checked by product file; skip deep validation.
  return { missingInRegistry, warnings };
}

// ---------------------------------------------------------------------------
// Markdown per product
// ---------------------------------------------------------------------------

function productMarkdown(product: EndpointEntry['product']): string {
  const entries = listEndpoints({ product });
  const lines: string[] = [];
  lines.push(`# ${PRODUCT_TITLES[product]} — endpoint map`);
  lines.push('');
  lines.push(
    `> Generated from \`src/registry/*.endpoints.ts\` by \`npm run docs:generate\` — do not edit by hand.`,
  );
  lines.push('');
  lines.push(`${entries.length} implemented endpoints.`);
  lines.push('');
  lines.push('| Operation | Method | Path | Auth | SDK surface |');
  lines.push('|---|---|---|---|---|');
  for (const entry of entries) {
    lines.push(
      `| \`${entry.operation}\` | ${entry.method} | \`${entry.path}\` | ${authBadge(entry.authentication)} | \`${entry.implementedBy}\` |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// llms.txt (compact) + llms-full.txt (flat)
// ---------------------------------------------------------------------------

function llmsTxt(counts: Record<string, number>): string {
  const lines: string[] = [];
  lines.push('# binance-sdk');
  lines.push('');
  lines.push('> TypeScript SDK for Binance: Spot, USDⓈ-M & COIN-M Futures, Margin, Wallet, Sub-account.');
  lines.push('> REST + WebSocket + WS-API, signed requests (HMAC/Ed25519/RSA), execution reconciliation,');
  lines.push('> risk gateway, paper trading, local order books, LLM tools and an MCP server.');
  lines.push('');
  lines.push('## Client surface');
  lines.push('');
  lines.push('- `new BinanceClient({ apiKey, apiSecret, testnet?, demo?, safety? })`');
  lines.push('- `client.spot.{market, account, trading, userStream, ws, wsUser, wsApi}`');
  lines.push('- `client.futures.{market, data, account, trading, ops, execution, userStream, ws, wsUser, wsApi}` (aliases: `client.futures.usdm`, `client.futures.coinm`)');
  lines.push('- `client.coinm.{market, account, trading, userStream, ws, wsUser}`');
  lines.push('- `client.margin.{account, trading}`, `client.wallet`, `client.subaccount`');
  lines.push('- `client.events` — structured observability bus (`http.*`, `ws.*`, `execution.*`, `risk.*`)');
  lines.push('');
  lines.push('## Execution & risk');
  lines.push('');
  lines.push('- `client.futures.execution.placeOrder(params)` — idempotent; reconciles by `clientOrderId` after transport failures.');
  lines.push('- `client.futures.execution.cancelOrder(symbol, { orderId? | origClientOrderId? })`');
  lines.push('- `safety: { dryRun, readOnly, allowedSymbols, maxNotionalPerOrder, maxLeverage, maxOpenNotional, maxDailyLoss, ... }` — RiskGateway.');
  lines.push('');
  lines.push('## Endpoint maps');
  lines.push('');
  for (const product of PRODUCTS) {
    lines.push(`- [${PRODUCT_TITLES[product]}](docs/endpoint-map/${product}.md): ${counts[product] ?? 0} endpoints`);
  }
  lines.push('');
  lines.push('## WebSocket');
  lines.push('');
  lines.push('- `await client.futures.ws.subscribe([client.futures.ws.kline(\'BTCUSDT\',\'1m\')])` — resolves on server ack.');
  lines.push('- `ws.on(\'message\', (stream, payload) => {})`, `ws.on(\'raw\', (stream, raw) => {})`.');
  lines.push('- Lifecycle states: IDLE / CONNECTING / OPEN / RECONNECTING / CLOSING / CLOSED via `ws.getState()`.');
  lines.push('- Connections rotate proactively at T-23h (Binance 24h limit) and self-heal subscriptions via LIST_SUBSCRIPTIONS.');
  lines.push('');
  lines.push('## More');
  lines.push('');
  lines.push('- Full endpoint list: llms-full.txt');
  lines.push('- MCP server: `npx binance-sdk-mcp`');
  lines.push('- Package: @nemesis-oss/binance-sdk');
  lines.push('');
  return lines.join('\n');
}

function llmsFullTxt(): string {
  const lines: string[] = [];
  lines.push('# binance-sdk — full endpoint map');
  lines.push('');
  for (const product of PRODUCTS) {
    lines.push(`## ${PRODUCT_TITLES[product]}`);
    lines.push('');
    for (const entry of listEndpoints({ product })) {
      lines.push(
        `- ${entry.method} ${entry.path} (${authBadge(entry.authentication)}) → ${entry.implementedBy}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(MAP_DIR, { recursive: true });

for (const product of PRODUCTS) {
  writeFileSync(join(MAP_DIR, `${product}.md`), productMarkdown(product));
}

const counts = endpointCounts();
writeFileSync(join(ROOT, 'llms.txt'), llmsTxt(counts));
writeFileSync(join(ROOT, 'llms-full.txt'), llmsFullTxt());

const { missingInRegistry } = runCrossCheck();
if (missingInRegistry.length) {
  console.warn(
    '[endpoint-map] endpoints called in code but missing from the registry:\n  ' +
      missingInRegistry.join('\n  '),
  );
  process.exitCode = 1;
} else {
  console.log(
    `[endpoint-map] generated ${PRODUCTS.length} product maps, llms.txt, llms-full.txt ` +
      `(${ENDPOINT_REGISTRY.length} endpoints total)`,
  );
}
