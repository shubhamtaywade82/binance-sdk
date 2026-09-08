/**
 * API contract layer — the machine-readable view of the Binance REST surface
 * this SDK implements.
 *
 * The registry (src/registry) already lists every endpoint (operation, method,
 * path, authentication, implementer). This layer is the *contract* consumers
 * build on top of that list:
 *
 *  - normalized **security schemes** (`none` / `apiKey` / `signature`) instead
 *    of ad-hoc auth strings;
 *  - **declared request weights** for the endpoints where Binance documents a
 *    param-independent weight — informational only, response headers
 *    (`X-MBX-USED-WEIGHT-*`) remain the source of truth for accounting;
 *  - **path canonicalization** so a bare resource path (`/order`) resolves to
 *    the registry's canonical form (`/api/v3/order`) using the HttpClient's
 *    base URL — this is what lets the observability bus attach contract
 *    metadata to every `http.request.*` event;
 *  - a single query API (`getContract`, `findContract`, `listContracts`) for
 *    tooling, docs generation and agent-facing surfaces.
 *
 * This is the stepping stone toward a fully generated contract layer (OpenAPI
 * spec → typed clients); the query surface below is deliberately shaped so a
 * generated implementation can replace the hand-curated backing store without
 * changing any consumer.
 */

import {
  ENDPOINT_REGISTRY,
  endpointCounts,
  findEndpoint,
  listEndpoints,
  type EndpointAuth,
  type EndpointEntry,
  type EndpointMethod,
  type EndpointQuery,
} from '../registry/endpoints.js';

export type { EndpointAuth, EndpointEntry, EndpointMethod, EndpointQuery };
export { ENDPOINT_REGISTRY, endpointCounts, listEndpoints };

/** Normalized security scheme an endpoint requires. */
export type EndpointSecurityScheme = 'none' | 'apiKey' | 'signature';

/**
 * A single endpoint's contract: registry entry + normalized security scheme +
 * declared weight (where Binance documents a param-independent one).
 */
export interface EndpointContract extends EndpointEntry {
  security: EndpointSecurityScheme;
  /** Documented request weight where param-independent; see file docs. */
  declaredWeight?: number;
}

function securityOf(auth: EndpointAuth): EndpointSecurityScheme {
  switch (auth) {
    case 'public':
      return 'none';
    case 'apiKey':
      return 'apiKey';
    case 'signed':
      return 'signature';
  }
}

/**
 * Statically documented, param-independent request weights. Weight rules that
 * depend on request parameters (e.g. `depth` limit, `klines` limit) are
 * deliberately omitted — the `X-MBX-USED-WEIGHT-*` response headers tracked by
 * the RateLimitTracker are the accounting source of truth; these values exist
 * so tooling and agents can reason about request cost before sending.
 */
const ENDPOINT_WEIGHTS: Readonly<Record<string, number>> = {
  // Spot (api/v3)
  'GET /api/v3/ping': 1,
  'GET /api/v3/time': 1,
  'GET /api/v3/exchangeInfo': 20,
  'GET /api/v3/avgPrice': 2,
  'GET /api/v3/ticker/price': 4,
  'GET /api/v3/ticker/bookTicker': 4,
  'GET /api/v3/order': 2,
  'DELETE /api/v3/order': 2,
  'GET /api/v3/openOrders': 6,
  'DELETE /api/v3/openOrders': 6,
  'GET /api/v3/myTrades': 10,
  'GET /api/v3/account': 20,

  // USDⓈ-M futures (fapi/v1)
  'GET /fapi/v1/ping': 1,
  'GET /fapi/v1/time': 1,
  'GET /fapi/v1/exchangeInfo': 1,
  'GET /fapi/v1/order': 1,
  'DELETE /fapi/v1/order': 1,
  'GET /fapi/v1/openOrders': 1,
  'DELETE /fapi/v1/openOrders': 1,
  'GET /fapi/v1/allOrders': 5,
  'GET /fapi/v1/balance': 5,
  'GET /fapi/v1/positionRisk': 5,
  'GET /fapi/v1/income': 10,
  'GET /fapi/v1/trade': 5,

  // COIN-M futures (dapi/v1)
  'GET /dapi/v1/ping': 1,
  'GET /dapi/v1/time': 1,
  'GET /dapi/v1/exchangeInfo': 1,
  'GET /dapi/v1/order': 1,
  'DELETE /dapi/v1/order': 1,
  'GET /dapi/v1/balance': 5,
  'GET /dapi/v1/positionRisk': 5,

  // Broker-style user-data-stream endpoints (apiKey auth)
  'POST /fapi/v1/listenKey': 1,
  'PUT /fapi/v1/listenKey': 1,
  'DELETE /fapi/v1/listenKey': 1,
  'POST /api/v3/userDataStream': 1,
  'PUT /api/v3/userDataStream': 1,
  'DELETE /api/v3/userDataStream': 1,
  'POST /dapi/v1/listenKey': 1,
  'PUT /dapi/v1/listenKey': 1,
  'DELETE /dapi/v1/listenKey': 1,
};

