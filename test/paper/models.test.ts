import { describe, expect, it, vi } from 'vitest';
import {
  BinanceUsdmFeeModel,
  InstantFillModel,
  LatencyModel,
  OrderBookModel,
  PartialFillModel,
  SlippageModel,
  CompositeModel,
  FixedFundingModel,
  LiveFundingModel,
  FixedMaintenanceMarginModel,
  BracketedMaintenanceMarginModel,
  type ExecutionContext,
} from '../../src/paper/models.js';
import { PaperTradingEngine } from '../../src/paper/PaperTradingEngine.js';
import type { FuturesMarket } from '../../src/resources/FuturesMarket.js';

const CTX: ExecutionContext = {
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quantity: 2,
  marketPrice: 100,
};

describe('execution models', () => {
  it('InstantFillModel preserves legacy semantics', () => {
    const quote = new InstantFillModel().quote(CTX);
    expect(quote).toEqual({ fillPrice: 100, filledQuantity: 2, status: 'FILLED' });
  });

  it('SlippageModel worsens fills directionally', async () => {
    const buy = await new SlippageModel(10).quote(CTX); // 10 bps
    expect(buy.fillPrice).toBeCloseTo(100.1, 8);
    const sell = await new SlippageModel(10).quote({ ...CTX, side: 'SELL' });
    expect(sell.fillPrice).toBeCloseTo(99.9, 8);
  });

  it('PartialFillModel caps filled quantity and reports PARTIALLY_FILLED', async () => {
    const model = new PartialFillModel(() => 0.5);
    const quote = await model.quote(CTX);
    expect(quote.filledQuantity).toBe(1);
    expect(quote.status).toBe('PARTIALLY_FILLED');
  });

  it('OrderBookModel walks levels to a VWAP fill', () => {
    const model = new OrderBookModel(() => ({
      bids: [
        { price: 99, quantity: 1 },
        { price: 98, quantity: 5 },
      ],
      asks: [
        { price: 101, quantity: 1 },
        { price: 102, quantity: 5 },
      ],
    }));
    // BUY 3: 1 @ 101 + 2 @ 102 → vwap = (101 + 204) / 3
    const quote = model.quote({ ...CTX, quantity: 3 });
    expect(quote.filledQuantity).toBe(3);
    expect(quote.fillPrice).toBeCloseTo(101.66666666666667, 8);

    // Not enough liquidity: partial fill.
    const partial = model.quote({ ...CTX, quantity: 10 });
    expect(partial.status).toBe('PARTIALLY_FILLED');
    expect(partial.filledQuantity).toBe(6);

    // LIMIT that the book does not cross is rejected.
    const rejected = model.quote({
      ...CTX,
      type: 'LIMIT',
      quantity: 1,
      limitPrice: 100,
    });
    expect(rejected.status).toBe('REJECTED');
  });

  it('LatencyModel delays the quote', async () => {
    const model = new LatencyModel(() => 50);
    const start = Date.now();
    await model.quote(CTX);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it('CompositeModel chains models', async () => {
    const model = new CompositeModel([new SlippageModel(10), new PartialFillModel(() => 0.5)]);
    const quote = await model.quote(CTX);
    expect(quote.filledQuantity).toBe(1); // partial applied to 2
    expect(quote.fillPrice).toBeCloseTo(100.1, 8); // slippage applied first
  });
});

describe('fee models', () => {
  it('BinanceUsdmFeeModel charges taker for MARKET, maker for LIMIT', () => {
    const fees = new BinanceUsdmFeeModel(); // 5 bps taker, 2 bps maker
    const taker = fees.compute(
      { fillPrice: 100, filledQuantity: 2, status: 'FILLED' },
      CTX,
    );
    expect(taker.tier).toBe('taker');
    expect(taker.commission).toBeCloseTo(0.1, 10); // 200 * 0.0005
    const maker = fees.compute(
      { fillPrice: 100, filledQuantity: 2, status: 'FILLED' },
      { ...CTX, type: 'LIMIT' },
    );
    expect(maker.tier).toBe('maker');
    expect(maker.commission).toBeCloseTo(0.04, 10); // 200 * 0.0002
  });
});

describe('PaperTradingEngine integration with models', () => {
  const market = {
    tickerPrice: vi.fn(async () => ({ symbol: 'BTCUSDT', price: 100, time: 0 })),
  } as unknown as FuturesMarket;

  it('defaults preserve legacy instant, fee-free fills', async () => {
    const engine = new PaperTradingEngine({ market, initialBalance: 10_000 });
    const order = await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });
    expect(order.status).toBe('FILLED');
    expect(order.filledQuantity).toBe(1);
    expect(order.commission).toBeUndefined();
    expect(engine.getAccountInfo().balance).toBe(10_000);
  });

  it('slippage + fees flow through to the account', async () => {
    const engine = new PaperTradingEngine({
      market,
      initialBalance: 10_000,
      executionModel: new SlippageModel(10), // +0.1 per unit
      feeModel: new BinanceUsdmFeeModel(), // 5 bps taker
    });
    const order = await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 });
    expect(order.avgFillPrice).toBeCloseTo(100.1, 8);
    expect(order.commission).toBeCloseTo(100.1 * 0.0005, 10);
    expect(engine.getAccountInfo().balance).toBeCloseTo(10_000 - order.commission!, 8);
  });

  it('partial fills only book the filled quantity', async () => {
    const engine = new PaperTradingEngine({
      market,
      initialBalance: 10_000,
      executionModel: new PartialFillModel(() => 0.5),
    });
    const order = await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 2 });
    expect(order.status).toBe('PARTIALLY_FILLED');
    expect(order.filledQuantity).toBe(1);
    expect(engine.getPosition('BTCUSDT')?.quantity).toBe(1);
  });
});

