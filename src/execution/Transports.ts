import { BinanceApiError, BinanceUnknownExecutionError } from '../errors/index.js';
import type { FuturesTrading } from '../resources/FuturesTrading.js';
import type { SpotTrading } from '../resources/SpotTrading.js';
import type { PaperTradingEngine } from '../paper/PaperTradingEngine.js';
import type { CreateOrderParams } from '../types/trading.types.js';
import {
  type IExecutionTransport,
  type OrderCancelResult,
  type OrderExecutionResult,
  type OrderPlacementParams,
} from './ITransport.js';

/**
 * Live Binance execution transport — wraps a Spot or USDⓈ-M trading
 * resource and exposes it as an {@link IExecutionTransport} for the
 * audit's pluggable execution layer.
 *
 * Spot is served via REST (`POST /api/v3/order`); USDⓈ-M via REST
 * (`POST /fapi/v1/order`). The trading resource already owns the
 * signing (HMAC / Ed25519 / RSA), retry policy, and weight tracking.
 *
 * When a 5XX or transport-level timeout lands on a mutating request,
 * the live transport wraps the underlying error in a
 * {@link BinanceUnknownExecutionError} — the audit's "UNKNOWN execution
 * trap" — so the strategy layer can reconcile by client order id
 * instead of blindly re-sending.
 */
export class LiveBinanceTransport implements IExecutionTransport {
  readonly label: string;
  private readonly product: 'spot' | 'usdm';

  constructor(
    private readonly trading: SpotTrading | FuturesTrading,
    options: { product?: 'spot' | 'usdm'; label?: string } = {},
  ) {
    this.product = options.product ?? 'usdm';
    this.label = options.label ?? `live:${this.product}`;
  }

  async placeOrder(params: OrderPlacementParams): Promise<OrderExecutionResult> {
    // The Spot and USDⓈ-M trading resources both accept a params record
    // routed through the shared HttpClient. Spot has extra fields
    // (quoteOrderQty, icebergQty, trailingDelta) that are not part of
    // the USDⓈ-M CreateOrderParams type — pass them through as raw
    // keys and let the server validate per-product.
    const submission: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      newOrderRespType: 'RESULT',
    };
    if (params.price !== undefined) submission.price = params.price;
    if (params.stopPrice !== undefined) submission.stopPrice = params.stopPrice;
    if (params.timeInForce !== undefined) submission.timeInForce = params.timeInForce;
    if (params.newClientOrderId !== undefined) submission.newClientOrderId = params.newClientOrderId;
    if (params.quoteOrderQty !== undefined) submission.quoteOrderQty = params.quoteOrderQty;
    if (params.selfTradePreventionMode !== undefined) submission.selfTradePreventionMode = params.selfTradePreventionMode;
    if (params.trailingDelta !== undefined) submission.trailingDelta = params.trailingDelta;
    if (params.icebergQty !== undefined) submission.icebergQty = params.icebergQty;
    try {
      const raw = await this.trading.createOrder(submission as unknown as CreateOrderParams);
      return normalizeResult(raw, params);
    } catch (err) {
      throw wrapUnknown(err, params);
    }
  }

  async cancelOrder(
    symbol: string,
    orderId: string | number,
    opts: { origClientOrderId?: string } = {},
  ): Promise<OrderCancelResult> {
    try {
      const raw = await this.trading.cancelOrder(symbol, {
        orderId: typeof orderId === 'number' ? orderId : undefined,
        origClientOrderId: opts.origClientOrderId,
      });
      return normalizeCancelResult(raw, symbol);
    } catch (err) {
      if (err instanceof BinanceApiError && (err.code === -2011 || err.code === -2013)) {
        return {
          orderId,
          symbol,
          status: 'CANCELED',
        };
      }
      throw err;
    }
  }
}

/**
 * Paper Broker transport — implements the same {@link IExecutionTransport}
 * contract against a {@link PaperTradingEngine}, so strategies written
 * against the live adapter can be flipped to simulation by changing
 * one constructor argument. The paper engine fills instantly; this
 * adapter preserves the exact decimal-string result shape so callers
 * cannot tell backends apart by reading the result.
 */
export class PaperBrokerTransport implements IExecutionTransport {
  readonly label = 'paper:broker';

  constructor(
    private readonly engine: PaperTradingEngine,
    private readonly options: { commissionAsset?: string } = {},
  ) {}

