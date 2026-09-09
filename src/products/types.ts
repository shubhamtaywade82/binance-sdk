import type { CoreContext } from '../core/context.js';

/**
 * Product identifiers — the canonical set v3 namespaces address. Grows as
 * products are migrated onto the platform (Options, Portfolio Margin, …).
 */
export type ProductId =
  | 'spot'
  | 'usdm'
  | 'coinm'
  | 'margin'
  | 'wallet'
  | 'subaccount'
  | 'convert';

/**
 * v3 product boundary.
 *
 * A product client is anything constructed from a shared {@link CoreContext}
 * that owns its product's surface. The contract is deliberately tiny —
 * products differ wildly in surface, but every one of them:
 *
 *  - declares its `product` id (routing key for the contract catalog,
 *    observability dimensions, and coverage accounting);
 *  - carries the core context it was built from (so callers can reach the
 *    shared transports, credentials and events without globals);
 *  - closes the product's own resources (websockets, listen-key timers).
 *
 * The raw API layer (`client.futures.usdm.trading.createOrder`) and the
 * domain execution layer (`client.futures.usdm.execution.placeOrder`) both
 * live inside product clients — API fidelity and trading infrastructure are
 * siblings, not alternatives.
 */
export interface ProductClient {
  /** Canonical product id ('usdm', 'spot', …). */
  readonly product: ProductId;
  /** The shared runtime this product was constructed from. */
  readonly core: CoreContext;
  /**
   * Close this product's resources (WS connections, keep-alive timers).
   * Safe to call more than once.
   */
  close(): void;
}

/**
 * Factory signature for lazy product construction on a multi-product
 * facade: receives the shared context, returns the cached product surface.
 */
export type ProductFactory<T> = (core: CoreContext) => T;

/** True when a value satisfies the v3 product boundary. */
export function isProductClient(value: unknown): value is ProductClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ProductClient).product === 'string' &&
    (value as ProductClient).core !== undefined &&
    typeof (value as ProductClient).close === 'function'
  );
}
