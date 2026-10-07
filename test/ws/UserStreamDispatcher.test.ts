import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  UserStreamDispatcher,
  attachUserStreamDispatcher,
  type AccumulatedPosition,
} from '../../src/ws/UserStreamDispatcher.js';
import {
  isUserDataEvent,
  parseUserDataEvent,
  PriceMatchModeSchema,
  PriceMatchModeLooseSchema,
  PortfolioMarginProAccountUpdateSchema,
  UserDataAccountUpdateSchema,
  UserDataOrderTradeUpdateSchema,
  UserDataUnknownEventSchema,
  type UserDataAccountUpdate,
  type UserDataEvent,
  type UserDataOrderTradeUpdate,
  type UserDataUnknownEvent,
  type PortfolioMarginProAccountUpdate,
} from '../../src/types/userdata.types.js';

// ---------------------------------------------------------------------------
// Sample frames — copied from Binance's official documentation examples
// (USDⓈ-M Futures user-data stream + Portfolio Margin Pro stream).
// ---------------------------------------------------------------------------

function orderTradeUpdateFrame(pm?: string): unknown {
  const base: Record<string, unknown> = {
    e: 'ORDER_TRADE_UPDATE',
    E: 1_564_776_470_258,
    T: 1_564_776_470_255,
    o: {
      s: 'BTCUSDT',
      c: 'nbsdk-1',
      S: 'BUY',
      o: 'LIMIT',
      f: 'GTC',
      q: '0.05',
      p: '64500.00',
      ap: '64500.00',
      sp: '0',
      x: 'TRADE',
      X: 'FILLED',
      i: 1,
      l: '0.05',
      z: '0.05',
      L: '64500.00',
      N: 'USDT',
      n: '0.016125',
      T: 1_564_776_470_255,
      t: 1,
      b: '0',
      a: '3.225',
      m: false,
      R: false,
      wt: 'CONTRACT_PRICE',
      ot: 'LIMIT',
      ps: 'BOTH',
      cp: false,
      AP: '0',
      cr: '0',
      rp: '0',
    },
  };
  if (pm !== undefined) (base.o as Record<string, unknown>).pm = pm;
  return base;
}

function accountUpdateFrame(): unknown {
  return {
    e: 'ACCOUNT_UPDATE',
    E: 1_564_776_470_258,
    T: 1_564_776_470_255,
    a: {
      m: 'ORDER',
      B: [
        { a: 'USDT', wb: '10000.00', cw: '9000.00', bc: '0' },
      ],
      P: [
        { s: 'BTCUSDT', pa: '0.05', ep: '64500.00', cr: '500', up: '0', mt: 'cross', ps: 'BOTH' },
      ],
    },
  };
}

function marginCallFrame(): unknown {
  return {
    e: 'MARGIN_CALL',
    E: 1_564_776_470_258,
    cw: '5000',
    p: [
      { s: 'BTCUSDT', ps: 'BOTH', pa: '0.05', mt: 'cross', iw: '500', mp: '55000.00', up: '-475', mm: '600' },
    ],
  };
}

function pmProAccountUpdateFrame(): unknown {
  return {
    e: 'PM_PRO_ACCOUNT_UPDATE',
    E: 1_739_000_000_000,
    T: 1_739_000_000_000,
    u: '1.99999999',
    eq: '30.23416728',
    ae: '30.23416728',
    im: '15.00000000',
    mm: '1.50000000',
    avb: '14.73416728',
    vmw: '14.73416728',
  };
}

function algoUpdateFrame(): unknown {
  // The audit's October 7 digest calls out ALGO_UPDATE as the live
  // replacement for deprecated /papi/v1/um/conditional/* triggers.
  return {
    e: 'ALGO_UPDATE',
    E: 1_739_000_000_000,
    algoId: 123456,
    algoStatus: 'TRIGGERED',
  };
}

// ---------------------------------------------------------------------------
// Parser + discriminator
// ---------------------------------------------------------------------------

