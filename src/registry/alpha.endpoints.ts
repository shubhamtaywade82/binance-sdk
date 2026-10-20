import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Alpha (BAPI). */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['alpha.aggTrades', 'GET', '/bapi/defi/v1/public/alpha-trade/agg-trades', 'public', 'alpha.aggTrades'],
  ['alpha.exchangeInfo', 'GET', '/bapi/defi/v1/public/alpha-trade/get-exchange-info', 'public', 'alpha.exchangeInfo'],
  ['alpha.klines', 'GET', '/bapi/defi/v1/public/alpha-trade/klines', 'public', 'alpha.klines'],
  ['alpha.ticker', 'GET', '/bapi/defi/v1/public/alpha-trade/ticker', 'public', 'alpha.ticker'],
  ['alpha.tokenList', 'GET', '/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list', 'public', 'alpha.tokenList'],
];

export const ALPHA_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'alpha',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
