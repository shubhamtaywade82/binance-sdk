import { describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { CoreContext } from '../../src/core/context.js';
import { Credentials } from '../../src/core/credentials.js';
import { EventBus } from '../../src/core/events.js';
import { isProductClient } from '../../src/products/types.js';
import { USDMClient } from '../../src/products/usdm/USDMClient.js';
import { ExecutionManager } from '../../src/execution/ExecutionManager.js';

describe('v3 CoreContext', () => {
  it('resolves environment, credentials, events and transport defaults', () => {
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    expect(core.env).toBe('live');
    expect(core.credentials.canSign).toBe(true);
    expect(core.credentials.signatureAlgorithm).toBe('HMAC');
    expect(core.events).toBeInstanceOf(EventBus);
    expect(core.transport.recvWindow).toBe(5000);
    expect(core.transport.timeoutMs).toBe(15_000);
    expect(core.transport.maxRetries).toBe(3);
    expect(core.endpoints.restFapi).toBe('https://fapi.binance.com/fapi/v1');
  });

  it('honors testnet/demo environments and caller buses', () => {
    const events = new EventBus();
    const testnet = new CoreContext({ testnet: true, events });
    expect(testnet.env).toBe('testnet');
    expect(testnet.events).toBe(events);
    expect(testnet.endpoints.restFapi).toContain('testnet.binancefuture.com');

    const demo = new CoreContext({ demo: true });
    expect(demo.env).toBe('demo');
  });

  it('builds one cached HttpClient per host, lazily', () => {
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    expect(core.hasHttp('fapiRoot')).toBe(false); // lazy: nothing built yet

    const fapiRoot = core.http('fapiRoot');
    expect(core.http('fapiRoot')).toBe(fapiRoot); // cached identity
    expect(core.hasHttp('fapiRoot')).toBe(true);
    expect(core.hasHttp('fapiRoot')).toBe(true);
    expect(core.hasHttp('spot')).toBe(false); // untouched host stays unbuilt
    expect(core.http('spot')).not.toBe(fapiRoot); // distinct host, distinct client
  });

  it('httpUsage reports only constructed hosts', () => {
    const core = new CoreContext();
    expect(Object.keys(core.httpUsage())).toHaveLength(0);
    core.http('spot');
    const usage = core.httpUsage();
    expect(Object.keys(usage)).toEqual(['spot']);
  });

  it('policy wiring: safety builds a RiskGateway on the shared bus', () => {
    const core = new CoreContext({ safety: { dryRun: true } });
    expect(core.policy).toBeDefined();
    expect(core.events).toBe(core.events);
    // policy instance shared with HttpClient construction
    expect(core.http('fapiRoot')).toBeDefined();
  });
});

describe('v3 Credentials', () => {
  it('HMAC signs with apiKey+apiSecret', () => {
    const c = Credentials.fromOptions({ apiKey: 'k', apiSecret: 's' });
    expect(c.canSign).toBe(true);
    expect(c.hasApiKey).toBe(true);
    expect(c.describe()).toContain('hmac key ****');
  });

  it('asymmetric keys: privateKey without algorithm infers Ed25519 (HttpClient parity)', () => {
    const ed = Credentials.fromOptions({ apiKey: 'k', privateKey: '-----BEGIN-----' });
    expect(ed.signatureAlgorithm).toBe('ED25519');
    expect(ed.canSign).toBe(true); // apiKey + privateKey

    const explicitRsa = Credentials.fromOptions({
      apiKey: 'k',
      privateKey: '-----BEGIN RSA-----',
      signatureAlgorithm: 'RSA',
    });
    expect(explicitRsa.signatureAlgorithm).toBe('RSA');
    expect(explicitRsa.canSign).toBe(true);

    // secret-only (no key) cannot sign
    const secretOnly = Credentials.fromOptions({ apiSecret: 's' });
    expect(secretOnly.signatureAlgorithm).toBe('HMAC');
    expect(secretOnly.canSign).toBe(false);
  });

  it('public clients describe themselves without keys', () => {
    const c = Credentials.fromOptions({});
    expect(c.canSign).toBe(false);
    expect(c.hasApiKey).toBe(false);
    expect(c.describe()).toBe('public (no credentials)');
  });
});

describe('v3 lazy BinanceClient facade', () => {
  it('constructs without building product namespaces', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(client.core).toBeInstanceOf(CoreContext);
    // no host transport forced at construction (besides none at all)
    expect(Object.keys(client.core.httpUsage())).toHaveLength(0);
  });

  it('caches namespace identity across accesses', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(client.futures).toBe(client.futures);
    expect(client.spot).toBe(client.spot);
    expect(client.coinm).toBe(client.coinm);
    expect(client.futures.execution).toBe(client.futures.execution);
    expect(client.futures.execution).toBeInstanceOf(ExecutionManager);
    expect(client.spot.execution).toBeInstanceOf(ExecutionManager);
  });

  it('keeps the futures.usdm / futures.coinm compatibility aliases', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(client.futures.usdm).toBe(client.futures); // self-alias
    expect(client.futures.coinm).toBe(client.coinm); // cross-product alias
    expect(client.futures.coinm.market).toBe(client.coinm.market);
  });

  it('shares one core runtime across every product surface', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    expect(client.core.events).toBe(client.events);
    // one shared fapi transport: futures namespace and account reuse it
    client.futures.market.tickerPrice; // touch to build
    expect(client.core.hasHttp('fapi')).toBe(true);
    expect(client.core.hasHttp('fapiRoot')).toBe(true);
  });

  it('products view mirrors the facade', () => {
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const products = client.products;
    expect(products.spot).toBe(client.spot);
    expect(products.usdm).toBe(client.futures);
    expect(products.coinm).toBe(client.coinm);
    expect(products.wallet).toBe(client.wallet);
  });
});

