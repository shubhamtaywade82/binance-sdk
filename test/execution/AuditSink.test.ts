import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryAuditSink,
  FanOutAuditSink,
  StreamAuditSink,
  auditRecordFromExecution,
  type AuditRecord,
} from '../../src/execution/AuditSink.js';
import { ExecutionGateway } from '../../src/execution/Gateway.js';
import type { Execution } from '../../src/execution/types.js';

function fakeExecution(overrides: Partial<Execution> = {}): Execution {
  const now = Date.now();
  return {
    intentId: 'i-1',
    clientOrderId: 'nbsdk-abc',
    exchangeOrderId: 42,
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    status: 'FILLED',
    requestedQuantity: '0.01',
    requestedPrice: null,
    executedQuantity: '0.01',
    cumulativeQuoteQuantity: '600',
    averagePrice: '60000',
    fills: [],
    reconciliationState: 'acked',
    submittedAt: now,
    updatedAt: now,
    raw: {},
    ...overrides,
  };
}

describe('AuditSink — InMemoryAuditSink', () => {
  it('appends records and exposes them in order', () => {
    const sink = new InMemoryAuditSink();
    const r1 = auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live');
    const r2 = auditRecordFromExecution(fakeExecution({ intentId: 'i-2' }), 'cancel', 'reconciled', 'paper');
    sink.record(r1);
    sink.record(r2);
    const all = [...sink.records()!];
    expect(all).toHaveLength(2);
    expect(all[0].intentId).toBe('i-1');
    expect(all[1].intentId).toBe('i-2');
  });

  it('never throws when record() is called with a poisoned record', () => {
    const sink = new InMemoryAuditSink();
    // Force an exception inside push by sabotaging the buffer.
    const poisoned = new InMemoryAuditSink();
    (poisoned as unknown as { buffer: AuditRecord[] }).buffer = null as never;
    expect(() => poisoned.record(auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live'))).not.toThrow();
    expect(poisoned.size).toBe(0);
    sink.size; // baseline; never threw on the un-poisoned one
  });

  it('evicts oldest records past capacity', () => {
    const sink = new InMemoryAuditSink(3);
    for (let i = 0; i < 5; i += 1) {
      sink.record(auditRecordFromExecution(fakeExecution({ intentId: `i-${i}` }), 'place', 'acked', 'live'));
    }
    const all = [...sink.records()!];
    expect(all).toHaveLength(3);
    expect(all[0].intentId).toBe('i-2');
    expect(all[2].intentId).toBe('i-4');
  });

  it('clear() empties the buffer', () => {
    const sink = new InMemoryAuditSink();
    sink.record(auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live'));
    expect(sink.size).toBe(1);
    sink.clear!();
    expect(sink.size).toBe(0);
  });
});

describe('AuditSink — FanOutAuditSink', () => {
  it('fans out to every child and survives a failing child', () => {
    const a = new InMemoryAuditSink();
    const b = new InMemoryAuditSink();
    const failing: any = { record: vi.fn(() => { throw new Error('boom'); }) };
    const fan = new FanOutAuditSink([a, failing, b]);
    const r = auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live');
    expect(() => fan.record(r)).not.toThrow();
    expect(a.size).toBe(1);
    expect(b.size).toBe(1);
    expect(failing.record).toHaveBeenCalledTimes(1);
  });

  it('records() merges children, de-duplicating by ts+intentId+action+outcome', () => {
    const a = new InMemoryAuditSink();
    const b = new InMemoryAuditSink();
    const fan = new FanOutAuditSink([a, b]);
    const r = auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live');
    a.record(r);
    b.record(r); // duplicate
    const all = [...fan.records()!];
    expect(all).toHaveLength(1);
  });
});

describe('AuditSink — StreamAuditSink', () => {
  it('writes one JSON line per record to a writable stream', () => {
    const written: string[] = [];
    const stream = { write: (s: string) => { written.push(s); return true; } } as unknown as NodeJS.WritableStream;
    const sink = new StreamAuditSink(stream);
    sink.record(auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live'));
    sink.record(auditRecordFromExecution(fakeExecution({ intentId: 'i-2' }), 'cancel', 'reconciled', 'paper'));
    expect(written).toHaveLength(2);
    expect(written[0].endsWith('\n')).toBe(true);
    const parsed = JSON.parse(written[0]!) as AuditRecord;
    expect(parsed.intentId).toBe('i-1');
    expect(parsed.action).toBe('place');
  });

  it('swallows a stream that has no write() method', () => {
    const broken = {} as NodeJS.WritableStream;
    const sink = new StreamAuditSink(broken);
    expect(() => sink.record(auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live'))).not.toThrow();
  });

  it('honors a custom serializer', () => {
    const written: string[] = [];
    const stream = { write: (s: string) => { written.push(s); return true; } } as unknown as NodeJS.WritableStream;
    const sink = new StreamAuditSink(stream, (r) => `EV ${r.intentId} ${r.action}`);
    sink.record(auditRecordFromExecution(fakeExecution(), 'place', 'acked', 'live'));
    expect(written[0]).toBe('EV i-1 place\n');
  });
});

describe('AuditSink — auditRecordFromExecution', () => {
  it('normalizes a fully acked execution into an audit record', () => {
    const exec = fakeExecution();
    const rec = auditRecordFromExecution(exec, 'place', 'acked', 'live', 'note-here');
    expect(rec.action).toBe('place');
    expect(rec.outcome).toBe('acked');
    expect(rec.backend).toBe('live');
    expect(rec.intentId).toBe(exec.intentId);
    expect(rec.clientOrderId).toBe(exec.clientOrderId);
    expect(rec.exchangeOrderId).toBe(42);
    expect(rec.symbol).toBe('BTCUSDT');
    expect(rec.status).toBe('FILLED');
    expect(rec.reconciliationState).toBe('acked');
    expect(rec.note).toBe('note-here');
    expect(rec.ts).toBe(exec.updatedAt);
  });
});

describe('ExecutionGateway audit wiring (M6)', () => {
  it('default audit sink is an InMemoryAuditSink accessible via gateway.audit', () => {
    // Use a paper-only gateway with a tiny fake live manager to avoid any HTTP.
    const fake: any = {
      placeOrder: vi.fn(async () => fakeExecution()),
      cancelOrder: vi.fn(async () => fakeExecution({ type: 'CANCEL', status: 'CANCELED', reconciliationState: 'reconciled' })),
      reconcile: vi.fn(async () => fakeExecution({ reconciliationState: 'reconciled' })),
      getExecution: vi.fn(() => undefined),
      listExecutions: vi.fn(() => []),
    };
    const gw = new ExecutionGateway({ live: fake });
    expect(gw.audit).toBeInstanceOf(InMemoryAuditSink);

    return gw.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' }).then(() => {
      const records = [...gw.audit.records()!];
      expect(records).toHaveLength(1);
      expect(records[0]!.action).toBe('place');
      expect(records[0]!.outcome).toBe('acked');
      expect(records[0]!.backend).toBe('live');
    });
  });

  it('emits an audit record on a placeOrder transport-error swallow', async () => {
    const fake: any = {
      placeOrder: vi.fn(async () => { throw new Error('network'); }),
      cancelOrder: vi.fn(async () => fakeExecution()),
      reconcile: vi.fn(async () => fakeExecution()),
      getExecution: vi.fn(() => undefined),
      listExecutions: vi.fn(() => []),
    };
    const sink = new InMemoryAuditSink();
    const gw = new ExecutionGateway({ live: fake, audit: sink });
    await expect(
      gw.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' }),
    ).rejects.toThrow('network');
    const records = [...sink.records()!];
    expect(records).toHaveLength(1);
    expect(records[0]!.outcome).toBe('transport-error');
    expect(records[0]!.note).toContain('network');
  });

  it('emits an audit record on cancel', async () => {
    const fake: any = {
      placeOrder: vi.fn(),
      cancelOrder: vi.fn(async () => fakeExecution({ type: 'CANCEL', status: 'CANCELED', reconciliationState: 'reconciled' })),
      reconcile: vi.fn(),
      getExecution: vi.fn(() => undefined),
      listExecutions: vi.fn(() => []),
    };
    const sink = new InMemoryAuditSink();
    const gw = new ExecutionGateway({ live: fake, audit: sink });
    await gw.cancelOrder('BTCUSDT');
    const records = [...sink.records()!];
    expect(records).toHaveLength(1);
    expect(records[0]!.action).toBe('cancel');
    expect(records[0]!.outcome).toBe('reconciled');
  });

  it('emits an audit record on reconcile (success and failure)', async () => {
    const fake: any = {
      placeOrder: vi.fn(),
      cancelOrder: vi.fn(),
      reconcile: vi.fn(async (id: string) => {
        if (id === 'bad') throw new Error('reconcile-failed');
        return fakeExecution({ intentId: id, reconciliationState: 'reconciled' });
      }),
      getExecution: vi.fn(() => undefined),
      listExecutions: vi.fn(() => []),
    };
    const sink = new InMemoryAuditSink();
    const gw = new ExecutionGateway({ live: fake, audit: sink });
    await gw.reconcile('good');
    await expect(gw.reconcile('bad')).rejects.toThrow('reconcile-failed');
    const records = [...sink.records()!];
    expect(records).toHaveLength(2);
    expect(records[0]!.action).toBe('reconcile');
    expect(records[0]!.outcome).toBe('reconciled');
    expect(records[1]!.action).toBe('reconcile');
    expect(records[1]!.outcome).toBe('unknown');
    expect(records[1]!.note).toContain('reconcile-failed');
  });

  it('a throwing audit sink never breaks trading', async () => {
    const fake: any = {
      placeOrder: vi.fn(async () => fakeExecution()),
      cancelOrder: vi.fn(),
      reconcile: vi.fn(),
      getExecution: vi.fn(() => undefined),
      listExecutions: vi.fn(() => []),
    };
    const exploding: AuditSink = {
      record: () => { throw new Error('audit-down'); },
    };
    const gw = new ExecutionGateway({ live: fake, audit: exploding });
    const exec = await gw.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01' });
    expect(exec.status).toBe('FILLED');
  });
});
