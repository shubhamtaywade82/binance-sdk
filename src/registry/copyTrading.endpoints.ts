import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Copy Trading. */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['copyTrading.futuresLeadSymbol', 'GET', '/sapi/v1/copyTrading/futures/leadSymbol', 'signed', 'copyTrading.futuresLeadSymbol'],
  ['copyTrading.futuresUserStatus', 'GET', '/sapi/v1/copyTrading/futures/userStatus', 'signed', 'copyTrading.futuresUserStatus'],
];

export const COPY_TRADING_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'copyTrading',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
