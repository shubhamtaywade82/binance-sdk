import { HttpClient } from '../client/HttpClient.js';

/**
 * Binance Options Market Maker Protection (MMP) — query, configure, and
 * reset the MMP profile that gates block-trade risk for an options market
 * maker. Distinct from spot/futures because the eapi host implements its own
 * MMP profile endpoint set.
 */
export class OptionsMmp {
  constructor(private readonly http: HttpClient) {}

  /** Get the current MMP profile. `GET /eapi/v1/mmp` (SIGNED). */
  async getMmp(uid?: string): Promise<Record<string, unknown>> {
    const params = uid ? { uid } : undefined;
    return this.http.get('/mmp', params, 'signed');
  }

  /** Set/update the MMP profile. `POST /eapi/v1/mmpSet` (SIGNED). */
  async setMmp(params: {
    uid: string;
    underlying: string;
    windowTimeInMilliseconds?: number;
    frozenTimeInMilliseconds?: number;
    qtyLimit?: number;
    deltaLimit?: number;
    triggerLimit?: number;
  }): Promise<Record<string, unknown>> {
    return this.http.post('/mmpSet', params, 'signed');
  }

  /** Reset an MMP block (unfreeze the underlying). `POST /eapi/v1/mmpReset` (SIGNED). */
  async resetMmp(uid: string, underlying: string): Promise<Record<string, unknown>> {
    return this.http.post('/mmpReset', { uid, underlying }, 'signed');
  }
}