/** Version prefixes that make a path canonical by itself. */
const CANONICAL_PREFIXES = [
  '/api/v3',
  '/fapi/v1',
  '/dapi/v1',
  '/sapi/v1',
  '/sapi/v2',
  '/sapi/v3',
  '/futures/data',
];

function weightOf(method: string, canonicalPath: string): number | undefined {
  return ENDPOINT_WEIGHTS[`${method} ${canonicalPath}`];
}

let byPathMethod: Map<string, EndpointContract> | null = null;

function registryIndex(): Map<string, EndpointContract> {
  if (byPathMethod) return byPathMethod;
  byPathMethod = new Map();
  for (const entry of ENDPOINT_REGISTRY) {
    const contract: EndpointContract = {
      ...entry,
      security: securityOf(entry.authentication),
      declaredWeight: weightOf(entry.method, entry.path),
    };
    byPathMethod.set(`${entry.method} ${entry.path}`, contract);
  }
  return byPathMethod;
}

/**
 * Resolve a resource-supplied path against an HttpClient base URL to the
 * registry's canonical path. Bare paths (`/order`) are prefixed with the base
 * URL's own path segment (`https://…/api/v3` → `/api/v3/order`); paths that
 * already carry a version prefix pass through unchanged.
 */
export function canonicalPath(baseURL: string, path: string): string {
  if (CANONICAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return path;
  }
  if (!baseURL) return path;
  let basePath: string;
  try {
    basePath = new URL(baseURL).pathname;
  } catch {
    return path;
  }
  if (!basePath || basePath === '/') return path;
  return `${basePath.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

/** Contract for a canonical path + method, or undefined when unknown. */
export function findContract(
  canonical: string,
  method?: EndpointMethod,
): EndpointContract | undefined {
  const index = registryIndex();
  if (method !== undefined) {
    return index.get(`${method} ${canonical}`);
  }
  // Path-only lookup: scan for any verb at that path.
  for (const [key, contract] of index) {
    if (key.endsWith(` ${canonical}`)) return contract;
  }
  return undefined;
}

/** Contract lookup by product + operation, e.g. ('spot', 'trading.createOrder'). */
export function getContract(
  product: EndpointEntry['product'],
  operation: string,
): EndpointContract | undefined {
  const entry = ENDPOINT_REGISTRY.find(
    (candidate) => candidate.product === product && candidate.operation === operation,
  );
  if (!entry) return undefined;
  return {
    ...entry,
    security: securityOf(entry.authentication),
    declaredWeight: weightOf(entry.method, entry.path),
  };
}

/** Contract metadata attached to `http.request.*` observability events. */
export interface HttpContractMeta {
  product: EndpointEntry['product'];
  operation: string;
  authentication: EndpointAuth;
  security: EndpointSecurityScheme;
  declaredWeight: number | undefined;
}

/**
 * Resolve the contract for a request as the HttpClient sees it: base URL +
 * method + resource path. Returns undefined for unregistered paths (e.g.
 * host-level time endpoints reused across products).
 */
export function contractFor(
  baseURL: string,
  method: string,
  path: string,
): HttpContractMeta | undefined {
  const canonical = canonicalPath(baseURL, path);
  const contract = findContract(canonical, method as EndpointMethod);
  if (!contract) return undefined;
  return {
    product: contract.product,
    operation: contract.operation,
    authentication: contract.authentication,
    security: contract.security,
    declaredWeight: contract.declaredWeight,
  };
}

/** One-line human description, for logs and agent-facing docs. */
export function describeContract(contract: EndpointContract): string {
  const weight =
    contract.declaredWeight !== undefined ? `, weight ${contract.declaredWeight}` : '';
  return (
    `${contract.method} ${contract.path} [${contract.product}.${contract.operation}] ` +
    `auth=${contract.authentication}${weight} — implemented by ${contract.implementedBy}`
  );
}

// Re-exported for consumers that only import from the contracts layer.
export { findEndpoint };
