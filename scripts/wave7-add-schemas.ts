/**
 * Wave 7 generator — adds Zod response schemas to the Wave 5 + Wave 6
 * generated resources.
 *
 * Strategy: emit `.loose()` Zod schemas with the common Binance response
 * fields (symbol, asset, amount, price, qty, time, status, code, msg, etc.).
 * The schemas are permissive — they accept any extra fields Binance adds —
 * but they give callers a typed return value (e.g. `{ symbol: string;
 * amount: number }` instead of `unknown`).
 *
 * Each method's response shape is inferred from its name + path:
 *   - "history" / "list" / "records" suffix → array of objects
 *   - "create" / "place" / "cancel" / "modify" → single ack object
 *   - "account" / "balance" / "status" → single account object
 *   - "ping" / "time" / "connectivity" → empty object
 *
 * Run via: `npm run contracts:wave7-add-schemas`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES_DIR = join(ROOT, 'src', 'types');

interface ResourceMethod {
  name: string;
  returnType: string; // current return type (e.g. "Promise<unknown>")
}

function extractMethods(filePath: string): ResourceMethod[] {
  const content = readFileSync(filePath, 'utf8');
  const methods: ResourceMethod[] = [];
  const methodRe = /async\s+(\w+)\s*\([^)]*\)\s*:\s*Promise<([^>]+)>/g;
  let m;
  while ((m = methodRe.exec(content)) !== null) {
    methods.push({ name: m[1], returnType: m[2].trim() });
  }
  return methods;
}

/** Common Binance response field set. All fields optional — Binance varies. */
const COMMON_FIELDS = `
  asset: z.string().optional(),
  symbol: z.string().optional(),
  pair: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  qty: z.union([z.string(), z.number()]).optional(),
  price: z.union([z.string(), z.number()]).optional(),
  orderId: z.union([z.string(), z.number()]).optional(),
  orderListId: z.union([z.string(), z.number()]).optional(),
  clientOrderId: z.string().optional(),
  tranId: z.union([z.string(), z.number()]).optional(),
  txId: z.union([z.string(), z.number()]).optional(),
  time: z.number().optional(),
  timestamp: z.number().optional(),
  updateTime: z.number().optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  side: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  msg: z.string().optional(),
  message: z.string().optional(),
  email: z.string().optional(),
  subAccountId: z.union([z.string(), z.number()]).optional(),
  poolId: z.union([z.string(), z.number()]).optional(),
  positionId: z.union([z.string(), z.number()]).optional(),
  workerName: z.string().optional(),
  workerId: z.union([z.string(), z.number()]).optional(),
  network: z.string().optional(),
  address: z.string().optional(),
  addressTag: z.string().optional(),
  coin: z.string().optional(),
  fromAsset: z.string().optional(),
  toAsset: z.string().optional(),
  fromAmount: z.union([z.string(), z.number()]).optional(),
  toAmount: z.union([z.string(), z.number()]).optional(),
  quoteId: z.string().optional(),
  algoId: z.union([z.string(), z.number()]).optional(),
  leverage: z.union([z.string(), z.number()]).optional(),
  marginType: z.string().optional(),
  positionSide: z.string().optional(),
  positionAmt: z.union([z.string(), z.number()]).optional(),
  entryPrice: z.union([z.string(), z.number()]).optional(),
  markPrice: z.union([z.string(), z.number()]).optional(),
  unRealizedProfit: z.union([z.string(), z.number()]).optional(),
  liquidationPrice: z.union([z.string(), z.number()]).optional(),
  notionalValue: z.union([z.string(), z.number()]).optional(),
  collateralCoin: z.string().optional(),
  loanCoin: z.string().optional(),
  loanAmount: z.union([z.string(), z.number()]).optional(),
  collateralAmount: z.union([z.string(), z.number()]).optional(),
  interestRate: z.union([z.string(), z.number()]).optional(),
  interest: z.union([z.string(), z.number()]).optional(),
  ltv: z.union([z.string(), z.number()]).optional(),
  borrowTime: z.number().optional(),
  repayTime: z.number().optional(),
  total: z.union([z.string(), z.number()]).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  page: z.number().optional(),
  current: z.number().optional(),
  size: z.number().optional(),
  serverTime: z.number().optional(),
  timezone: z.string().optional(),
  rateLimitType: z.string().optional(),
  interval: z.string().optional(),
  intervalNum: z.number().optional(),
  filterType: z.string().optional(),
  minQty: z.union([z.string(), z.number()]).optional(),
  maxQty: z.union([z.string(), z.number()]).optional(),
  stepSize: z.union([z.string(), z.number()]).optional(),
  minPrice: z.union([z.string(), z.number()]).optional(),
  maxPrice: z.union([z.string(), z.number()]).optional(),
  tickSize: z.union([z.string(), z.number()]).optional(),
  baseAsset: z.string().optional(),
  quoteAsset: z.string().optional(),
  baseAssetPrecision: z.number().optional(),
  quoteAssetPrecision: z.number().optional(),
  pricePrecision: z.number().optional(),
  quantityPrecision: z.number().optional(),
  statusChangeDate: z.number().optional(),
  permissions: z.array(z.string()).optional(),
  underlying: z.string().optional(),
  strikePrice: z.union([z.string(), z.number()]).optional(),
  expiryDate: z.number().optional(),
  exerciseStyle: z.string().optional(),
  contractType: z.string().optional(),
  contractSize: z.number().optional(),
  bidPrice: z.union([z.string(), z.number()]).optional(),
  askPrice: z.union([z.string(), z.number()]).optional(),
  bidQty: z.union([z.string(), z.number()]).optional(),
  askQty: z.union([z.string(), z.number()]).optional(),
  lastPrice: z.union([z.string(), z.number()]).optional(),
  open: z.union([z.string(), z.number()]).optional(),
  high: z.union([z.string(), z.number()]).optional(),
  low: z.union([z.string(), z.number()]).optional(),
  volume: z.union([z.string(), z.number()]).optional(),
  quoteVolume: z.union([z.string(), z.number()]).optional(),
  openTime: z.number().optional(),
  closeTime: z.number().optional(),
  firstId: z.number().optional(),
  lastId: z.number().optional(),
  count: z.number().optional(),
  marginBalance: z.union([z.string(), z.number()]).optional(),
  availableBalance: z.union([z.string(), z.number()]).optional(),
  walletBalance: z.union([z.string(), z.number()]).optional(),
  crossWalletBalance: z.union([z.string(), z.number()]).optional(),
  marginLevel: z.union([z.string(), z.number()]).optional(),
  marginRatio: z.union([z.string(), z.number()]).optional(),
  totalNetAssetOfBtc: z.union([z.string(), z.number()]).optional(),
  totalAssetOfBtc: z.union([z.string(), z.number()]).optional(),
  totalLiabilityOfBtc: z.union([z.string(), z.number()]).optional(),
  actualLiability: z.union([z.string(), z.number()]).optional(),
  feeTier: z.number().optional(),
  canTrade: z.boolean().optional(),
  canDeposit: z.boolean().optional(),
  canWithdraw: z.boolean().optional(),
  borrowEnabled: z.boolean().optional(),
  transferEnabled: z.boolean().optional(),
  dualSidePosition: z.boolean().optional(),
  isBuyerMaker: z.boolean().optional(),
  isIsolated: z.boolean().optional(),
  reduceOnly: z.boolean().optional(),
  closePosition: z.boolean().optional(),
  postOnly: z.boolean().optional(),
  priceProtect: z.boolean().optional(),
  isAutoAddMargin: z.boolean().optional(),
  unifiedMarginAccount: z.boolean().optional(),
  assets: z.array(z.record(z.string(), z.unknown())).optional(),
  positions: z.array(z.record(z.string(), z.unknown())).optional(),
  userAssets: z.array(z.record(z.string(), z.unknown())).optional(),
  filters: z.array(z.record(z.string(), z.unknown())).optional(),
  optionSymbols: z.array(z.record(z.string(), z.unknown())).optional(),
  rateLimits: z.array(z.record(z.string(), z.unknown())).optional(),
  data: z.array(z.record(z.string(), z.unknown())).optional(),
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
  records: z.array(z.record(z.string(), z.unknown())).optional(),
  orders: z.array(z.record(z.string(), z.unknown())).optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
`;

