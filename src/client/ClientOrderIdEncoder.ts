import { PreflightValidationError } from '../errors/PreflightValidationError.js';

/**
 * Client order id encoder. Packs a strategy tag, a creation timestamp, a sequence
 * number, and a checksum into one id that survives the exchange's id rules.
 *
 * Alphabet: the USDⓈ-M newOrder pattern (verified in the vendored Postman catalog)
 * is `^[\.A-Z\:/a-z0-9_-]{1,36}$`. The spot pattern is not verified, so this encoder
 * emits only the intersection that is safe under any plausible rule: `A-Z a-z 0-9
 * _ -`, at most 36 characters.
 *
 * Layout: `<strategy>-<ts:8 base36><seq:4 base36><check:2 base36>`
 * - strategy: 1–8 alphanumeric characters (no `-`, so the first `-` is the split point)
 * - ts: epoch ms, 0 ≤ ts < 36^8
 * - seq: 0 ≤ seq < 36^4
 * - check: sum of the body's character codes mod 36^2
 */

export const CLIENT_ORDER_ID_MAX_LENGTH = 36;
export const CLIENT_ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,36}$/;

const BASE = 36;
const TS_WIDTH = 8;
const SEQ_WIDTH = 4;
const CHECK_WIDTH = 2;
const STRATEGY_PATTERN = /^[A-Za-z0-9]{1,8}$/;
const MAX_TS = BASE ** TS_WIDTH - 1;
const MAX_SEQ = BASE ** SEQ_WIDTH - 1;

export interface ClientOrderIdParts {
  strategy: string;
  timestampMs: number;
  sequence: number;
}

function checksum(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += body.charCodeAt(i);
  return (sum % BASE ** CHECK_WIDTH).toString(BASE).padStart(CHECK_WIDTH, '0');
}

function fail(message: string, details: Record<string, unknown>): never {
  throw new PreflightValidationError('INVALID_INPUT', message, details);
}

export function encodeClientOrderId(parts: ClientOrderIdParts): string {
  if (!STRATEGY_PATTERN.test(parts.strategy)) {
    fail('strategy must be 1–8 alphanumeric characters', { strategy: parts.strategy });
  }
  if (!Number.isSafeInteger(parts.timestampMs) || parts.timestampMs < 0 || parts.timestampMs > MAX_TS) {
    fail(`timestampMs must be an integer in [0, ${MAX_TS}]`, { timestampMs: parts.timestampMs });
  }
  if (!Number.isSafeInteger(parts.sequence) || parts.sequence < 0 || parts.sequence > MAX_SEQ) {
    fail(`sequence must be an integer in [0, ${MAX_SEQ}]`, { sequence: parts.sequence });
  }
  const ts = parts.timestampMs.toString(BASE).padStart(TS_WIDTH, '0');
  const seq = parts.sequence.toString(BASE).padStart(SEQ_WIDTH, '0');
  const body = `${ts}${seq}`;
  const id = `${parts.strategy}-${body}${checksum(`${parts.strategy}-${body}`)}`;
  if (id.length > CLIENT_ORDER_ID_MAX_LENGTH || !CLIENT_ORDER_ID_PATTERN.test(id)) {
    fail('encoded client order id violates the exchange rule', { id });
  }
  return id;
}

/** Decode and verify an id produced by {@link encodeClientOrderId}. Throws on any mismatch. */
export function decodeClientOrderId(id: string): ClientOrderIdParts {
  const dash = id.indexOf('-');
  if (dash < 1) fail('client order id has no strategy segment', { id });
  const strategy = id.slice(0, dash);
  const rest = id.slice(dash + 1);
  if (!STRATEGY_PATTERN.test(strategy)) fail('invalid strategy segment', { id });
  if (rest.length !== TS_WIDTH + SEQ_WIDTH + CHECK_WIDTH) fail('client order id body has the wrong length', { id });

  const body = rest.slice(0, TS_WIDTH + SEQ_WIDTH);
  const check = rest.slice(TS_WIDTH + SEQ_WIDTH);
  if (checksum(`${strategy}-${body}`) !== check) fail('client order id checksum mismatch', { id });

  return {
    strategy,
    timestampMs: parseInt(body.slice(0, TS_WIDTH), BASE),
    sequence: parseInt(body.slice(TS_WIDTH), BASE),
  };
}
