import type { CoreContext } from '../../core/context.js';
import { CryptoLoan } from '../../resources/CryptoLoan.js';

/** Crypto Loan product surface. */
export interface CryptoLoanSurface {
  /** Fixed-term (v1) and flexible (v2) loans. */
  flexible: CryptoLoan;
  /** Same instance, exposed under `loan` for fixed-term clarity. */
  loan: CryptoLoan;
}

/**
 * Build the Crypto Loan surface over a shared {@link CoreContext}. The
 * underlying {@link CryptoLoan} resource handles both fixed-term (v1) and
 * flexible (v2) endpoints; the surface aliases it as `loan` and `flexible`
 * so callers can choose the most readable accessor for their context.
 */
export function buildCryptoLoanSurface(core: CoreContext): CryptoLoanSurface {
  const instance = new CryptoLoan(core.http('apiRoot'));
  return { loan: instance, flexible: instance };
}
