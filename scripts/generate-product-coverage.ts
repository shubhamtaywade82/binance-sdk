/**
 * Generates `contracts/product-coverage.json` — a formal coverage matrix
 * of this SDK's product surface against Binance's full official product
 * catalog, not just the six products this SDK already knows about.
 *
 * Run: npm run coverage:generate
 *
 * Unlike every other `contracts/*.json` generator, the "official products"
 * list below is NOT derived from this repository — there is no API to
 * query it — so it is a hand-verified snapshot, not a live computation.
 * Source: the 26 connector packages listed under
 * https://github.com/binance/binance-connector-js/tree/master/clients,
 * cross-checked against that repository's README package table on
 * 2026-09-20. If Binance adds or renames a product family, this list
 * needs a manual refresh; everything else in the output (which of this
 * SDK's own registry products maps to which official package, and their
 * endpoint/tool counts) *is* derived mechanically from
 * `src/registry/endpoints.ts` and `contracts/tool-coverage.json`, same as
 * every other generator in this directory.
 *
 * Deliberately does NOT claim a "% of Binance's total API" per product:
 * this SDK has no ground truth for how many endpoints Binance's own
 * `spot`/`margin-trading`/etc. connectors implement, so computing that
 * percentage would be inventing a denominator. What's reported instead —
 * implemented yes/no, and this SDK's own endpoint/tool counts where
 * implemented — is exactly what's actually known and verifiable.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENDPOINT_REGISTRY, endpointCounts, type EndpointEntry } from '../src/registry/endpoints.js';

const ROOT = join(import.meta.dirname, '..');
const CONTRACTS_DIR = join(ROOT, 'contracts');

interface OfficialProduct {
  /** Directory/npm-suffix name under clients/, e.g. "derivatives-trading-usds-futures". */
  key: string;
  npmPackage: string;
  title: string;
  /** This SDK's own registry product key this maps to, or null if unimplemented. */
  sdkProduct: EndpointEntry['product'] | null;
  /** Set only when sdkProduct is non-null but the mapping is inexact — see the note. */
  partial?: boolean;
  note?: string;
}

/**
 * The 26 official Binance connector packages, source-verified as described
 * in the file header. Order matches the upstream README table.
 */
const OFFICIAL_PRODUCTS: OfficialProduct[] = [
  { key: 'algo', npmPackage: '@binance/algo', title: 'Algo Trading', sdkProduct: null,
    note: "This SDK's usdm.trading algo orders (/fapi/v1/algoOrder — conditional/VP) are a futures-scoped feature, not Binance's standalone spot/margin Algo (TWAP/VP) product these endpoints cover." },
  { key: 'alpha', npmPackage: '@binance/alpha', title: 'Alpha', sdkProduct: null },
  { key: 'c2c', npmPackage: '@binance/c2c', title: 'C2C', sdkProduct: null },
  { key: 'convert', npmPackage: '@binance/convert', title: 'Convert', sdkProduct: null,
    note: "This SDK's usdm.trading has futures-scoped Convert (quote/accept/status via /fapi/v1/convert), not the standalone Convert product these endpoints cover." },
  { key: 'copy-trading', npmPackage: '@binance/copy-trading', title: 'Copy Trading', sdkProduct: null },
  { key: 'crypto-loan', npmPackage: '@binance/crypto-loan', title: 'Crypto Loan', sdkProduct: null },
  { key: 'derivatives-trading-coin-futures', npmPackage: '@binance/derivatives-trading-coin-futures', title: 'COIN-M Futures', sdkProduct: 'coinm' },
  { key: 'derivatives-trading-options', npmPackage: '@binance/derivatives-trading-options', title: 'Options', sdkProduct: null },
  { key: 'derivatives-trading-portfolio-margin', npmPackage: '@binance/derivatives-trading-portfolio-margin', title: 'Portfolio Margin', sdkProduct: null },
  { key: 'derivatives-trading-portfolio-margin-pro', npmPackage: '@binance/derivatives-trading-portfolio-margin-pro', title: 'Portfolio Margin Pro', sdkProduct: null,
    note: "Distinct from account.pmAccountInfo (/fapi/v1/pmAccountInfo) in this SDK's usdm product, which is a single read-only PM balance/liability endpoint, not the standalone PM Pro product surface." },
  { key: 'derivatives-trading-usds-futures', npmPackage: '@binance/derivatives-trading-usds-futures', title: 'USDⓈ-M Futures', sdkProduct: 'usdm' },
  { key: 'dual-investment', npmPackage: '@binance/dual-investment', title: 'Dual Investment', sdkProduct: null },
  { key: 'fiat', npmPackage: '@binance/fiat', title: 'Fiat', sdkProduct: null },
  { key: 'gift-card', npmPackage: '@binance/giftcard', title: 'Gift Card', sdkProduct: null },
  { key: 'margin-trading', npmPackage: '@binance/margin-trading', title: 'Margin Trading', sdkProduct: 'margin' },
  { key: 'mining', npmPackage: '@binance/mining', title: 'Mining', sdkProduct: null },
  { key: 'pay', npmPackage: '@binance/pay', title: 'Pay', sdkProduct: null },
  { key: 'rebate', npmPackage: '@binance/rebate', title: 'Rebate', sdkProduct: null },
  { key: 'simple-earn', npmPackage: '@binance/simple-earn', title: 'Simple Earn', sdkProduct: null },
  { key: 'spot', npmPackage: '@binance/spot', title: 'Spot Trading', sdkProduct: 'spot' },
  { key: 'staking', npmPackage: '@binance/staking', title: 'Staking', sdkProduct: null },
  { key: 'stocks', npmPackage: '@binance/stocks', title: 'Stocks', sdkProduct: null },
  { key: 'sub-account', npmPackage: '@binance/sub-account', title: 'Sub Account', sdkProduct: 'subaccount' },
  { key: 'vip-loan', npmPackage: '@binance/vip-loan', title: 'VIP Loan', sdkProduct: null },
  { key: 'w3w-prediction', npmPackage: '@binance/w3w-prediction', title: 'W3W Prediction', sdkProduct: null },
  { key: 'wallet', npmPackage: '@binance/wallet', title: 'Wallet', sdkProduct: 'wallet' },
];

