import type { CoreContext } from '../../core/context.js';
import { CryptoLoan } from '../../resources/CryptoLoan.js';
import type { ProductClient } from '../types.js';
import { buildCryptoLoanSurface, type CryptoLoanSurface } from './surface.js';

/**
 * v3 Binance Crypto Loan product client.
 */
export class CryptoLoanClient implements ProductClient {
  readonly product = 'cryptoLoan' as const;
  readonly core: CoreContext;

  private readonly surface: CryptoLoanSurface;
  private closed = false;

  constructor(core: CoreContext) {
    this.core = core;
    this.surface = buildCryptoLoanSurface(core);
  }

  get flexible(): CryptoLoan {
    return this.surface.flexible;
  }

  get loan(): CryptoLoan {
    return this.surface.loan;
  }

  close(): void {
    this.closed = true;
  }
}
