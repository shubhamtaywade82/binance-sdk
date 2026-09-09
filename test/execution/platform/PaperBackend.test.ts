import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CoreContext } from '../../../src/core/context.js';
import { createPaperExecutionPlatform } from '../../../src/execution/platform/PaperBackend.js';
import { PaperSession, decimalString } from '../../../src/execution/platform/PaperSession.js';
import { PaperExecutionAdapter } from '../../../src/execution/paper.js';
import { PaperTradingEngine } from '../../../src/paper/PaperTradingEngine.js';

const server = setupServer();
beforeAll(() =>
  server.listen({
    onUnhandledRequest: (request, print) => {
      if (request.url.startsWith('http://127.0.0.1')) return;
      print.error();
    },
  }),
);
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const TICKER = 'https://fapi.binance.com/fapi/v1/ticker/price';

function mockTicker(price: string): void {
  server.use(http.get(TICKER, () => HttpResponse.json({ symbol: 'BTCUSDT', price, time: 1 })));
}

function mockTickerFor(prices: Record<string, string>): void {
  server.use(
    http.get(TICKER, ({ request }) => {
      const symbol = new URL(request.url).searchParams.get('symbol') ?? '';
      return HttpResponse.json({ symbol, price: prices[symbol] ?? '42000', time: 1 });
    }),
  );
}

function paperCore(): CoreContext {
  return new CoreContext({ apiKey: 'k', apiSecret: 's' });
}

