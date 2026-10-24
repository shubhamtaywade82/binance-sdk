/**
 * Example: using the new Wave 5-8 Binance product surfaces.
 *
 * Run: npx tsx examples/new-products.ts
 *
 * Requires BINANCE_API_KEY and BINANCE_API_SECRET environment variables.
 * Public market-data calls work without credentials.
 */
import { BinanceClient } from '../src/index.js';

const client = new BinanceClient({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
});

async function main(): Promise<void> {
  console.log('=== Binance SDK — New Product Surfaces (Waves 5-8) ===\n');

  // --- Options (Wave 2 + Wave 8 WS) ---
  console.log('Options:');
  const optInfo = await client.options.market.exchangeInfo();
  console.log('  exchangeInfo:', (optInfo as { optionSymbols?: unknown[] })?.optionSymbols?.length, 'symbols');

  // --- Portfolio Margin (Wave 3 + Wave 8 WS) ---
  // Requires PM-enabled API key.
  // const pmAccount = await client.portfolioMargin.account.account();
  // console.log('PM account:', pmAccount);

  // --- Simple Earn (Wave 5) ---
  // const flexibleProducts = await client.simpleEarn.simpleEarn.flexibleProductList();
  // console.log('Simple Earn flexible products:', flexibleProducts);

  // --- Staking (Wave 5) ---
  // const stakingAccount = await client.staking.staking.onChainYieldsAccountUserData();
  // console.log('Staking account:', stakingAccount);

  // --- VIP Loan (Wave 5) ---
  // const vipLoans = await client.vipLoan.vipLoan.queryOngoingOrders();
  // console.log('VIP Loan ongoing:', vipLoans);

  // --- Fiat (Wave 5) ---
  // const fiatHistory = await client.fiat.fiat.getFiatDepositWithdrawHistoryUserData({ transactionType: 0 });
  // console.log('Fiat history:', fiatHistory);

  // --- Wallet Wave 6 ---
  const status = await client.walletWave6.systemStatusSystem();
  console.log('Wallet system status:', status);

  // --- Options WebSocket (Wave 8) ---
  // const ws = client.options.ws;
  // await ws.subscribe([ws.trade('BTC-240329-50000-C')]);
  // ws.on('message', (payload) => console.log('options trade:', payload));

  // --- MCP Tools (Wave 9) ---
  // import { createFuturesToolkit } from '../src/index.js';
  // const toolkit = createFuturesToolkit(client);
  // console.log('MCP tools:', toolkit.newProducts.length, 'new product tools');
  // const openai = toolkitToFormats(toolkit).openai;
  // console.log('OpenAI tool count:', openai.length);

  console.log('\nDone. Uncomment the signed endpoints above to test with your API key.');
  client.closeAllWebSockets();
}

main().catch(console.error);
