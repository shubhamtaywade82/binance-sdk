import type { ExchangeSymbol } from './market.types.js';

/**
 * Symbol trading rules, flattened out of the loose `filters` array that
 * `/fapi/v1/exchangeInfo` returns. Callers need these to round prices and
 * quantities before sending an order — Binance rejects anything that does not
 * sit exactly on a tick/step boundary (-1111) or that falls under the minimum
 * notional (-4164).
 */
export interface SymbolRules {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  /** Tick the price must sit on, e.g. 0.10 for BTCUSDT. */
  tickSize: number;
  tickDecimals: number;
  /** Step the quantity must sit on for limit orders, e.g. 0.001 for BTCUSDT. */
  stepSize: number;
  stepDecimals: number;
  minQty: number;
  maxQty: number;
  /** MARKET orders carry their own LOT_SIZE, usually with a lower max. */
  marketStepSize: number;
  marketStepDecimals: number;
  marketMinQty: number;
  marketMaxQty: number;
  /** MIN_NOTIONAL — on USD-M futures the field is `notional`, not `minNotional`. */
  minNotional: number;
}

interface RawFilter {
  filterType?: unknown;
  [key: string]: unknown;
}

function filtersOf(symbol: ExchangeSymbol): RawFilter[] {
  const raw = (symbol as unknown as Record<string, unknown>).filters;
  return Array.isArray(raw) ? (raw as RawFilter[]) : [];
}

function filterOf(symbol: ExchangeSymbol, filterType: string): RawFilter | undefined {
  return filtersOf(symbol).find((f) => f.filterType === filterType);
}

function num(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Decimal places implied by a step string, e.g. "0.00100000" -> 3, "1" -> 0.
 * Derived from the string rather than the number so that a step like 0.0000001
 * never picks up an exponent representation.
 */
export function stepDecimals(step: string | number): number {
  const text = typeof step === 'number' ? step.toFixed(12) : String(step).trim();
  // Bound the scan: filter strings are short, but the parser is fed arbitrary
  // exchange payloads, so nothing here should be super-linear in input size.
  if (text.length > 64) {
    return stepDecimals(text.slice(0, 64));
  }
  const dot = text.indexOf('.');
  if (dot === -1) return 0;
  // Linear trailing-zero scan. A `/0+$/` regex is quadratic on adversarial
  // inputs (e.g. "0a0a0a0…") — the flagged polynomial-ReDoS pattern.
  let end = text.length;
  while (end > dot + 1 && text.charCodeAt(end - 1) === 48) end--;
  return end - (dot + 1);
}

/** Format a value at a fixed precision, which is what should be sent to Binance. */
export function formatToDecimals(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/**
 * Round down onto a step boundary. Used for quantities, where rounding up would
 * silently take on more risk than the caller asked for. The epsilon absorbs
 * binary-float error so that e.g. 0.3 / 0.1 = 2.9999999999999996 still floors to 3.
 */
export function floorToStep(value: number, step: number, decimals = stepDecimals(step)): number {
  if (!(step > 0)) return value;
  const steps = Math.floor(value / step + 1e-9);
  return Number((steps * step).toFixed(decimals));
}

/** Round to the nearest step boundary. Used for prices, where direction is not a risk. */
export function roundToStep(value: number, step: number, decimals = stepDecimals(step)): number {
  if (!(step > 0)) return value;
  const steps = Math.round(value / step);
  return Number((steps * step).toFixed(decimals));
}

/** Flatten one `exchangeInfo.symbols[]` entry into typed trading rules. */
export function symbolRulesFrom(symbol: ExchangeSymbol): SymbolRules {
  const raw = symbol as unknown as Record<string, unknown>;
  const price = filterOf(symbol, 'PRICE_FILTER');
  const lot = filterOf(symbol, 'LOT_SIZE');
  const marketLot = filterOf(symbol, 'MARKET_LOT_SIZE');
  const notional = filterOf(symbol, 'MIN_NOTIONAL');

  const tickSizeRaw = price?.tickSize ?? 10 ** -num(raw.pricePrecision, 2);
  const stepSizeRaw = lot?.stepSize ?? 10 ** -num(raw.quantityPrecision, 3);
  const marketStepRaw = marketLot?.stepSize ?? stepSizeRaw;

  return {
    symbol: symbol.symbol,
    status: symbol.status,
    baseAsset: symbol.baseAsset,
    quoteAsset: symbol.quoteAsset,
    tickSize: num(tickSizeRaw, 0.01),
    tickDecimals: stepDecimals(tickSizeRaw as string | number),
    stepSize: num(stepSizeRaw, 0.001),
    stepDecimals: stepDecimals(stepSizeRaw as string | number),
    minQty: num(lot?.minQty, 0),
    maxQty: num(lot?.maxQty, Number.POSITIVE_INFINITY),
    marketStepSize: num(marketStepRaw, 0.001),
    marketStepDecimals: stepDecimals(marketStepRaw as string | number),
    marketMinQty: num(marketLot?.minQty, num(lot?.minQty, 0)),
    marketMaxQty: num(marketLot?.maxQty, num(lot?.maxQty, Number.POSITIVE_INFINITY)),
    minNotional: num(notional?.notional, 0),
  };
}
