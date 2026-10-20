import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for C2C. */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['c2c.orderMatchListUserOrderHistory', 'GET', '/sapi/v1/c2c/orderMatch/listUserOrderHistory', 'signed', 'c2c.orderMatchListUserOrderHistory'],
];

export const C2C_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'c2c',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
