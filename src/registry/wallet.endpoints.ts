import type { EndpointEntry, EndpointAuth, EndpointMethod } from './endpoints.js';

/** [operation, method, path, auth, implementedBy] rows for Wallet (SAPI). */
type Row = [operation: string, method: EndpointMethod, path: string, auth: EndpointAuth, implementedBy: string];

const rows: Row[] = [
  ['transfer.universalTransfer', 'POST', '/sapi/v1/asset/transfer', 'signed', 'wallet.universalTransfer'],
  ['transfer.universalTransferHistory', 'GET', '/sapi/v1/asset/transfer', 'signed', 'wallet.universalTransferHistory'],
  ['account.fundingWallet', 'POST', '/sapi/v1/asset/get-funding-asset', 'signed', 'wallet.fundingWallet'],
  ['account.userAsset', 'POST', '/sapi/v3/asset/getUserAsset', 'signed', 'wallet.userAsset'],
  ['deposit.history', 'GET', '/sapi/v1/capital/deposit/hisrec', 'signed', 'wallet.depositHistory'],
  ['withdraw.history', 'GET', '/sapi/v1/capital/withdraw/history', 'signed', 'wallet.withdrawHistory'],
  ['withdraw.apply', 'POST', '/sapi/v1/capital/withdraw/apply', 'signed', 'wallet.withdraw'],
  ['deposit.address', 'GET', '/sapi/v1/capital/deposit/address', 'signed', 'wallet.depositAddress'],
  ['account.snapshot', 'GET', '/sapi/v1/accountSnapshot', 'signed', 'wallet.accountSnapshot'],
  ['account.apiKeyPermissions', 'GET', '/sapi/v1/account/apiRestrictions', 'signed', 'wallet.apiKeyPermissions'],
  ['account.assetDetail', 'GET', '/sapi/v1/asset/assetDetail', 'signed', 'wallet.assetDetail'],
  ['account.dustLog', 'GET', '/sapi/v1/asset/dribblet', 'signed', 'wallet.dustLog'],
  ['account.convertDustToBnb', 'POST', '/sapi/v1/asset/dust', 'signed', 'wallet.convertDustToBnb'],
  ['account.tradeFee', 'GET', '/sapi/v1/asset/tradeFee', 'signed', 'wallet.tradeFee'],
];

export const WALLET_ENDPOINTS: EndpointEntry[] = rows.map(
  ([operation, method, path, authentication, implementedBy]) => ({
    product: 'wallet',
    operation,
    method,
    path,
    authentication,
    implementedBy,
  }),
);