describe('createPaperExecutionPlatform (paper behind the platform boundary)', () => {
  it('assembles engine + adapter + manager + platform over one shared core', () => {
    const core = paperCore();
    const paper = createPaperExecutionPlatform(core, { initialBalance: 25_000 });
    expect(paper.platform.isPaper).toBe(true);
    expect(paper.platform.product).toBe('usdm');
    expect(paper.engine.getAccountInfo().balance).toBe(25_000);
    expect(paper.adapter.simulator).toBe(paper.engine);
    // The price feed rides the shared transports (same env, same mocks).
    expect(core.hasHttp('fapi')).toBe(true);
  });

  it('startUserSession opens a local session with zero network', async () => {
    const paper = createPaperExecutionPlatform(paperCore());
    const session = await paper.platform.startUserSession();
    expect(session).toBeInstanceOf(PaperSession);
    expect(session.sessionState).toBe('live');
    expect(session.listenKey).toBeNull();
    expect(paper.platform.userSession).toBe(session);
    expect(paper.platform.liveUserSession).toBeNull();
    // Idempotent.
    await expect(paper.platform.startUserSession()).resolves.toBe(session);
    paper.platform.close();
    expect(session.sessionState).toBe('closed');
  });

  it('a paper fill folds into the trackers exactly like a live fill', async () => {
    mockTicker('42000');
    const paper = createPaperExecutionPlatform(paperCore());
    await paper.platform.startUserSession();

    const fill = await paper.execution.placeOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: '0.01',
    });
    expect(fill.status).toBe('FILLED');
    expect(fill.executedQuantity).toBe('0.01');

    // The session folded the fill before placeOrder resolved — the tracker
    // record is already terminal, with the exact same fields a live
    // ORDER_TRADE_UPDATE fold would produce.
    const record = paper.platform.orders.get(fill.clientOrderId);
    expect(record).toBeDefined();
    expect(record?.symbol).toBe('BTCUSDT');
    expect(record?.side).toBe('BUY');
    expect(record?.type).toBe('MARKET');
    expect(record?.status).toBe('FILLED');
    expect(record?.executedQuantity).toBe('0.01');
    expect(record?.originalQuantity).toBe('0.01');
    expect(record?.averagePrice).toBe('42000');
    expect(record?.fills).toHaveLength(1);
    expect(record?.fills[0].price).toBe('42000');
    expect(record?.fills[0].quantity).toBe('0.01');

    await expect(paper.platform.orders.waitForTerminal(fill.clientOrderId, 50)).resolves.toBeDefined();

    // Position feed: signed one-way amount, decimal strings.
    const position = paper.platform.positions.get('BTCUSDT');
    expect(position).toBeDefined();
    expect(position?.positionSide).toBe('BOTH');
    expect(position?.positionAmount).toBe('0.01');
    expect(position?.entryPrice).toBe('42000');

    // The intent ledger (a different listener on the same reports) agrees.
    const ledger = paper.execution.getExecution(fill.intentId);
    expect(ledger?.status).toBe('FILLED');
    expect(ledger?.fills).toHaveLength(1);
    paper.platform.close();
  });

  it('selling to flat folds the position to zero; a short folds negative', async () => {
    mockTickerFor({ BTCUSDT: '42000' });
    const paper = createPaperExecutionPlatform(paperCore());
    await paper.platform.startUserSession();

    const open = await paper.execution.placeOrder({
      symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.02',
    });
    expect(paper.platform.positions.get('BTCUSDT')?.positionAmount).toBe('0.02');

    await paper.execution.placeOrder({
      symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.02',
    });
    expect(paper.platform.positions.get('BTCUSDT')?.positionAmount).toBe('0');
    expect(paper.platform.positions.nonZero()).toHaveLength(0);

    // A fresh short: signed negative amount, like Binance reports it.
    await paper.execution.placeOrder({
      symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.005',
    });
    expect(paper.platform.positions.get('BTCUSDT')?.positionAmount).toBe('-0.005');
    paper.platform.close();
  });

  it('session fold events carry exchange-shaped frames (userData contract)', async () => {
    mockTicker('42000');
    const engine = new PaperTradingEngine();
    const adapter = new PaperExecutionAdapter(engine);
    const session = new PaperSession({ engine, adapter });
    await session.start();

    const frames: Record<string, unknown>[] = [];
    session.on('userData', (event) => frames.push(event as Record<string, unknown>));
    // Drive a fill through the adapter (the manager-less path).
    await adapter.createOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.01,
      newClientOrderId: 'paper-direct-1',
    });

    expect(frames).toHaveLength(2);
    const orderFrame = frames[0] as { e: string; o: Record<string, unknown> };
    expect(orderFrame.e).toBe('ORDER_TRADE_UPDATE');
    expect(orderFrame.o.c).toBe('paper-direct-1');
    expect(orderFrame.o.s).toBe('BTCUSDT');
    expect(orderFrame.o.X).toBe('FILLED');
    expect(orderFrame.o.z).toBe('0.01');

    const accountFrame = frames[1] as { e: string; a: { P: Record<string, unknown>[] } };
    expect(accountFrame.e).toBe('ACCOUNT_UPDATE');
    expect(accountFrame.a.P[0].s).toBe('BTCUSDT');
    expect(accountFrame.a.P[0].ps).toBe('BOTH');
    expect(accountFrame.a.P[0].pa).toBe('0.01');
    expect(accountFrame.a.P[0].ep).toBe('42000');
    session.close();
  });

  it('paper adapter reports fan out to every listener (ledger + session)', async () => {
    mockTicker('42000');
    const engine = new PaperTradingEngine();
    const adapter = new PaperExecutionAdapter(engine);
    const first: number[] = [];
    const second: number[] = [];
    adapter.onReport((report) => first.push(report.orderId ?? 0));
    adapter.onReport((report) => second.push(report.orderId ?? 0));

    await adapter.createOrder({
      symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01, newClientOrderId: 'x-1',
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toBe(second[0]);
  });

  it('closes cleanly: session terminal, idempotent, engine state preserved', async () => {
    mockTicker('42000');
    const paper = createPaperExecutionPlatform(paperCore());
    await paper.platform.startUserSession();
    const session = paper.platform.userSession;
    await paper.execution.placeOrder({
      symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '0.01',
    });

    paper.platform.close();
    paper.platform.close(); // idempotent
    expect(session?.sessionState).toBe('closed');
    // Tracker records and simulation state survive the close.
    expect(paper.platform.orders.size).toBe(1);
    expect(paper.engine.getOpenPositions()).toHaveLength(1);
  });
});

describe('decimalString (simulator boundary formatting)', () => {
  it('strips IEEE-754 representation noise at twelve significant digits', () => {
    expect(decimalString(0.1 + 0.2)).toBe('0.3');
    expect(decimalString(0.30000000000000004)).toBe('0.3');
    expect(decimalString(1234.567890123456)).toBe('1234.56789012');
    expect(decimalString(-0.005)).toBe('-0.005');
    expect(decimalString(42)).toBe('42');
    expect(decimalString(Number.NaN)).toBe('0');
  });
});
