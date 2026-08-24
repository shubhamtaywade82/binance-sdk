/**
 * Testnet smoke test for the modules added since v1.0.0: COIN-M, Margin, Wallet, Sub-account,
 * Spot WebSocket API, COIN-M WebSocket streams, plus the cross-cutting infra (TradingPolicy,
 * rate-limit tracking, time sync).
 *
 * Unlike `npm run smoke` (public data only, no keys), this exercises signed endpoints against
 * Binance's testnets — so results only matter if the *shapes* the SDK expects still match what
 * Binance actually returns. Zod parsing is the thing under test here, not the trading logic.
 *
 * Binance Spot Testnet and Futures Testnet are separate systems with separate API keys:
 *   - Spot:    https://testnet.binance.vision           -> BINANCE_TESTNET_SPOT_API_KEY/SECRET
 *   - Futures: https://testnet.binancefuture.com         -> BINANCE_TESTNET_FUTURES_API_KEY/SECRET
 *     (the futures testnet account covers both USD-M and COIN-M)
 *
 * Either pair may be omitted; whatever's missing is reported as skipped, not failed.
 *
 * Deliberately NOT exercised, even with keys, even on testnet:
 *   - wallet.withdraw() / margin borrow-repay / subaccount.createVirtualSubAccount() — these
 *     model irreversible or account-mutating actions. Their request shape is covered by unit
 *     tests against mocks; running them for real (even on testnet) buys little and normalizes
 *     running money-movement calls from a smoke script.
 * Order placement IS exercised (that's the point of testnet) but every order is:
 *   - priced far enough from the current market that it cannot fill,
 *   - minimum-size,
 *   - cancelled immediately after the create-order response is validated.
 *
 * Usage:
 *   BINANCE_TESTNET_FUTURES_API_KEY=... BINANCE_TESTNET_FUTURES_API_SECRET=... \
 *   BINANCE_TESTNET_SPOT_API_KEY=... BINANCE_TESTNET_SPOT_API_SECRET=... \
 *   npx tsx scripts/testnet-smoke.ts
 */
import { BinanceClient, DryRunError } from '../src/index.js';

type Status = 'ok' | 'skip' | 'fail';
interface Result {
  name: string;
  status: Status;
  detail?: string;
}

const results: Result[] = [];

async function check(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    results.push({ name, status: 'ok' });
    console.log(`  ok    ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, status: 'fail', detail });
    console.log(`  FAIL  ${name} — ${detail}`);
  }
}

function skip(name: string, reason: string): void {
  results.push({ name, status: 'skip', detail: reason });
  console.log(`  skip  ${name} — ${reason}`);
}

async function waitForOpen(ws: { once: (event: string, cb: (arg?: unknown) => void) => void }, timeoutMs = 8000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no 'open' event within ${timeoutMs}ms`)), timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

