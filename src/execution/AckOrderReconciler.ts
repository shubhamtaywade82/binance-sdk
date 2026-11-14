import type { EventEmitter } from 'node:events';

/**
 * ACK-first execution reconciliation. A newOrderRespType=ACK reply confirms only that
 * the exchange accepted the order. The outcome arrives later as ORDER_TRADE_UPDATE
 * frames. This reconciler waits for the terminal status of one client order id.
 *
 * Order-status terminal set: verified against Binance's common-definition status
 * list (FILLED, CANCELED, REJECTED, EXPIRED, EXPIRED_IN_MATCH). NEW and
 * PARTIALLY_FILLED are not terminal.
 *
 * The listener is attached BEFORE the order is placed. A terminal frame that arrives
 * during the placement call is therefore captured. Attaching afterwards loses it.
 */

export const ORDER_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'FILLED',
  'CANCELED',
  'REJECTED',
  'EXPIRED',
  'EXPIRED_IN_MATCH',
]);

export interface OrderTradeUpdateFrame {
  e: 'ORDER_TRADE_UPDATE';
  o: { c: string; X: string; [key: string]: unknown };
  [key: string]: unknown;
}

export type ReconcileResult =
  | { status: 'TERMINAL'; orderStatus: string; event: OrderTradeUpdateFrame }
  | { status: 'TIMEOUT'; lastStatus: string | undefined };

export interface AckOrderReconcilerOptions {
  /** How long to wait for a terminal status. Default 15 seconds. */
  timeoutMs?: number;
}

export class AckOrderReconciler {
  private readonly timeoutMs: number;

  constructor(
    private readonly source: Pick<EventEmitter, 'on' | 'off'>,
    options: AckOrderReconcilerOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /**
   * Subscribe, run `place`, then wait for the terminal status of `clientOrderId`.
   * Returns TIMEOUT when no terminal status arrived. On TIMEOUT the order may still be
   * live. Reconcile by querying the order over REST before deciding anything.
   */
  async placeAndAwait(
    clientOrderId: string,
    place: () => Promise<unknown>,
  ): Promise<ReconcileResult> {
    let lastStatus: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settle: (result: ReconcileResult) => void = () => undefined;

    const outcome = new Promise<ReconcileResult>((resolve) => {
      settle = resolve;
    });

    const handler = (frame: OrderTradeUpdateFrame): void => {
      if (frame?.o?.c !== clientOrderId) return;
      if (ORDER_TERMINAL_STATUSES.has(frame.o.X)) {
        settle({ status: 'TERMINAL', orderStatus: frame.o.X, event: frame });
      } else {
        lastStatus = frame.o.X;
      }
    };

    this.source.on('ORDER_TRADE_UPDATE', handler);
    try {
      timer = setTimeout(() => settle({ status: 'TIMEOUT', lastStatus }), this.timeoutMs);
      await place();
      return await outcome;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      this.source.off('ORDER_TRADE_UPDATE', handler);
    }
  }
}
