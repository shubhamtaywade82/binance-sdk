import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Dual Investment. */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['dci.accounts', 'GET', '/sapi/v1/dci/product/accounts', 'signed', 'dualInvestment.accounts'],
  ['dci.autoCompoundEditStatus', 'POST', '/sapi/v1/dci/product/auto_compound/edit-status', 'signed', 'dualInvestment.autoCompoundEditStatus'],
  ['dci.positions', 'GET', '/sapi/v1/dci/product/positions', 'signed', 'dualInvestment.positions'],
  ['dci.subscribe', 'POST', '/sapi/v1/dci/product/subscribe', 'signed', 'dualInvestment.subscribe'],
  ['dci.list', 'GET', '/sapi/v1/dci/product/list', 'signed', 'dualInvestment.list'],
];

export const DUAL_INVESTMENT_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'dualInvestment',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