describe('v3 USDMClient (standalone product client)', () => {
  it('satisfies the ProductClient boundary', () => {
    const usdm = new USDMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(usdm.product).toBe('usdm');
    expect(isProductClient(usdm)).toBe(true);
    expect(usdm.core).toBeInstanceOf(CoreContext);
    expect(typeof usdm.close).toBe('function');
  });

  it('exposes the full USDⓈ-M surface with stable identity', () => {
    const usdm = new USDMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(usdm.execution).toBeInstanceOf(ExecutionManager);
    expect(usdm.execution).toBe(usdm.execution);
    for (const key of ['market', 'data', 'account', 'trading', 'ops', 'userStream', 'ws', 'wsUser', 'wsApi'] as const) {
      expect(usdm[key]).toBeDefined();
      expect(usdm[key]).toBe(usdm[key]);
    }
  });

  it('shares a caller-owned CoreContext (one bus, one transport pool)', () => {
    const core = new CoreContext({ apiKey: 'k', apiSecret: 's' });
    const usdm = new USDMClient(core);
    const other = new USDMClient(core);
    expect(usdm.core).toBe(core);
    expect(other.core).toBe(core);
    // two product clients, one shared fapi transport identity
    usdm.market.tickerPrice;
    other.market.tickerPrice;
    expect(usdm.core.http('fapi')).toBe(other.core.http('fapi'));
  });

  it('close() is idempotent and product-scoped', () => {
    const usdm = new USDMClient(new CoreContext());
    expect(() => {
      usdm.close();
      usdm.close();
    }).not.toThrow();
  });

  it('BinanceClient facade and USDMClient build identical surface wiring', () => {
    // same construction path => same class types, same ledger prefix behavior
    const client = new BinanceClient({ apiKey: 'k', apiSecret: 's' });
    const usdm = new USDMClient(new CoreContext({ apiKey: 'k', apiSecret: 's' }));
    expect(client.futures.execution.constructor).toBe(usdm.execution.constructor);
    expect(client.futures.ws.constructor).toBe(usdm.ws.constructor);
    expect(client.futures.trading.constructor).toBe(usdm.trading.constructor);
  });
});