async function main(): Promise<void> {
  const futuresApiKey = process.env.BINANCE_TESTNET_FUTURES_API_KEY;
  const futuresApiSecret = process.env.BINANCE_TESTNET_FUTURES_API_SECRET;
  const spotApiKey = process.env.BINANCE_TESTNET_SPOT_API_KEY;
  const spotApiSecret = process.env.BINANCE_TESTNET_SPOT_API_SECRET;

  console.log('== Public market data (no keys) ==');
  const publicClient = new BinanceClient({ testnet: true });
  await check('spot market data (klines)', () => publicClient.spot.market.klines('BTCUSDT', '1m', { limit: 1 }));
  await check('futures market data (klines)', () => publicClient.futures.market.klines('BTCUSDT', '1m', { limit: 1 }));
  await check('coinm market data (klines)', () => publicClient.coinm.market.klines('BTCUSD_PERP', '1m', { limit: 1 }));
  await check('spot ws api (time)', () => publicClient.spot.wsApi.time());

  console.log('\n== Cross-cutting infra ==');
  await check('syncTime()', () => publicClient.syncTime());
  await check('getRateLimitUsage() is callable', async () => {
    publicClient.getRateLimitUsage();
  });
  await check('TradingPolicy dryRun blocks a mutating request', async () => {
    const policyClient = new BinanceClient({
      testnet: true,
      apiKey: 'placeholder',
      apiSecret: 'placeholder',
      safety: { dryRun: true },
    });
    try {
      await policyClient.futures.trading.createOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1,
      });
      throw new Error('order was not blocked by dryRun');
    } catch (err) {
      if (!(err instanceof DryRunError)) throw err;
    }
    policyClient.futures.ws.close();
    policyClient.spot.ws.close();
  });

  if (futuresApiKey && futuresApiSecret) {
    console.log('\n== USD-M + COIN-M Futures (authenticated, testnet.binancefuture.com) ==');
    const client = new BinanceClient({ testnet: true, apiKey: futuresApiKey, apiSecret: futuresApiSecret });

    await check('futures account balance', () => client.futures.account.balance());
    await check('coinm account balance', () => client.coinm.account.balance());
    await check('coinm position risk', () => client.coinm.account.positionRisk());
    await check('coinm leverage brackets', () => client.coinm.account.leverageBrackets());

    await check('futures order round-trip (create + cancel)', async () => {
      const ticker = await client.futures.market.tickerPrice('BTCUSDT');
      const farPrice = Math.floor(ticker.price * 0.5);
      const order = await client.futures.trading.createOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: farPrice,
        quantity: 0.002,
        timeInForce: 'GTC',
      });
      await client.futures.trading.cancelOrder('BTCUSDT', { orderId: order.orderId });
    });

    await check('coinm order round-trip (create + cancel)', async () => {
      const ticker = await client.coinm.market.tickerPrice('BTCUSD_PERP');
      const farPrice = Math.floor(ticker.price * 0.5);
      const order = await client.coinm.trading.createOrder({
        symbol: 'BTCUSD_PERP',
        side: 'BUY',
        type: 'LIMIT',
        price: farPrice,
        quantity: 1,
        timeInForce: 'GTC',
      });
      await client.coinm.trading.cancelOrder('BTCUSD_PERP', { orderId: order.orderId });
    });

    await check('futures user data stream connects', async () => {
      await client.startUserStream();
      await waitForOpen(client.futures.wsUser);
      client.closeUserStream();
    });

    await check('coinm user data stream connects', async () => {
      await client.startCoinMUserStream();
      await waitForOpen(client.coinm.wsUser);
      client.closeCoinMUserStream();
    });

    await check('coinm market ws stream delivers a message', async () => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no message within 8s')), 8000);
        client.coinm.ws.once('message', () => {
          clearTimeout(timer);
          resolve();
        });
        client.coinm.ws.subscribe([client.coinm.ws.markPrice('BTCUSD_PERP', '1s')]);
      });
      client.coinm.ws.close();
    });

    client.futures.ws.close();
    client.spot.ws.close();
  } else {
    skip('futures/coinm authenticated checks', 'set BINANCE_TESTNET_FUTURES_API_KEY/SECRET (register at testnet.binancefuture.com)');
  }

  if (spotApiKey && spotApiSecret) {
    console.log('\n== Spot (authenticated, testnet.binance.vision) ==');
    const client = new BinanceClient({ testnet: true, apiKey: spotApiKey, apiSecret: spotApiSecret });

    await check('spot account', () => client.spot.account.account());

    await check('spot order round-trip (create + cancel)', async () => {
      const ticker = await client.spot.market.tickerPrice('BTCUSDT');
      const farPrice = (ticker.price * 0.5).toFixed(2);
      const order = await client.spot.trading.createOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: farPrice,
        quantity: '0.001',
        timeInForce: 'GTC',
      });
      await client.spot.trading.cancelOrder('BTCUSDT', { orderId: order.orderId });
    });

    await check('spot ws api signed order round-trip', async () => {
      const ticker = await client.spot.market.tickerPrice('BTCUSDT');
      const farPrice = (ticker.price * 0.5).toFixed(2);
      const placed = await client.spot.wsApi.placeOrder({
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: farPrice,
        quantity: '0.001',
        timeInForce: 'GTC',
      });
      const result = placed.result as { orderId?: number } | undefined;
      if (!result?.orderId) throw new Error(`unexpected order.place result: ${JSON.stringify(placed)}`);
      await client.spot.wsApi.cancelOrder({ symbol: 'BTCUSDT', orderId: result.orderId });
    });

    // These three hit /sapi/*, which spot testnet generally does not serve. Reported, not
    // asserted — a clean 404/-2015 here is expected, not a smoke-test failure.
    console.log('\n  (the following are informational: /sapi/* is not expected to be reachable on testnet)');
    await check('margin cross account (informational — likely unsupported on testnet)', () =>
      client.margin.account.crossAccount(),
    );
    await check('wallet deposit history (informational — likely unsupported on testnet)', () =>
      client.wallet.depositHistory(),
    );
    await check('subaccount list (informational — master-account + prod only)', () => client.subaccount.list());

    client.futures.ws.close();
    client.spot.ws.close();
  } else {
    skip('spot/margin/wallet/subaccount authenticated checks', 'set BINANCE_TESTNET_SPOT_API_KEY/SECRET (register at testnet.binance.vision)');
  }

  skip('wallet.withdraw()', 'never exercised by this script — irreversible action; validated by unit tests against mocks only');
  skip('margin.account.borrow()/repay()', 'not exercised — real fund movement; validated by unit tests against mocks only');
  skip('subaccount.createVirtualSubAccount()', 'not exercised — account-mutating; validated by unit tests against mocks only');

  console.log('\n== Summary ==');
  const ok = results.filter((r) => r.status === 'ok').length;
  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip').length;
  console.log(`${ok} ok, ${failed.length} failed, ${skipped} skipped`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
