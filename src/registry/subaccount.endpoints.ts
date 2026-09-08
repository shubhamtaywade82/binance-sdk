import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Sub-account (SAPI). */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['subaccount.list', 'GET', '/sapi/v1/sub-account/list', 'signed', 'subaccount.list'],
  ['subaccount.status', 'GET', '/sapi/v1/sub-account/status', 'signed', 'subaccount.status'],
  ['subaccount.spotAssets', 'GET', '/sapi/v3/sub-account/assets', 'signed', 'subaccount.spotAssets'],
  ['subaccount.spotSummary', 'GET', '/sapi/v1/sub-account/spotSummary', 'signed', 'subaccount.spotSummary'],
  ['subaccount.futuresAccountSummary', 'GET', '/sapi/v2/sub-account/futures/accountSummary', 'signed', 'subaccount.futuresAccountSummary'],
  ['subaccount.marginAccount', 'GET', '/sapi/v1/sub-account/margin/account', 'signed', 'subaccount.marginAccount'],
  ['subaccount.universalTransfer', 'POST', '/sapi/v1/sub-account/universalTransfer', 'signed', 'subaccount.universalTransfer'],
  ['subaccount.universalTransferHistory', 'GET', '/sapi/v1/sub-account/universalTransfer', 'signed', 'subaccount.universalTransferHistory'],
  ['subaccount.createVirtual', 'POST', '/sapi/v1/sub-account/virtualSubAccount', 'signed', 'subaccount.createVirtualSubAccount'],
  ['subaccount.enableFutures', 'POST', '/sapi/v1/sub-account/futures/enable', 'signed', 'subaccount.enableFutures'],
  ['subaccount.enableMargin', 'POST', '/sapi/v1/sub-account/margin/enable', 'signed', 'subaccount.enableMargin'],
  ['subaccount.depositAddress', 'GET', '/sapi/v1/capital/deposit/subAddress', 'signed', 'subaccount.depositAddress'],
  ['subaccount.depositHistory', 'GET', '/sapi/v1/capital/deposit/subHisrec', 'signed', 'subaccount.depositHistory'],
];

export const SUBACCOUNT_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'subaccount',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
