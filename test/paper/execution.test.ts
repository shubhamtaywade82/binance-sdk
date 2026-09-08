import { describe, expect, it } from 'vitest';
import {
  InstantFillModel,
  NoFeeModel,
  PaperTradingEngine,
  SlippageExecutionModel,
  TakerMakerFeeModel,
} from '../../src/paper/PaperTradingEngine.js';
import type { PaperOrderRequest } from '../../src/paper/execution.js';

const MARKET = 60_000;

function mockMarket(price = MARKET): { market: never } {
  return { market: { tickerPrice: async () => ({ symbol: 'BTCUSDT', price }) } as never };
}

describe('execution models', () => {
  const request: PaperOrderRequest = {
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    quantity: 1,
    leverage: 1,
  };

  it('InstantFillModel fills MARKET at the mark and LIMIT at the limit', () => {
    const model = new InstantFillModel();
    expect(model.fill(request, { marketPrice: MARKET }).avgPrice).toBe(MARKET);
    expect(model.fill({ ...request, type: 'LIMIT', limitPrice: 59_000 }, { marketPrice: MARKET }).avgPrice).toBe(59_000);
  });

  it('SlippageExecutionModel worsens MARKET fills by the configured bps', () => {
    const model = new SlippageExecutionModel({ marketSlippageBps: 10 }); // 0.1%
    const buy = model.fill(request, { marketPrice: MARKET });
    expect(buy.avgPrice).toBeCloseTo(MARKET * 1.001, 6);
    expect(buy.liquidity).toBe('taker');

    const sell = model.fill({ ...request, side: 'SELL' }, { marketPrice: MARKET });
    expect(sell.avgPrice).toBeCloseTo(MARKET * 0.999, 6);
  });

  it('SlippageExecutionModel never fills a marketable limit beyond its limit price', () => {
    const model = new SlippageExecutionModel({ marketSlippageBps: 50 });
    // Buy limit above the market: slipped mark would be 60030, but capped at 60010.
    const fill = model.fill(
      { ...request, type: 'LIMIT', limitPrice: 60_010 },
      { marketPrice: MARKET },
    );
    expect(fill.avgPrice).toBe(60_010);
    expect(fill.liquidity).toBe('taker');

    // Non-marketable limit rests as maker at its own price.
    const resting = model.fill(
      { ...request, type: 'LIMIT', limitPrice: 59_000 },
      { marketPrice: MARKET },
    );
    expect(resting.avgPrice).toBe(59_000);
    expect(resting.liquidity).toBe('maker');
  });

  it('rejects negative slippage configuration', () => {
    expect(() => new SlippageExecutionModel({ marketSlippageBps: -1 })).toThrow();
  });

  it('TakerMakerFeeModel charges bps of notional per liquidity type', () => {
    const model = new TakerMakerFeeModel({ takerFeeBps: 4.5, makerFeeBps: 2 });
    const takerFee = model.computeFee({ avgPrice: 100, quantity: 2, liquidity: 'taker', model: 'x' }, request);
    expect(takerFee).toBeCloseTo((200 * 4.5) / 10_000, 10);

    const makerFee = model.computeFee({ avgPrice: 100, quantity: 2, liquidity: 'maker', model: 'x' }, request);
    expect(makerFee).toBeCloseTo((200 * 2) / 10_000, 10);
  });
});

describe('PaperTradingEngine with models', () => {
  it('defaults preserve the legacy instant-fill, no-fee behavior', async () => {
    const engine = new PaperTradingEngine({ ...mockMarket() });
    const order = await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.01 });
    expect(order.avgFillPrice).toBe(MARKET);
    expect(order.fee).toBe(0);
    expect(engine.getAccountInfo().totalFees).toBe(0);
    expect(order.executionModel).toBe('instant');
  });

  it('applies slippage and fees to the account when models are provided', async () => {
    const engine = new PaperTradingEngine({
      ...mockMarket(),
      executionModel: new SlippageExecutionModel({ marketSlippageBps: 10 }),
      feeModel: new TakerMakerFeeModel({ takerFeeBps: 4, makerFeeBps: 2 }),
    });
    const order = await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.1 });

    // Fill at mark + 10bps.
    expect(order.avgFillPrice).toBeCloseTo(MARKET * 1.001, 6);
    // Fee = notional * 4bps.
    const expectedFee = (order.avgFillPrice * 0.1 * 4) / 10_000;
    expect(order.fee).toBeCloseTo(expectedFee, 10);
    expect(order.executionModel).toBe('slippage');

    const account = engine.getAccountInfo();
    expect(account.totalFees).toBeCloseTo(expectedFee, 10);
    // Balance: 10000 initial, no PnL yet (position open), fee deducted.
    expect(account.balance).toBeCloseTo(10_000 - expectedFee, 8);
    expect(account.availableBalance).toBeCloseTo(10_000 - expectedFee - (order.avgFillPrice * 0.1), 8);
  });

  it('closes a round trip and books fees against realized PnL accounting', async () => {
    const engine = new PaperTradingEngine({
      ...mockMarket(),
      executionModel: new InstantFillModel(),
      feeModel: new TakerMakerFeeModel({ takerFeeBps: 4, makerFeeBps: 2 }),
    });
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 0.1 });
    await engine.placeOrder({ symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: 0.1 });

    const account = engine.getAccountInfo();
    // Instant fill at the same price both ways → zero PnL, fees on both legs.
    expect(account.realizedPnl).toBe(0);
    expect(account.balance).toBeLessThan(10_000);
    expect(account.balance).toBeCloseTo(10_000 - account.totalFees, 8);
  });
});