// ---------------------------------------------------------------------------

function loadToolCoverage(): { checkedProducts: string[]; totalCheckedEndpoints: number; coveredEndpoints: number; coveragePct: number } | null {
  try {
    return JSON.parse(readFileSync(join(CONTRACTS_DIR, 'tool-coverage.json'), 'utf8'));
  } catch {
    return null; // generate-schema-catalog / check-tool-coverage haven't run yet; fine, just omit
  }
}

const counts = endpointCounts();
const toolCoverage = loadToolCoverage();

const rows = OFFICIAL_PRODUCTS.map((product) => {
  const implemented = product.sdkProduct !== null;
  const endpointCount = implemented ? (counts[product.sdkProduct as string] ?? 0) : 0;
  const hasToolSurface = implemented && toolCoverage?.checkedProducts.includes(product.sdkProduct as string);
  return {
    officialProduct: product.key,
    npmPackage: product.npmPackage,
    title: product.title,
    implemented,
    sdkProduct: product.sdkProduct,
    endpointCount,
    hasToolSurface: hasToolSurface ?? false,
    note: product.note ?? null,
  };
});

const implementedCount = rows.filter((r) => r.implemented).length;
const registryProductKeys = new Set(ENDPOINT_REGISTRY.map((e) => e.product));
const mappedSdkProducts = new Set(rows.filter((r) => r.sdkProduct).map((r) => r.sdkProduct));
const sdkProductsWithNoOfficialMapping = [...registryProductKeys].filter((p) => !mappedSdkProducts.has(p));

const catalog = {
  catalogVersion: 1,
  generatedAt: new Date().toISOString(),
  description:
    "Coverage of this SDK's product surface against Binance's full official product catalog " +
    '(26 connector packages, hand-verified snapshot — see this script\'s header for the source ' +
    'and why it cannot be derived automatically). Deliberately does not claim a "% of Binance\'s ' +
    "total API\" per product -- there's no ground truth in this repo for that denominator; " +
    'endpointCount/hasToolSurface are this SDK\'s own verifiable numbers.',
  totalOfficialProducts: OFFICIAL_PRODUCTS.length,
  implementedProducts: implementedCount,
  implementedPct: Math.round((implementedCount / OFFICIAL_PRODUCTS.length) * 1000) / 10,
  toolCoverage: toolCoverage
    ? {
        checkedProducts: toolCoverage.checkedProducts,
        totalCheckedEndpoints: toolCoverage.totalCheckedEndpoints,
        coveredEndpoints: toolCoverage.coveredEndpoints,
        coveragePct: toolCoverage.coveragePct,
      }
    : null,
  products: rows,
};

if (sdkProductsWithNoOfficialMapping.length) {
  // A registry product this SDK implements that isn't mapped above would mean
  // the OFFICIAL_PRODUCTS table has drifted from src/registry -- fail loudly
  // rather than silently under-reporting coverage.
  console.error(
    `[product-coverage] registry product(s) with no OFFICIAL_PRODUCTS mapping: ` +
      `${sdkProductsWithNoOfficialMapping.join(', ')} -- update this script.`,
  );
  process.exitCode = 1;
}

mkdirSync(CONTRACTS_DIR, { recursive: true });
writeFileSync(join(CONTRACTS_DIR, 'product-coverage.json'), JSON.stringify(catalog, null, 2) + '\n');

console.log(
  `[product-coverage] ${implementedCount}/${OFFICIAL_PRODUCTS.length} (${catalog.implementedPct}%) of ` +
    `Binance's official product catalog implemented: ${rows.filter((r) => r.implemented).map((r) => r.officialProduct).join(', ')}.`,
);
