import { BinanceClient } from '../src/index.js';

async function main(): Promise<void> {
  const client = new BinanceClient();

  client.futures.ws.on('message', (stream: string, payload: unknown) => {
    // Tainted `stream` must not flow into the format-string (first) argument.
    console.log('[%s] %s:', new Date().toISOString(), stream, JSON.stringify(payload));
  });
  client.futures.ws.subscribe(['btcusdt@aggTrade', 'btcusdt@markPrice@1s', 'btcusdt@depth20']);

  client.futures.wsUser.on('message', (event: unknown) => {
    console.log('user event:', JSON.stringify(event));
  });

  console.log('Subscribed to btcusdt streams. Press Ctrl+C to exit.');
  await new Promise(() => {
    /* keep alive until killed */
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
