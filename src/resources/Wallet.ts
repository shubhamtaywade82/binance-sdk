import { HttpClient } from '../client/HttpClient.js';
import {
  AccountSnapshot,
  AccountSnapshotSchema,
  ApiKeyPermissions,
  ApiKeyPermissionsSchema,
  AssetDetail,
  AssetDetailSchema,
  DepositAddress,
  DepositAddressSchema,
  DepositHistoryEntry,
  DepositHistoryResponseSchema,
  DustConversionResult,
  DustConversionResultSchema,
  DustLogResponse,
  DustLogResponseSchema,
  FundingAsset,
  FundingAssetsResponseSchema,
  TradeFeeEntry,
  TradeFeeResponseSchema,
  UniversalTransferHistoryResponse,
  UniversalTransferHistoryResponseSchema,
  UniversalTransferParams,
  UniversalTransferResult,
  UniversalTransferResultSchema,
  UserAsset,
  UserAssetsResponseSchema,
  WithdrawHistoryEntry,
  WithdrawHistoryResponseSchema,
  WithdrawParams,
  WithdrawResult,
  WithdrawResultSchema,
} from '../types/wallet.types.js';

export class Wallet {
  constructor(private readonly http: HttpClient) {}

  async universalTransfer(params: UniversalTransferParams): Promise<UniversalTransferResult> {
    return UniversalTransferResultSchema.parse(
      await this.http.post('/sapi/v1/asset/transfer', params, 'signed'),
    );
  }

  async universalTransferHistory(options: {
    type: string;
    startTime?: number;
    endTime?: number;
    current?: number;
    size?: number;
    fromSymbol?: string;
    toSymbol?: string;
  }): Promise<UniversalTransferHistoryResponse> {
    return UniversalTransferHistoryResponseSchema.parse(
      await this.http.get('/sapi/v1/asset/transfer', options, 'signed'),
    );
  }

  async fundingWallet(options?: { asset?: string; needBtcValuation?: boolean }): Promise<FundingAsset[]> {
    return FundingAssetsResponseSchema.parse(
      await this.http.post('/sapi/v1/asset/get-funding-asset', options, 'signed'),
    );
  }

  async userAsset(options?: { asset?: string; needBtcValuation?: boolean }): Promise<UserAsset[]> {
    return UserAssetsResponseSchema.parse(
      await this.http.post('/sapi/v3/asset/getUserAsset', options, 'signed'),
    );
  }

  async depositHistory(options?: {
    coin?: string;
    status?: number;
    startTime?: number;
    endTime?: number;
    offset?: number;
    limit?: number;
  }): Promise<DepositHistoryEntry[]> {
    return DepositHistoryResponseSchema.parse(
      await this.http.get('/sapi/v1/capital/deposit/hisrec', options, 'signed'),
    );
  }

  async withdrawHistory(options?: {
    coin?: string;
    withdrawOrderId?: string;
    status?: number;
    startTime?: number;
    endTime?: number;
    offset?: number;
    limit?: number;
  }): Promise<WithdrawHistoryEntry[]> {
    return WithdrawHistoryResponseSchema.parse(
      await this.http.get('/sapi/v1/capital/withdraw/history', options, 'signed'),
    );
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    return WithdrawResultSchema.parse(
      await this.http.post('/sapi/v1/capital/withdraw/apply', params, 'signed'),
    );
  }

  async depositAddress(coin: string, network?: string): Promise<DepositAddress> {
    return DepositAddressSchema.parse(
      await this.http.get('/sapi/v1/capital/deposit/address', { coin, network }, 'signed'),
    );
  }

  async accountSnapshot(
    type: 'SPOT' | 'MARGIN' | 'FUTURES',
    options?: { startTime?: number; endTime?: number; limit?: number },
  ): Promise<AccountSnapshot> {
    return AccountSnapshotSchema.parse(
      await this.http.get('/sapi/v1/accountSnapshot', { type, ...options }, 'signed'),
    );
  }

  async apiKeyPermissions(): Promise<ApiKeyPermissions> {
    return ApiKeyPermissionsSchema.parse(
      await this.http.get('/sapi/v1/account/apiRestrictions', undefined, 'signed'),
    );
  }

  async assetDetail(asset?: string): Promise<AssetDetail> {
    const params = asset ? { asset } : undefined;
    return AssetDetailSchema.parse(await this.http.get('/sapi/v1/asset/assetDetail', params, 'signed'));
  }

  async dustLog(options?: { accountType?: 'SPOT' | 'MARGIN'; startTime?: number; endTime?: number }): Promise<DustLogResponse> {
    return DustLogResponseSchema.parse(
      await this.http.get('/sapi/v1/asset/dribblet', options, 'signed'),
    );
  }

  async convertDustToBnb(assets: string[], accountType?: 'SPOT' | 'MARGIN'): Promise<DustConversionResult> {
    return DustConversionResultSchema.parse(
      await this.http.post('/sapi/v1/asset/dust', { asset: assets, accountType }, 'signed'),
    );
  }

  async tradeFee(symbol?: string): Promise<TradeFeeEntry[]> {
    const params = symbol ? { symbol } : undefined;
    return TradeFeeResponseSchema.parse(await this.http.get('/sapi/v1/asset/tradeFee', params, 'signed'));
  }
}
