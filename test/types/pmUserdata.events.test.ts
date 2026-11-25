import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  isKnownPmUserEvent,
  OpenOrderLossSchema,
  parsePmUserEvent,
  PmAlgoUpdateSchema,
  PmProAccountUpdateSchema,
  PM_USER_EVENTS,
  RiskLevelChangeSchema,
  type OpenOrderLoss,
  type PmAlgoUpdate,
  type PmProAccountUpdate,
  type RiskLevelChange,
} from '../../src/types/pmUserdata.types.js';
import type { UserDataUnknownEvent } from '../../src/types/userdata.types.js';

describe('PM_PRO_ACCOUNT_UPDATE', () => {
  // Field set per the official 2026-04-17 change-log entry and the community
  // typed schema; u (uniMMR) and eq (account equity) semantics verified.
  const frame = {
    e: 'PM_PRO_ACCOUNT_UPDATE',
    E: 1777041666123,
    u: '3112.12781385',
    eq: '122607.35137904',
    ae: '10607.39915911',
    im: '0.62911929',
    mm: '0.47249467',
    avb: '10605.0',
    vmw: '10550.1',
  };

  it('parses the 5-second account status push with decimals as strings', () => {
    const parsed = PmProAccountUpdateSchema.parse(frame);
    expect(parsed.e).toBe('PM_PRO_ACCOUNT_UPDATE');
    expect(parsed.u).toBe('3112.12781385');
    expect(parsed.eq).toBe('122607.35137904');
    expect(parsed.avb).toBe('10605.0');
  });

  it('keeps fields it does not model (passthrough, no data loss)', () => {
    const parsed = PmProAccountUpdateSchema.parse({ ...frame, newUpstreamField: 'x' });
    expect((parsed as Record<string, unknown>).newUpstreamField).toBe('x');
  });

  it('rejects a frame without the uniMMR field', () => {
    const { u: _u, ...partial } = frame;
    expect(() => PmProAccountUpdateSchema.parse(partial)).toThrow();
    expectTypeOf<PmProAccountUpdate['u']>().toEqualTypeOf<string>();
  });
});

describe('riskLevelChange (uniMMR risk guidance)', () => {
  it('parses a MARGIN_CALL push and preserves unmodeled fields', () => {
    const parsed = RiskLevelChangeSchema.parse({
      e: 'riskLevelChange',
      E: 1777041666123,
      riskLevel: 'MARGIN_CALL',
      uniMMR: '1.05',
    });
    expect(parsed.e).toBe('riskLevelChange');
    expect(parsed.riskLevel).toBe('MARGIN_CALL');
    expect((parsed as Record<string, unknown>).uniMMR).toBe('1.05');
    expectTypeOf<RiskLevelChange['e']>().toEqualTypeOf<'riskLevelChange'>();
  });

  it('accepts every documented risk level token', () => {
    for (const riskLevel of ['NORMAL', 'MARGIN_CALL', 'REDUCE_ONLY', 'FORCE_LIQUIDATION']) {
      expect(RiskLevelChangeSchema.parse({ e: 'riskLevelChange', riskLevel }).riskLevel).toBe(riskLevel);
    }
  });
});

describe('openOrderLoss (2026-11-23 payload change)', () => {
  it('parses the new aggregated account-level string field o', () => {
    const parsed = OpenOrderLossSchema.parse({ e: 'openOrderLoss', E: 1766500000000, o: '-123.45' });
    expect(parsed.e).toBe('openOrderLoss');
    expect(parsed.o).toBe('-123.45');
    expect(parsed.O).toBeUndefined();
  });

  it('still accepts the legacy per-asset array O for pre-migration frames', () => {
    const parsed = OpenOrderLossSchema.parse({
      e: 'openOrderLoss',
      E: 1766400000000,
      O: [
        { a: 'BTC', o: '-1.5' },
        { a: 'ETH', o: '-0.5' },
      ],
    });
    expect(parsed.O).toHaveLength(2);
    expect(parsed.O?.[0]).toEqual({ a: 'BTC', o: '-1.5' });
    expect(parsed.o).toBeUndefined();
  });

  it('rejects a frame carrying neither o nor O', () => {
    expect(() => OpenOrderLossSchema.parse({ e: 'openOrderLoss', E: 1 })).toThrow(/must carry o \(aggregated\) or O/);
    expectTypeOf<OpenOrderLoss['o']>().toEqualTypeOf<string | undefined>();
  });
});

describe('ALGO_UPDATE (Portfolio Margin, ao payload)', () => {
  it('parses the ao object and surfaces the trailing-stop ia flag', () => {
    const parsed = PmAlgoUpdateSchema.parse({
      e: 'ALGO_UPDATE',
      E: 1755842461373,
      ao: { aid: 42, at: 'TRAILING_STOP_MARKET', s: 'BTCUSDT', X: 'NEW', ia: false },
    });
    expect(parsed.e).toBe('ALGO_UPDATE');
    expect(parsed.ao.ia).toBe(false);
    expect((parsed.ao as Record<string, unknown>).s).toBe('BTCUSDT');
    expectTypeOf<PmAlgoUpdate['ao']['ia']>().toEqualTypeOf<boolean | undefined>();
  });
});

describe('parsePmUserEvent dispatch', () => {
  it('routes modelled names to strict schemas and unknown names to passthrough', () => {
    expect(parsePmUserEvent({ e: 'PM_PRO_ACCOUNT_UPDATE', E: 1, u: '1.0', eq: '2.0' }).e).toBe('PM_PRO_ACCOUNT_UPDATE');
    expect(parsePmUserEvent({ e: 'riskLevelChange', E: 1 }).e).toBe('riskLevelChange');
    expect(parsePmUserEvent({ e: 'openOrderLoss', E: 1, o: '0' }).e).toBe('openOrderLoss');
    expect(parsePmUserEvent({ e: 'ALGO_UPDATE', E: 1, ao: {} }).e).toBe('ALGO_UPDATE');

    const unknown = parsePmUserEvent({ e: 'ACCOUNT_UPDATE', E: 1, a: { m: 'ORDER' } });
    expectTypeOf(unknown).not.toBeNull();
    expect((unknown as UserDataUnknownEvent).e).toBe('ACCOUNT_UPDATE');
    expect(((unknown as Record<string, unknown>).a as Record<string, unknown>).m).toBe('ORDER');
  });

  it('throws on frames without an event type', () => {
    expect(() => parsePmUserEvent({})).toThrow(/missing event type/);
    expect(() => parsePmUserEvent('nope')).toThrow(/Invalid Portfolio Margin user-data payload/);
  });

  it('declares exactly the four modeled event names', () => {
    expect(PM_USER_EVENTS).toEqual(['PM_PRO_ACCOUNT_UPDATE', 'riskLevelChange', 'openOrderLoss', 'ALGO_UPDATE']);
    expect(isKnownPmUserEvent('PM_PRO_ACCOUNT_UPDATE')).toBe(true);
    expect(isKnownPmUserEvent('ACCOUNT_UPDATE')).toBe(false);
    expect(isKnownPmUserEvent('listenKeyExpired')).toBe(false);
  });
});