describe('parseUserDataEvent', () => {
  it('routes ORDER_TRADE_UPDATE frames through the typed schema', () => {
    const event = parseUserDataEvent(orderTradeUpdateFrame('OPPONENT_5'));
    expect(isUserDataEvent(event, 'ORDER_TRADE_UPDATE')).toBe(true);
    if (!isUserDataEvent(event, 'ORDER_TRADE_UPDATE')) return;
    expect(event.o.pm).toBe('OPPONENT_5');
    expect(event.o.c).toBe('nbsdk-1');
    expect(event.o.X).toBe('FILLED');
  });

  it('routes ACCOUNT_UPDATE frames and keeps decimal precision', () => {
    const event = parseUserDataEvent(accountUpdateFrame()) as UserDataAccountUpdate;
    expect(event.e).toBe('ACCOUNT_UPDATE');
    const position = event.a.P[0];
    expect(position).toBeDefined();
    // .transform(Number) on existing schema — backward-compat preserved.
    expect(position.pa).toBe(0.05);
    expect(position.ps).toBe('BOTH');
  });

  it('routes MARGIN_CALL frames', () => {
    const event = parseUserDataEvent(marginCallFrame());
    expect(isUserDataEvent(event, 'MARGIN_CALL')).toBe(true);
  });

  it('routes PM_PRO_ACCOUNT_UPDATE frames with exact decimal strings (no precision loss)', () => {
    const event = parseUserDataEvent(pmProAccountUpdateFrame()) as PortfolioMarginProAccountUpdate;
    expect(event.e).toBe('PM_PRO_ACCOUNT_UPDATE');
    expect(event.u).toBe('1.99999999');
    expect(event.eq).toBe('30.23416728');
    expect(event.im).toBe('15.00000000');
    expect(event.mm).toBe('1.50000000');
    expect(event.avb).toBe('14.73416728');
    expect(event.vmw).toBe('14.73416728');
  });

  it('routes unrecognized event types through UserDataUnknownEvent (audit: no throw)', () => {
    // ALGO_UPDATE replaces deprecated conditional-trigger endpoints — the
    // audit's October 7 digest explicitly calls out that throwing here
    // is a production-crash vector when Binance ships a new event type.
    const event = parseUserDataEvent(algoUpdateFrame()) as UserDataUnknownEvent;
    expect(event.e).toBe('ALGO_UPDATE');
    expect(event.algoId).toBe(123456); // passthrough keeps unknown fields
  });

  it('still rejects non-object payloads', () => {
    expect(() => parseUserDataEvent(null)).toThrow(/Invalid/);
    expect(() => parseUserDataEvent(undefined)).toThrow(/Invalid/);
    expect(() => parseUserDataEvent('not-an-object')).toThrow(/Invalid/);
  });
});

// ---------------------------------------------------------------------------
// PriceMatchMode enum
// ---------------------------------------------------------------------------