function schemaForMethod(methodName: string, path: string, httpMethod: string): { schemaName: string; kind: 'object' | 'array' | 'unknown' } {
  const lower = methodName.toLowerCase();
  // Empty / ping responses
  if (/ping|testconnectivity|connectivity|serverstatus/.test(lower)) {
    return { schemaName: '', kind: 'unknown' };
  }
  // Server time
  if (/servertime|time$/.test(lower) && !/history|list/.test(lower)) {
    return { schemaName: '', kind: 'unknown' };
  }
  // History / list / records → array
  if (/history|list$|lists$|records|allorders|allopenorders|allorderlist|openorders|openorderlist|positions|trades|transfers|translog|snapshot|assets$|pairs$|tiers$|brackets|constituents|indexprice|markprice|tickers?$|klines|depth|fundingrate|fundinginfo|interestrate|rebate|dividend|leveragebracket|leverageBracket|collateralrate|collateralRate|marginassetleverage|assetindexprice|assetindex|interesthistory|loanrecord|repayrecord|liquidation|orderlist$|orderlists$|suborders|historicalorders|exercise|blocktrades|tradeflow|addresslist|addresslist|ips|iprestriction|iplist|moveposition|transactionstatistics|capitalflow|capitalconfig|delistschedule|schedule|opensymbollist|symbollist|exchangeinfo|exchangeinfo|listOpen|queryOpen|allOrderList/.test(lower)) {
    return { schemaName: `${methodName}Response`, kind: 'array' };
  }
  // Cancel / close / disable / delete → ack
  if (/cancel|close|disable|delete|reset|revoke|stop|killswitch|heartbeat/.test(lower) && httpMethod !== 'GET') {
    return { schemaName: `${methodName}Response`, kind: 'object' };
  }
  // Account / balance / status → object
  if (/account$|balance$|status$|info$|config$|summary$|position$|positionrisk|risk$|commission$|rate$|fee$|borrowable|withdrawable|limit$|quota$|tier$|bracket$|detail$|record$/.test(lower)) {
    return { schemaName: `${methodName}Response`, kind: 'object' };
  }
  // Default → object (single ack or detail)
  return { schemaName: `${methodName}Response`, kind: 'object' };
}

