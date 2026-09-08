import { BinanceClient } from '../src/index.js';

async function main(): Promise<void> {
  const client = new BinanceClient();

  const klines = await client.spot.market.klines('BTCUSDT', '15m', { limit: 5 });
  console.log(`Spot BTCUSDT klines: ${klines.length} candles, last close ${klines.at(-1)?.close}`);

  const funding = await client.futures.data.fundingRateHistory('BTCUSDT', { limit: 1 });
  console.log(`Futures BTCUSDT last funding rate: ${funding[0]?.fundingRate}`);

  const oi = await client.futures.data.openInterest('BTCUSDT');
  console.log(`Futures BTCUSDT open interest: ${oi.openInterest}`);

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('WS: no message received within 10s (outbound WS may be blocked in this network)');
      resolve();
    }, 10_000);

    client.futures.ws.once('message', (stream: string, payload: unknown) => {
      clearTimeout(timeout);
      // Tainted `stream` must not flow into the format-string (first) argument.
      console.log('WS message on %s:', stream, payload);
      resolve();
    });
    client.futures.ws.subscribe([client.futures.ws.markPrice('BTCUSDT', '1s')]);
  });

  client.futures.ws.close();
  client.spot.ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
