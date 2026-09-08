import { describe, expect, it } from 'vitest';
import { parseJsonLossless, normalizeIntStrings } from '../../src/core/json.js';
import { EventBus } from '../../src/core/events.js';

describe('parseJsonLossless', () => {
  it('preserves unsafe integers as strings', () => {
    const parsed = parseJsonLossless('{"orderId": 9007199254740993, "ok": 42}') as Record<string, unknown>;
    expect(parsed.orderId).toBe('9007199254740993');
    expect(parsed.ok).toBe(42);
  });

  it('preserves unsafe integers inside arrays (kline payloads)', () => {
    const parsed = parseJsonLossless('[[1499040000000, "0.1", 9007199254740995]]') as unknown[];
    const row = parsed[0] as unknown[];
    expect(row[0]).toBe(1499040000000); // still a safe number
    expect(row[2]).toBe('9007199254740995'); // unsafe → string
  });

  it('does not touch floats, strings, or safe ints', () => {
    const parsed = parseJsonLossless('{"a": 1.5, "b": "9007199254740993", "c": -17}') as Record<string, unknown>;
    expect(parsed.a).toBe(1.5);
    expect(parsed.b).toBe('9007199254740993'); // already a string
    expect(parsed.c).toBe(-17);
  });

  it('the 17-digit odd-integer edge case Number() misclassifies as safe', () => {
    // 10000000000000001 rounds to 1e16 in float — a naive Number-based guard
    // would consider it safe. The BigInt guard must not.
    const parsed = parseJsonLossless('{"v": 10000000000000001}') as Record<string, unknown>;
    expect(parsed.v).toBe('10000000000000001');
  });

  it('negative unsafe integers are also preserved', () => {
    const parsed = parseJsonLossless('{"v": -9007199254740994}') as Record<string, unknown>;
    expect(parsed.v).toBe('-9007199254740994');
  });

  it('normalizeIntStrings converts safe integer-strings back to numbers', () => {
    expect(normalizeIntStrings('9007199254740991')).toBe(9007199254740991);
    expect(normalizeIntStrings('9007199254740993')).toBe('9007199254740993'); // stays a string
    expect(normalizeIntStrings('abc')).toBe('abc');
  });
});

describe('EventBus', () => {
  it('delivers exact-name, prefix-filtered, and wildcard events', () => {
    const bus = new EventBus();
    const exact: string[] = [];
    const prefix: string[] = [];
    const wildcard: string[] = [];
    bus.on('ws.state', (e) => exact.push(e.name));
    bus.on('ws.', (e) => prefix.push(e.name));
    bus.on('*', (e) => wildcard.push(e.name));

    bus.emit('ws.state', { to: 'OPEN' });
    bus.emit('http.request.end', { status: 200 });

    expect(exact).toEqual(['ws.state']);
    expect(prefix).toEqual(['ws.state']);
    expect(wildcard).toEqual(['ws.state', 'http.request.end']);
  });

  it('scoped buses tag events with their scope and bubble to the root', () => {
    const bus = new EventBus();
    const seen: Array<{ scope: string; name: string }> = [];
    bus.on('*', (e) => seen.push({ scope: e.scope, name: e.name }));

    bus.scoped('execution').emit('execution.acked', { intentId: 'i1' });
    bus.scoped('http').emit('http.request.start', { requestId: 1 });

    expect(seen).toEqual([
      { scope: 'execution', name: 'execution.acked' },
      { scope: 'http', name: 'http.request.start' },
    ]);
  });

  it('once() fires a single time and off() removes listeners', () => {
    const bus = new EventBus();
    let onceCount = 0;
    let count = 0;
    const listener = (): void => {
      count += 1;
    };
    bus.once('tick', () => {
      onceCount += 1;
    });
    bus.on('tick', listener);
    bus.emit('tick', {});
    bus.emit('tick', {});
    bus.off('tick', listener);
    bus.emit('tick', {});

    expect(onceCount).toBe(1);
    expect(count).toBe(2);
  });

  it('listener exceptions never break the publisher', () => {
    const bus = new EventBus();
    bus.on('boom', () => {
      throw new Error('listener bug');
    });
    expect(() => bus.emit('boom', {})).not.toThrow();
  });

  it('retains recent history when historySize is set', () => {
    const bus = new EventBus({ historySize: 2 });
    bus.emit('a', { n: 1 });
    bus.emit('b', { n: 2 });
    bus.emit('c', { n: 3 });
    expect(bus.history().map((e) => e.name)).toEqual(['b', 'c']);
    bus.clearHistory();
    expect(bus.history()).toEqual([]);
  });
});