function emitSchemaFile(product: string, methods: Array<{ name: string; schemaName: string; kind: 'object' | 'array' | 'unknown' }>): string {
  const schemas = methods
    .filter((m) => m.kind !== 'unknown')
    .map((m) => {
      if (m.kind === 'array') {
        return `export const ${m.schemaName}Schema = z.array(z.object({${COMMON_FIELDS}}).loose());
export type ${m.schemaName} = z.infer<typeof ${m.schemaName}Schema>;`;
      }
      return `export const ${m.schemaName}Schema = z.object({${COMMON_FIELDS}}).loose();
export type ${m.schemaName} = z.infer<typeof ${m.schemaName}Schema>;`;
    });

  return `import { z } from 'zod';

/**
 * Wave 7 — Zod response schemas for the ${product} product.
 *
 * GENERATED by scripts/wave7-add-schemas.ts. Each schema is a permissive
 * .loose() object carrying the common Binance response fields (asset,
 * symbol, amount, price, qty, time, status, etc.). Schemas for endpoints
 * with no payload (ping/connectivity) are intentionally omitted — they
 * stay as Promise<unknown> until a stricter schema is hand-curated.
 *
 * To upgrade any individual endpoint to a stricter schema, replace the
 * generated schema with a hand-curated one in this file and re-run the
 * resource generator.
 */

${schemas.join('\n\n')}
`;
}

function patchResourceFile(resourcePath: string, methods: Array<{ name: string; schemaName: string; kind: 'object' | 'array' | 'unknown' }>, product: string, typesImport: string): string {
  const content = readFileSync(resourcePath, 'utf8');
  // Add the import line after the existing HttpClient import (only if not already present).
  let updated = content;
  const importLine = `import * as ${typesImport} from '../types/${product}.wave7.types.js';`;
  if (!content.includes(importLine)) {
    updated = content.replace(
      /^(import \{ HttpClient \} from '\.\.\/client\/HttpClient\.js';)/m,
      `$1\n${importLine}`,
    );
  }
  // Patch each method's return type and wrap with .parse().
  for (const m of methods) {
    if (m.kind === 'unknown') continue;
    const parsedType = `${typesImport}.${m.schemaName}`;
    const schemaRef = `${typesImport}.${m.schemaName}Schema`;
    // Skip methods that have already been patched.
    if (updated.includes(`Promise<${parsedType}>`)) continue;
    // Pattern matches `async name(params): Promise<unknown> { return this.http.<verb>(...); }`
    const methodRe = new RegExp(
      `(async ${m.name}\\([^)]*\\)\\s*:\\s*Promise<)unknown(>\\s*\\{\\s*return )(this\\.http\\.[a-z]+\\([^)]*\\))(\\s*;\\s*\\})`,
      'g',
    );
    updated = updated.replace(
      methodRe,
      (_, pre, mid, call, post) => `${pre}${parsedType}${mid}${call}.then(d => ${schemaRef}.parse(d))${post}`,
    );
  }
  return updated;
}

