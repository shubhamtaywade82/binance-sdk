import { HttpClient } from '../client/HttpClient.js';
import {
  SubAccountEntry,
  SubAccountDepositAddress,
  SubAccountDepositAddressSchema,
  SubAccountDepositHistoryEntry,
  SubAccountDepositHistoryResponseSchema,
  SubAccountEnableResult,
  SubAccountEnableResultSchema,
  SubAccountFuturesSummary,
  SubAccountFuturesSummarySchema,
  SubAccountListResponseSchema,
  SubAccountMarginAccount,
  SubAccountMarginAccountSchema,
  SubAccountSpotAssetsResponse,
  SubAccountSpotAssetsResponseSchema,
  SubAccountSpotSummary,
  SubAccountSpotSummarySchema,
  SubAccountStatus,
  SubAccountStatusResponseSchema,
  SubAccountUniversalTransferHistoryResponse,
  SubAccountUniversalTransferHistoryResponseSchema,
  SubAccountUniversalTransferParams,
  SubAccountUniversalTransferResult,
  SubAccountUniversalTransferResultSchema,
  VirtualSubAccountResult,
  VirtualSubAccountResultSchema,
} from '../types/subaccount.types.js';

export class SubAccount {
  constructor(private readonly http: HttpClient) {}

  async list(options?: { email?: string; isFreeze?: boolean; page?: number; limit?: number }): Promise<SubAccountEntry[]> {
    const res = await this.http.get('/sapi/v1/sub-account/list', options, 'signed');
    return SubAccountListResponseSchema.parse(res).subAccounts;
  }

  async status(email?: string): Promise<SubAccountStatus[]> {
    const params = email ? { email } : undefined;
    return SubAccountStatusResponseSchema.parse(
      await this.http.get('/sapi/v1/sub-account/status', params, 'signed'),
    );
  }

  async spotAssets(email: string): Promise<SubAccountSpotAssetsResponse> {
    return SubAccountSpotAssetsResponseSchema.parse(
      await this.http.get('/sapi/v3/sub-account/assets', { email }, 'signed'),
    );
  }

  async spotSummary(options?: { email?: string; page?: number; size?: number }): Promise<SubAccountSpotSummary> {
    return SubAccountSpotSummarySchema.parse(
      await this.http.get('/sapi/v1/sub-account/spotSummary', options, 'signed'),
    );
  }

  async futuresAccountSummary(futuresType: 1 | 2): Promise<SubAccountFuturesSummary> {
    return SubAccountFuturesSummarySchema.parse(
      await this.http.get('/sapi/v2/sub-account/futures/accountSummary', { futuresType }, 'signed'),
    );
  }

  async marginAccount(email: string): Promise<SubAccountMarginAccount> {
    return SubAccountMarginAccountSchema.parse(
      await this.http.get('/sapi/v1/sub-account/margin/account', { email }, 'signed'),
    );
  }

  async universalTransfer(params: SubAccountUniversalTransferParams): Promise<SubAccountUniversalTransferResult> {
    return SubAccountUniversalTransferResultSchema.parse(
      await this.http.post('/sapi/v1/sub-account/universalTransfer', params, 'signed'),
    );
  }

  async universalTransferHistory(options?: {
    fromEmail?: string;
    toEmail?: string;
    clientTranId?: string;
    startTime?: number;
    endTime?: number;
    page?: number;
    limit?: number;
  }): Promise<SubAccountUniversalTransferHistoryResponse> {
    return SubAccountUniversalTransferHistoryResponseSchema.parse(
      await this.http.get('/sapi/v1/sub-account/universalTransfer', options, 'signed'),
    );
  }

  async createVirtualSubAccount(subAccountString: string): Promise<VirtualSubAccountResult> {
    return VirtualSubAccountResultSchema.parse(
      await this.http.post('/sapi/v1/sub-account/virtualSubAccount', { subAccountString }, 'signed'),
    );
  }

  async enableFutures(email: string): Promise<SubAccountEnableResult> {
    return SubAccountEnableResultSchema.parse(
      await this.http.post('/sapi/v1/sub-account/futures/enable', { email }, 'signed'),
    );
  }

  async enableMargin(email: string): Promise<SubAccountEnableResult> {
    return SubAccountEnableResultSchema.parse(
      await this.http.post('/sapi/v1/sub-account/margin/enable', { email }, 'signed'),
    );
  }

  async depositAddress(email: string, coin: string, network?: string): Promise<SubAccountDepositAddress> {
    return SubAccountDepositAddressSchema.parse(
      await this.http.get('/sapi/v1/capital/deposit/subAddress', { email, coin, network }, 'signed'),
    );
  }

  async depositHistory(options: {
    email: string;
    coin?: string;
    status?: number;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<SubAccountDepositHistoryEntry[]> {
    return SubAccountDepositHistoryResponseSchema.parse(
      await this.http.get('/sapi/v1/capital/deposit/subHisrec', options, 'signed'),
    );
  }
}