describe('funding models', () => {
  it('FixedFundingModel always returns the configured rate', () => {
    const model = new FixedFundingModel(0.0001);
    expect(model.rateFor({ symbol: 'BTCUSDT', side: 'LONG', quantity: 1, markPrice: 100 })).toBe(0.0001);
  });

  it('LiveFundingModel delegates to premiumIndex().lastFundingRate', async () => {
    const source = { premiumIndex: vi.fn().mockResolvedValue({ lastFundingRate: 0.00025 }) };
    const model = new LiveFundingModel(source);
    const rate = await model.rateFor({ symbol: 'ETHUSDT', side: 'SHORT', quantity: 5, markPrice: 3000 });
    expect(rate).toBe(0.00025);
    expect(source.premiumIndex).toHaveBeenCalledWith('ETHUSDT');
  });
});

describe('liquidation models', () => {
  it('FixedMaintenanceMarginModel applies a flat rate regardless of notional', () => {
    const model = new FixedMaintenanceMarginModel(0.005);
    const mm = model.maintenanceMarginFor({
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryPrice: 100,
      quantity: 10,
      margin: 100,
      markPrice: 100,
    });
    expect(mm).toEqual({ rate: 0.005, amount: 0 });
  });

  it('BracketedMaintenanceMarginModel picks the bracket matching notional', () => {
    const model = new BracketedMaintenanceMarginModel([
      { notionalFloor: 0, notionalCap: 50_000, maintenanceMarginRate: 0.004, maintenanceAmount: 0 },
      { notionalFloor: 50_000, notionalCap: 250_000, maintenanceMarginRate: 0.005, maintenanceAmount: 50 },
      { notionalFloor: 250_000, notionalCap: Infinity, maintenanceMarginRate: 0.01, maintenanceAmount: 1_300 },
    ]);

    // notional = 100 * 100 = 10_000 -> first bracket
    expect(
      model.maintenanceMarginFor({
        symbol: 'BTCUSDT',
        side: 'LONG',
        entryPrice: 100,
        quantity: 100,
        margin: 1_000,
        markPrice: 100,
      }),
    ).toEqual({ rate: 0.004, amount: 0 });

    // notional = 100 * 1000 = 100_000 -> second bracket
    expect(
      model.maintenanceMarginFor({
        symbol: 'BTCUSDT',
        side: 'LONG',
        entryPrice: 100,
        quantity: 1_000,
        margin: 10_000,
        markPrice: 100,
      }),
    ).toEqual({ rate: 0.005, amount: 50 });
  });

  it('BracketedMaintenanceMarginModel falls back to the highest bracket above the top notional cap', () => {
    const model = new BracketedMaintenanceMarginModel([
      { notionalFloor: 0, notionalCap: 50_000, maintenanceMarginRate: 0.004, maintenanceAmount: 0 },
    ]);
    const mm = model.maintenanceMarginFor({
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryPrice: 100,
      quantity: 10_000,
      margin: 1_000_000,
      markPrice: 100,
    });
    expect(mm).toEqual({ rate: 0.004, amount: 0 });
  });
});