const RESOURCE_FILES: Array<{ path: string; className: string; product: string; typesImport: string }> = [
  { path: 'src/resources/FiatResource.ts', className: 'FiatResource', product: 'fiat', typesImport: 'fiatTypes' },
  { path: 'src/resources/GiftCardResource.ts', className: 'GiftCardResource', product: 'giftCard', typesImport: 'giftCardTypes' },
  { path: 'src/resources/MiningResource.ts', className: 'MiningResource', product: 'mining', typesImport: 'miningTypes' },
  { path: 'src/resources/NftResource.ts', className: 'NftResource', product: 'nft', typesImport: 'nftTypes' },
  { path: 'src/resources/PayResource.ts', className: 'PayResource', product: 'pay', typesImport: 'payTypes' },
  { path: 'src/resources/RebateResource.ts', className: 'RebateResource', product: 'rebate', typesImport: 'rebateTypes' },
  { path: 'src/resources/SimpleEarnResource.ts', className: 'SimpleEarnResource', product: 'simpleEarn', typesImport: 'simpleEarnTypes' },
  { path: 'src/resources/StakingResource.ts', className: 'StakingResource', product: 'staking', typesImport: 'stakingTypes' },
  { path: 'src/resources/VipLoanResource.ts', className: 'VipLoanResource', product: 'vipLoan', typesImport: 'vipLoanTypes' },
  { path: 'src/resources/SpotWave6.ts', className: 'SpotWave6', product: 'spotWave6', typesImport: 'spotWave6Types' },
  { path: 'src/resources/OptionsWave6.ts', className: 'OptionsWave6', product: 'optionsWave6', typesImport: 'optionsWave6Types' },
  { path: 'src/resources/PortfolioMarginWave6.ts', className: 'PortfolioMarginWave6', product: 'portfolioWave6', typesImport: 'portfolioWave6Types' },
  { path: 'src/resources/PortfolioMarginProWave6.ts', className: 'PortfolioMarginProWave6', product: 'portfolioProWave6', typesImport: 'portfolioProWave6Types' },
  { path: 'src/resources/MarginWave6.ts', className: 'MarginWave6', product: 'marginWave6', typesImport: 'marginWave6Types' },
  { path: 'src/resources/WalletWave6.ts', className: 'WalletWave6', product: 'walletWave6', typesImport: 'walletWave6Types' },
  { path: 'src/resources/SubAccountWave6.ts', className: 'SubAccountWave6', product: 'subaccountWave6', typesImport: 'subaccountWave6Types' },
];

function main(): void {
  let totalSchemas = 0;
  let totalMethodsPatched = 0;
  for (const rf of RESOURCE_FILES) {
    const fullPath = join(ROOT, rf.path);
    const methods = extractMethods(fullPath);
    if (methods.length === 0) {
      console.warn(`  ⚠ no methods found in ${rf.path}`);
      continue;
    }
    // Need to fetch the path + httpMethod for each method to determine shape.
    // Parse them from the method body.
    const content = readFileSync(fullPath, 'utf8');
    const methodWithCallRe = /async\s+(\w+)\s*\([^)]*\)\s*:\s*Promise<[^>]+>\s*\{\s*return\s+this\.http\.(get|post|put|delete)\(([^,)]+)/g;
    const methodMeta = new Map<string, { httpMethod: string; path: string }>();
    let m;
    while ((m = methodWithCallRe.exec(content)) !== null) {
      methodMeta.set(m[1], { httpMethod: m[2].toUpperCase(), path: m[3].trim().replace(/['"`]/g, '') });
    }
    const methodSchemas = methods.map((meth) => {
      const meta = methodMeta.get(meth.name) ?? { httpMethod: 'GET', path: '' };
      return { name: meth.name, ...schemaForMethod(meth.name, meta.path, meta.httpMethod) };
    });

    // Emit the types file.
    const typesPath = join(TYPES_DIR, `${rf.product}.wave7.types.ts`);
    writeFileSync(typesPath, emitSchemaFile(rf.product, methodSchemas));
    console.log(`  ✓ ${basename(typesPath)} (${methodSchemas.filter((s) => s.kind !== 'unknown').length} schemas)`);

    // Patch the resource file.
    const updated = patchResourceFile(fullPath, methodSchemas, rf.product, rf.typesImport);
    writeFileSync(fullPath, updated);
    totalSchemas += methodSchemas.filter((s) => s.kind !== 'unknown').length;
    totalMethodsPatched += methodSchemas.filter((s) => s.kind !== 'unknown').length;
    console.log(`  ✓ ${basename(fullPath)} patched (${methodSchemas.filter((s) => s.kind !== 'unknown').length} methods typed)`);
  }
  console.log(`\n[wave7] Total: ${totalSchemas} schemas emitted, ${totalMethodsPatched} methods patched.`);
}

main();
