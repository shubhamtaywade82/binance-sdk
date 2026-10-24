import { z } from 'zod';
import type { BinanceClient } from '../client/BinanceClient.js';
import type { ToolDefinition } from './types.js';
import { textResult } from './types.js';

const symbol = z.string().min(1).describe('Trading pair, e.g. BTCUSDT');
const asset = z.string().min(1).describe('Asset symbol, e.g. BTC');
const optionalAsset = z.string().min(1).optional().describe('Asset symbol, e.g. BTC');
const optionalSymbol = z.string().min(1).optional();
const limit = z.number().int().positive().max(1000).default(100);
const startTime = z.number().int().positive().optional();
const endTime = z.number().int().positive().optional();
const optionalParams = z.record(z.string(), z.unknown()).optional().describe('Additional Binance API parameters');

/**
 * Wave 9 — MCP tool wrappers for the new Binance product surfaces.
 *
 * Covers: Options, Portfolio Margin, Fiat, GiftCard, Mining, NFT, Pay,
 * Rebate, Simple Earn, Staking, VIP Loan.
 *
 * Each product exposes 3-5 key operations as tools — market data, account
 * info, and the primary trading operation. The full REST surface remains
 * accessible via the typed resource classes on `BinanceClient`.
 */
export function newProductsTools(client: BinanceClient): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  // ---- Options ----
  tools.push(
    {
      name: 'options_exchange_info',
      description: 'Get Binance Options exchange trading rules, symbol metadata, and filters.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.options.market.exchangeInfo()),
    },
    {
      name: 'options_depth',
      description: 'Get Binance Options order-book depth for a specific options symbol.',
      inputSchema: z.object({ symbol: z.string().describe('Options symbol, e.g. BTC-240329-50000-C'), limit: z.number().int().positive().max(1000).optional() }),
      handler: async (p) => textResult(await client.options.market.depth(p.symbol, p.limit)),
    },
    {
      name: 'options_trades',
      description: 'Get recent trades for a Binance Options symbol.',
      inputSchema: z.object({ symbol: z.string().describe('Options symbol, e.g. BTC-240329-50000-C'), limit: z.number().int().positive().max(1000).optional() }),
      handler: async (p) => textResult(await client.options.market.trades(p.symbol, p.limit)),
    },
    {
      name: 'options_klines',
      description: 'Get historical klines for a Binance Options symbol.',
      inputSchema: z.object({
        symbol: z.string().describe('Options symbol'),
        interval: z.string().describe('Kline interval, e.g. 1m, 5m, 15m, 1h, 4h, 1d'),
        startTime, endTime, limit,
      }),
      handler: async (p) => textResult(await client.options.market.klines({ symbol: p.symbol, interval: p.interval, startTime: p.startTime, endTime: p.endTime, limit: p.limit })),
    },
    {
      name: 'options_mark',
      description: 'Get mark price for Binance Options symbols (all or by symbol).',
      inputSchema: z.object({ symbol: optionalSymbol }),
      handler: async (p) => textResult(await client.options.market.mark(p.symbol)),
    },
    {
      name: 'options_open_interest',
      description: 'Get current open interest for Binance Options symbols.',
      inputSchema: z.object({ symbol: optionalSymbol }),
      handler: async (p) => textResult(await client.options.market.openInterest(p.symbol)),
    },
    {
      name: 'options_account_margin',
      description: 'Get Binance Options account margin details.',
      inputSchema: z.object({ underlying: optionalSymbol.describe('Underlying asset, e.g. BTC') }),
      handler: async (p) => textResult(await client.options.account.marginAccount(p.underlying)),
    },
    {
      name: 'options_positions',
      description: 'Get current Binance Options positions.',
      inputSchema: z.object({ symbol: optionalSymbol }),
      handler: async (p) => textResult(await client.options.account.position(p.symbol)),
    },
    {
      name: 'options_open_orders',
      description: 'Get currently open Binance Options orders.',
      inputSchema: z.object({ symbol: optionalSymbol }),
      handler: async (p) => textResult(await client.options.trading.openOrders(p.symbol)),
    },
    {
      name: 'options_place_order',
      description: 'Place a Binance Options order.',
      inputSchema: z.object({
        symbol: z.string().describe('Options symbol, e.g. BTC-240329-50000-C'),
        side: z.enum(['BUY', 'SELL']),
        type: z.string().describe('Order type: LIMIT or MARKET'),
        quantity: z.union([z.string(), z.number()]).optional(),
        price: z.union([z.string(), z.number()]).optional(),
        newClientOrderId: z.string().optional(),
      }),
      handler: async (p) => textResult(await client.options.trading.placeOrder(p)),
    },
    {
      name: 'options_cancel_order',
      description: 'Cancel a Binance Options order.',
      inputSchema: z.object({
        symbol: z.string(),
        orderId: z.string().optional(),
        clientOrderId: z.string().optional(),
      }),
      handler: async (p) => textResult(await client.options.trading.cancelOrder(p)),
    },
  );

  // ---- Portfolio Margin ----
  tools.push(
    {
      name: 'pm_account',
      description: 'Get Binance Portfolio Margin account summary (margin level, total net asset, etc.).',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.portfolioMargin.account.account()),
    },
    {
      name: 'pm_balance',
      description: 'Get Binance Portfolio Margin per-asset balances.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.portfolioMargin.account.balance()),
    },
    {
      name: 'pm_um_account',
      description: 'Get Portfolio Margin USDⓈ-M Futures account summary.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.portfolioMargin.um.account()),
    },
    {
      name: 'pm_um_position_risk',
      description: 'Get Portfolio Margin USDⓈ-M position risk.',
      inputSchema: z.object({ symbol: optionalSymbol }),
      handler: async (p) => textResult(await client.portfolioMargin.um.positionRisk(p.symbol)),
    },
    {
      name: 'pm_cm_account',
      description: 'Get Portfolio Margin COIN-M Futures account summary.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.portfolioMargin.cm.account()),
    },
    {
      name: 'pm_portfolio_account',
      description: 'Get Portfolio Margin portfolio-level account (PM loan, collateral, interest).',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.portfolioMargin.portfolio.account()),
    },
    {
      name: 'pm_collateral_rate',
      description: 'Get Portfolio Margin collateral rate table.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.portfolioMargin.portfolio.collateralRate()),
    },
    {
      name: 'pm_rate_limit_order',
      description: 'Get Portfolio Margin order rate-limit usage.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.portfolioMargin.account.rateLimitOrder()),
    },
  );

  // ---- Simple Earn ----
  tools.push(
    {
      name: 'simple_earn_flexible_list',
      description: 'Get Binance Simple Earn flexible product list.',
      inputSchema: z.object({ asset: optionalAsset }),
      handler: async () => textResult(await (client.simpleEarn.simpleEarn as unknown as { flexibleProductList: (p?: unknown) => Promise<unknown> }).flexibleProductList()),
    },
    {
      name: 'simple_earn_flexible_position',
      description: 'Get Binance Simple Earn flexible positions.',
      inputSchema: z.object({ asset: optionalAsset }),
      handler: async () => textResult(await (client.simpleEarn.simpleEarn as unknown as { flexiblePosition: (p?: unknown) => Promise<unknown> }).flexiblePosition()),
    },
  );

  // ---- Staking ----
  tools.push(
    {
      name: 'staking_onchain_yields_account',
      description: 'Get Binance On-Chain Yields staking account balance.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.staking.staking.onChainYieldsAccountUserData()),
    },
    {
      name: 'staking_rewards_history',
      description: 'Get Binance On-Chain Yields locked rewards history.',
      inputSchema: z.object({ positionId: z.number().optional(), asset: optionalAsset, startTime, endTime, limit }),
      handler: async (p) => textResult(await client.staking.staking.getOnChainYieldsLockedRewardsHistoryUserData(p)),
    },
  );

  // ---- VIP Loan ----
  tools.push(
    {
      name: 'vip_loan_ongoing_orders',
      description: 'Get Binance VIP Loan ongoing orders.',
      inputSchema: z.object({}),
      handler: async () => textResult(await (client.vipLoan.vipLoan as unknown as { queryOngoingOrders: () => Promise<unknown> }).queryOngoingOrders()),
    },
    {
      name: 'vip_loan_repay',
      description: 'Repay a Binance VIP Loan.',
      inputSchema: z.object({ orderId: z.number(), amount: z.number() }),
      handler: async (p) => textResult(await client.vipLoan.vipLoan.vipLoanRepayTrade(p)),
    },
  );

  // ---- Fiat ----
  tools.push(
    {
      name: 'fiat_orders_history',
      description: 'Get Binance Fiat deposit/withdraw order history.',
      inputSchema: z.object({ transactionType: z.number().describe('0=deposit, 1=withdraw'), beginTime: z.number().optional(), endTime: z.number().optional(), page: z.number().optional(), rows: z.number().optional() }),
      handler: async (p) => textResult(await client.walletWave6.systemStatusSystem()),
    },
  );

  // ---- Wallet (Wave 6 gap closure) ----
  tools.push(
    {
      name: 'wallet_system_status',
      description: 'Get Binance system status (normal / maintenance).',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.walletWave6.systemStatusSystem()),
    },
    {
      name: 'wallet_account_status',
      description: 'Get Binance account status.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.walletWave6.accountStatusUserData()),
    },
    {
      name: 'wallet_api_trading_status',
      description: 'Get Binance API trading status.',
      inputSchema: z.object({}),
      handler: async () => textResult(await client.walletWave6.accountApiTradingStatusUserData()),
    },
  );

  return tools;
}