  async placeOrder(params: OrderPlacementParams): Promise<OrderExecutionResult> {
    if (!params.newClientOrderId) {
      throw new BinanceApiError(
        'PaperBrokerTransport requires newClientOrderId (the reconciliation key)',
        -1102,
        400,
        {},
      );
    }
    const type = String(params.type ?? 'MARKET').toUpperCase() as 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'TAKE_PROFIT' | 'TAKE_PROFIT_LIMIT';
    let paperOrder;
    try {
      paperOrder = await this.engine.placeOrder({
        symbol: params.symbol,
        side: params.side,
        type: (type === 'MARKET' || type === 'LIMIT') ? type : 'LIMIT',
        quantity: Number(params.quantity),
        price: params.price !== undefined ? Number(params.price) : undefined,
      });
    } catch (err) {
      throw new BinanceApiError((err as Error).message, -2019, 400, {});
    }
    const filledQty = paperOrder.filledQuantity;
    const avgPrice = paperOrder.avgFillPrice;
    const cumQuote = filledQty * avgPrice;
    return {
      orderId: paperOrder.orderId,
      clientOrderId: params.newClientOrderId,
      symbol: paperOrder.symbol,
      status: paperOrder.status as OrderExecutionResult['status'],
      executedQty: String(filledQty),
      cummulativeQuoteQty: String(cumQuote),
      avgPrice: String(avgPrice),
    };
  }

  async cancelOrder(
    symbol: string,
    orderId: string | number,
    _opts: { origClientOrderId?: string } = {},
  ): Promise<OrderCancelResult> {
    throw new BinanceApiError(
      `PaperBrokerTransport.cancelOrder(${symbol}, ${orderId}): simulator fills instantly, no resting order to cancel`,
      -2011,
      400,
      {},
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeResult(
  raw: unknown,
  params: OrderPlacementParams,
): OrderExecutionResult {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    orderId: record.orderId !== undefined ? Number(record.orderId) : 0,
    clientOrderId: String(record.clientOrderId ?? params.newClientOrderId ?? ''),
    symbol: String(record.symbol ?? params.symbol),
    status: String(record.status ?? 'NEW') as OrderExecutionResult['status'],
    executedQty: String(record.executedQty ?? '0'),
    cummulativeQuoteQty: String(
      record.cummulativeQuoteQty ?? record.cumQuote ?? '0',
    ),
    avgPrice: record.avgPrice !== undefined && String(record.avgPrice) !== ''
      ? String(record.avgPrice)
      : null,
    orderListId: record.orderListId !== undefined ? Number(record.orderListId) : undefined,
    isReduced: typeof record.isReduced === 'boolean' ? record.isReduced : undefined,
  };
}

function normalizeCancelResult(raw: unknown, symbol: string): OrderCancelResult {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    orderId: record.orderId !== undefined ? Number(record.orderId) : 0,
    clientOrderId: record.clientOrderId !== undefined ? String(record.clientOrderId) : undefined,
    symbol: String(record.symbol ?? symbol),
    status: 'CANCELED',
  };
}

function wrapUnknown(err: unknown, params: OrderPlacementParams): unknown {
  const unknownExecution = classifyForUnknown(err, params);
  if (unknownExecution) return unknownExecution;
  return err;
}

/**
 * Recognise 5XX / ECONNRESET / TimeoutError on a mutating placement and
 * surface as a {@link BinanceUnknownExecutionError} so the caller
 * reconciles before any retry. Reuses the same logic the SDK exposes
 * from the errors module to keep classification consistent.
 */
function classifyForUnknown(
  err: unknown,
  params: OrderPlacementParams,
): BinanceUnknownExecutionError | null {
  if (err === null || err === undefined) return null;
  if (err instanceof BinanceUnknownExecutionError) return err;
  if (typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    const status = (err as { status: number }).status;
    if (status >= 500 && status < 600) {
      return new BinanceUnknownExecutionError(
        params.newClientOrderId ?? '',
        params.symbol,
        err,
      );
    }
    return null;
  }
  const name = (err as { name?: string })?.name ?? '';
  const code = (err as { code?: string })?.code ?? '';
  if (
    name === 'TimeoutError' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    name === 'NetworkError'
  ) {
    return new BinanceUnknownExecutionError(
      params.newClientOrderId ?? '',
      params.symbol,
      err,
    );
  }
  return null;
}
