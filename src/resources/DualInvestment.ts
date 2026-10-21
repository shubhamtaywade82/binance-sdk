import { HttpClient } from '../client/HttpClient.js';
import {
  DualInvestmentAccountsResponseSchema,
  DualInvestmentAccount,
  DualInvestmentPosition,
  DualInvestmentPositionsResponseSchema,
  DualInvestmentProduct,
  DualInvestmentProductListResponseSchema,
  DualInvestmentSubscribe,
  DualInvestmentSubscribeSchema,
} from '../types/extras.types.js';

/**
 * Binance Dual Investment — subscribe to dual-investment products, query
 * positions, balances, and manage auto-compound status.
 */
export class DualInvestment {
  constructor(private readonly http: HttpClient) {}

  /** Dual Investment account balance. `GET /sapi/v1/dci/product/accounts` (SIGNED). */
  async accounts(options?: { asset?: string }): Promise<DualInvestmentAccount[]> {
    return DualInvestmentAccountsResponseSchema.parse(await this.http.get('/sapi/v1/dci/product/accounts', options ?? {}, 'signed'));
  }

  /** Toggle auto-compound for a position. `POST /sapi/v1/dci/product/auto_compound/edit-status` (SIGNED). */
  async autoCompoundEditStatus(params: { positionId: number; status: boolean }): Promise<Record<string, unknown>> {
    return this.http.post('/sapi/v1/dci/product/auto_compound/edit-status', params, 'signed');
  }

  /** Open & historical DI positions. `GET /sapi/v1/dci/product/positions` (SIGNED). */
  async positions(options?: {
    status?: 'PENDING' | 'PURCHASED' | 'SETTLED' | 'EXPIRED';
    pageSize?: number;
    pageIndex?: number;
  }): Promise<DualInvestmentPosition[]> {
    return DualInvestmentPositionsResponseSchema.parse(await this.http.get('/sapi/v1/dci/product/positions', options ?? {}, 'signed'));
  }

  /** Subscribe to a Dual Investment product. `POST /sapi/v1/dci/product/subscribe` (SIGNED). */
  async subscribe(params: {
    id: string;
    investAmount: string;
    autoCompoundPlan?: 'STANDARD' | 'ADVANCED';
  }): Promise<DualInvestmentSubscribe> {
    return DualInvestmentSubscribeSchema.parse(await this.http.post('/sapi/v1/dci/product/subscribe', params, 'signed'));
  }

  /** List of DI products. `GET /sapi/v1/dci/product/list` (SIGNED). */
  async list(options?: { pageSize?: number; pageIndex?: number }): Promise<DualInvestmentProduct[]> {
    return DualInvestmentProductListResponseSchema.parse(await this.http.get('/sapi/v1/dci/product/list', options ?? {}, 'signed'));
  }
}