describe('PriceMatchModeSchema', () => {
  it('accepts the verified canonical enum values from the audit', () => {
    const verified = [
      'NONE',
      'OPPONENT',
      'OPPONENT_5',
      'OPPONENT_10',
      'OPPONENT_20',
      'TOP',
      'QUEUE',
      'QUEUE_5',
      'QUEUE_10',
      'QUEUE_20',
    ] as const;
    for (const mode of verified) {
      expect(PriceMatchModeSchema.safeParse(mode).success).toBe(true);
    }
  });

  it('rejects out-of-spec values when used as the strict schema', () => {
    expect(PriceMatchModeSchema.safeParse('OPPONENT_99').success).toBe(false);
    expect(PriceMatchModeSchema.safeParse(7).success).toBe(false);
  });

  it('the loose schema accepts future protocol additions as plain strings', () => {
    // A future Binance addition (e.g. QUEUE_50) must not break parsing —
    // it falls through to `string & {}` so consumers can inspect the
    // raw value and decide whether to upgrade the strict enum.
    expect(PriceMatchModeLooseSchema.safeParse('QUEUE_50').success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UserStreamDispatcher — typed routing
// ---------------------------------------------------------------------------

describe('UserStreamDispatcher — typed event routing', () => {
  it('delivers ORDER_TRADE_UPDATE to a typed handler with compile-time-narrowed payload', () => {
    const dispatcher = new UserStreamDispatcher();
    const handler = vi.fn<(event: UserDataOrderTradeUpdate) => void>();
    const dispose = dispatcher.on('ORDER_TRADE_UPDATE', handler);
    dispatcher.dispatch(orderTradeUpdateFrame('QUEUE_10'));
    expect(handler).toHaveBeenCalledTimes(1);
    const call = handler.mock.calls[0]?.[0];
    expect(call?.o.pm).toBe('QUEUE_10');
    expect(call?.o.c).toBe('nbsdk-1');
    dispose();
    dispatcher.dispatch(orderTradeUpdateFrame());
    expect(handler).toHaveBeenCalledTimes(1); // no second delivery
  });

  it('delivers ACCOUNT_UPDATE to a typed handler', () => {
    const dispatcher = new UserStreamDispatcher();
    const handler = vi.fn<(event: UserDataAccountUpdate) => void>();
    dispatcher.on('ACCOUNT_UPDATE', handler);
    dispatcher.dispatch(accountUpdateFrame());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('delivers PM_PRO_ACCOUNT_UPDATE to a typed handler', () => {
    const dispatcher = new UserStreamDispatcher();
    const handler = vi.fn<(event: PortfolioMarginProAccountUpdate) => void>();
    dispatcher.on('PM_PRO_ACCOUNT_UPDATE', handler);
    dispatcher.dispatch(pmProAccountUpdateFrame());
    expect(handler).toHaveBeenCalledTimes(1);
    const call = handler.mock.calls[0]?.[0];
    expect(call?.eq).toBe('30.23416728');
  });

  it('routes unmodeled events (ALGO_UPDATE) to a wildcard listener without throwing', () => {
    const dispatcher = new UserStreamDispatcher();
    const wildcard = vi.fn<(event: UserDataEvent) => void>();
    dispatcher.on('*', wildcard);
    // The dispatch must NOT throw on ALGO_UPDATE — that is the audit's
    // production-crash fix.
    expect(() => dispatcher.dispatch(algoUpdateFrame())).not.toThrow();
    expect(wildcard).toHaveBeenCalledTimes(1);
    const call = wildcard.mock.calls[0]?.[0];
    expect(call?.e).toBe('ALGO_UPDATE');
  });

  it('wildcard listeners receive every typed event too', () => {
    const dispatcher = new UserStreamDispatcher();
    const wildcard = vi.fn<(event: UserDataEvent) => void>();
    dispatcher.on('*', wildcard);
    dispatcher.dispatch(orderTradeUpdateFrame());
    dispatcher.dispatch(accountUpdateFrame());
    dispatcher.dispatch(pmProAccountUpdateFrame());
    dispatcher.dispatch(algoUpdateFrame());
    expect(wildcard).toHaveBeenCalledTimes(4);
    expect(wildcard.mock.calls.map((c) => c[0]?.e)).toEqual([
      'ORDER_TRADE_UPDATE',
      'ACCOUNT_UPDATE',
      'PM_PRO_ACCOUNT_UPDATE',
      'ALGO_UPDATE',
    ]);
  });

  it('disposer detaches wildcard listeners cleanly', () => {
    const dispatcher = new UserStreamDispatcher();
    const handler = vi.fn<(event: UserDataEvent) => void>();
    const dispose = dispatcher.on('*', handler);
    dispatcher.dispatch(orderTradeUpdateFrame());
    expect(handler).toHaveBeenCalledTimes(1);
    dispose();
    dispatcher.dispatch(orderTradeUpdateFrame());
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('removeAllListeners detaches every typed + wildcard listener but keeps positions', () => {
    const dispatcher = new UserStreamDispatcher();
    dispatcher.on('ACCOUNT_UPDATE', () => undefined);
    dispatcher.on('ORDER_TRADE_UPDATE', () => undefined);
    dispatcher.on('*', () => undefined);
    dispatcher.dispatch(accountUpdateFrame()); // seeds the position accumulator
    expect(dispatcher.listPositions().length).toBe(1);
    dispatcher.removeAllListeners();
    expect(dispatcher.listenerCounts().typed).toBe(0);
    expect(dispatcher.listenerCounts().wildcard).toBe(0);
    // Positions are unaffected — they have their own clearPositions() call.
    expect(dispatcher.listPositions().length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// UserStreamDispatcher — position accumulator
// ---------------------------------------------------------------------------

describe('UserStreamDispatcher — position accumulator (audit: ground truth from ACCOUNT_UPDATE only)', () => {
  it('seeds positions from the first ACCOUNT_UPDATE frame', () => {
    const dispatcher = new UserStreamDispatcher();
    dispatcher.dispatch(accountUpdateFrame());
    const pos = dispatcher.getPosition('BTCUSDT', 'BOTH');
    expect(pos?.positionAmt).toBe('0.05');
    expect(pos?.entryPrice).toBe('64500.00');
    expect(pos?.unrealizedPnl).toBe('0');
    expect(pos?.marginType).toBe('cross');
    expect(typeof pos?.updatedAt).toBe('number');
  });

  it('overwrites positions when the next ACCOUNT_UPDATE arrives', () => {
    const dispatcher = new UserStreamDispatcher();
    dispatcher.dispatch(accountUpdateFrame());
    // Second frame: position grew to 0.10, entry moved to 65000.
    dispatcher.dispatch({
      e: 'ACCOUNT_UPDATE',
      E: 1,
      T: 2,
      a: {
        m: 'ORDER',
        B: [],
        P: [
          { s: 'BTCUSDT', pa: '0.10', ep: '65000.00', cr: '500', up: '50', mt: 'cross', ps: 'BOTH' },
        ],
      },
    });
    const pos = dispatcher.getPosition('BTCUSDT', 'BOTH') as AccumulatedPosition;
    expect(pos.positionAmt).toBe('0.10');
    expect(pos.entryPrice).toBe('65000.00');
    expect(pos.unrealizedPnl).toBe('50');
  });

  it('keys positions by symbol_side (LONG / SHORT / BOTH independently)', () => {
    const dispatcher = new UserStreamDispatcher();
    dispatcher.dispatch({
      e: 'ACCOUNT_UPDATE',
      E: 1,
      T: 1,
      a: {
        m: 'ORDER',
        B: [],
        P: [
          { s: 'BTCUSDT', pa: '0.10', ep: '65000.00', cr: '500', up: '0', mt: 'isolated', iw: '500', ps: 'LONG' },
          { s: 'BTCUSDT', pa: '0.20', ep: '65500.00', cr: '500', up: '0', mt: 'isolated', iw: '500', ps: 'SHORT' },
          { s: 'ETHUSDT', pa: '1.00', ep: '3000.00', cr: '0', up: '0', mt: 'cross', ps: 'BOTH' },
        ],
      },
    });
    expect(dispatcher.listPositions().length).toBe(3);
    expect(dispatcher.getPosition('BTCUSDT', 'LONG')?.positionAmt).toBe('0.10');
    expect(dispatcher.getPosition('BTCUSDT', 'SHORT')?.positionAmt).toBe('0.20');
    expect(dispatcher.getPosition('ETHUSDT', 'BOTH')?.positionAmt).toBe('1.00');
  });

  it('exposes isolatedWallet when ACCOUNT_UPDATE carries iw', () => {
    const dispatcher = new UserStreamDispatcher();
    dispatcher.dispatch({
      e: 'ACCOUNT_UPDATE',
      E: 1,
      T: 1,
      a: {
        m: 'ORDER',
        B: [],
        P: [
          { s: 'BTCUSDT', pa: '0.10', ep: '65000.00', cr: '500', up: '0', mt: 'isolated', iw: '500', ps: 'LONG' },
        ],
      },
    });
    expect(dispatcher.getPosition('BTCUSDT', 'LONG')?.isolatedWallet).toBe('500');
  });

  it('clearPositions drops the accumulator without affecting listeners', () => {
    const dispatcher = new UserStreamDispatcher();
    dispatcher.on('ACCOUNT_UPDATE', () => undefined);
    dispatcher.dispatch(accountUpdateFrame());
    expect(dispatcher.listPositions().length).toBe(1);
    dispatcher.clearPositions();
    expect(dispatcher.listPositions().length).toBe(0);
    expect(dispatcher.listenerCounts().typed).toBe(1);
  });

  it('positions update BEFORE typed listeners fire (so handlers see post-update state)', () => {
    const dispatcher = new UserStreamDispatcher();
    const seen = vi.fn<(pos?: AccumulatedPosition) => void>();
    dispatcher.on('ACCOUNT_UPDATE', () => {
      seen(dispatcher.getPosition('BTCUSDT', 'BOTH'));
    });
    dispatcher.dispatch(accountUpdateFrame());
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]?.positionAmt).toBe('0.05');
  });

  it('ORDER_TRADE_UPDATE never modifies the position accumulator (audit: fill deltas drift)', () => {
    const dispatcher = new UserStreamDispatcher();
    dispatcher.dispatch(orderTradeUpdateFrame());
    expect(dispatcher.listPositions().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// attachUserStreamDispatcher — adapter for EventEmitter-shaped sources
// ---------------------------------------------------------------------------

describe('attachUserStreamDispatcher', () => {
  it('forwards `userData` events from an EventEmitter to the dispatcher', () => {
    // Use Node's EventEmitter directly — the SDK's FuturesUserWS/
    // SpotUserWS/CoinMUserWS are all EventEmitter-shaped and emit
    // `'userData'` with the parsed JSON payload.
    const source = new EventEmitter();
    const dispatcher = new UserStreamDispatcher();
    const handler = vi.fn<(event: UserDataOrderTradeUpdate) => void>();
    dispatcher.on('ORDER_TRADE_UPDATE', handler);
    const stop = attachUserStreamDispatcher(source, dispatcher);
    source.emit('userData', orderTradeUpdateFrame('OPPONENT'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]?.o.pm).toBe('OPPONENT');
    stop();
    source.emit('userData', orderTradeUpdateFrame('QUEUE'));
    expect(handler).toHaveBeenCalledTimes(1); // detached
  });

  it('honors the custom eventName option', () => {
    const source = new EventEmitter();
    const dispatcher = new UserStreamDispatcher();
    const handler = vi.fn<(event: UserDataEvent) => void>();
    dispatcher.on('*', handler);
    const stop = attachUserStreamDispatcher(source, dispatcher, { eventName: 'frame' });
    source.emit('frame', pmProAccountUpdateFrame());
    expect(handler).toHaveBeenCalledTimes(1);
    stop();
    // After stop, no more events arrive.
    source.emit('frame', pmProAccountUpdateFrame());
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Schema exports — verify the public surface is wired
// ---------------------------------------------------------------------------

describe('exported schemas', () => {
  it('PortfolioMarginProAccountUpdateSchema parses the documented frame', () => {
    const parsed = PortfolioMarginProAccountUpdateSchema.parse(pmProAccountUpdateFrame());
    expect(parsed.e).toBe('PM_PRO_ACCOUNT_UPDATE');
    expect(parsed.eq).toBe('30.23416728');
  });

  it('UserDataOrderTradeUpdateSchema parses frames with and without pm', () => {
    expect(() => UserDataOrderTradeUpdateSchema.parse(orderTradeUpdateFrame())).not.toThrow();
    expect(() => UserDataOrderTradeUpdateSchema.parse(orderTradeUpdateFrame('OPPONENT_20'))).not.toThrow();
  });

  it('UserDataAccountUpdateSchema parses the canonical frame', () => {
    expect(() => UserDataAccountUpdateSchema.parse(accountUpdateFrame())).not.toThrow();
  });

  it('UserDataUnknownEventSchema accepts arbitrary fields via passthrough', () => {
    const parsed = UserDataUnknownEventSchema.parse(algoUpdateFrame());
    expect(parsed.e).toBe('ALGO_UPDATE');
    expect((parsed as { algoId?: number }).algoId).toBe(123456);
  });
});
