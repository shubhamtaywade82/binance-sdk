import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildSignaturePayload } from '../../src/ws/signature.js';
import { Signer } from '../../src/client/Signer.js';

describe('buildSignaturePayload', () => {
  it('reproduces the documented WS API signing payload exactly', () => {
    // Example from Binance's request-security page (HMAC vector).
    const payload = buildSignaturePayload({
      apiKey: 'TEST_API_KEY',
      price: '52000.00',
      quantity: '0.01000000',
      recvWindow: 100,
      side: 'SELL',
      symbol: 'BTCUSDT',
      timeInForce: 'GTC',
      timestamp: 1645423376532,
      type: 'LIMIT',
    });
    expect(payload).toBe(
      'apiKey=TEST_API_KEY' +
        '&price=52000.00&quantity=0.01000000&recvWindow=100&side=SELL&symbol=BTCUSDT' +
        '&timeInForce=GTC&timestamp=1645423376532&type=LIMIT',
    );
  });

  it('sorts by parameter name and excludes the signature field itself', () => {
    expect(buildSignaturePayload({ b: '2', a: '1', signature: 'xyz' })).toBe('a=1&b=2');
  });

  it('uses raw values with no percent-encoding', () => {
    expect(buildSignaturePayload({ note: 'a b&c=d/e' })).toBe('note=a b&c=d/e');
  });

  it('omits undefined and null values', () => {
    expect(buildSignaturePayload({ a: '1', b: undefined, c: null })).toBe('a=1');
  });

  it('renders booleans as their string form and rejects object values', () => {
    expect(buildSignaturePayload({ flag: true })).toBe('flag=true');
    expect(() => buildSignaturePayload({ nested: { x: 1 } })).toThrow(TypeError);
  });
});

describe('Ed25519 signing over the WS API payload', () => {
  it('produces a base64 signature that verifies against the public key', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const payload = buildSignaturePayload({ apiKey: 'key', timestamp: 1700000000000 });

    const signature = new Signer({ privateKey: pem, algorithm: 'ED25519' }).sign(payload);

    expect(Buffer.from(signature, 'base64')).toHaveLength(64);
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(verify(null, Buffer.from(payload), publicKey, Buffer.from(signature, 'base64'))).toBe(true);
  });

  it('a payload change invalidates the signature', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const signature = Buffer.from(
      new Signer({ privateKey: pem, algorithm: 'ED25519' }).sign('timestamp=1'),
      'base64',
    );
    expect(verify(null, Buffer.from('timestamp=2'), publicKey, signature)).toBe(false);
  });
});
