import { HttpClient } from '../client/HttpClient.js';
import { OptionsMmp as OptionsMmpType, OptionsMmpSchema } from '../types/options.types.js';

/**
 * Binance Options Market Maker Protection (MMP) — query, configure, and
 * reset the MMP profile that gates block-trade risk for an options market
 * maker. Distinct from spot/futures because the eapi host implements its own
 * MMP profile endpoint set.
 */
export class OptionsMmp {
  constructor(private readonly http: HttpClient) {}

  /** Get the current MMP profile. `GET /eapi/v1/mmp` (SIGNED). */
  async getMmp(uid?: string): Promise<OptionsMmpType> {
    const params = uid ? { uid } : undefined;
    return OptionsMmpSchema.parse(await this.http.get('/eapi/v1/mmp', params, 'signed'));
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
  }): Promise<OptionsMmpType> {
    return OptionsMmpSchema.parse(await this.http.post('/eapi/v1/mmpSet', params, 'signed'));
  }

  /** Reset an MMP block (unfreeze the underlying). `POST /eapi/v1/mmpReset` (SIGNED). */
  async resetMmp(uid: string, underlying: string): Promise<OptionsMmpType> {
    return OptionsMmpSchema.parse(await this.http.post('/eapi/v1/mmpReset', { uid, underlying }, 'signed'));
  }
}
