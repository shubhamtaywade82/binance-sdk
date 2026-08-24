import { createHmac, generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Signer } from '../../src/client/Signer.js';

describe('Signer', () => {
  it('defaults to HMAC when only an apiSecret is provided', () => {
    const signer = new Signer({ apiSecret: 'secret' });
    expect(signer.algorithm).toBe('HMAC');
    expect(signer.canSign()).toBe(true);
    expect(signer.sign('a=1&b=2')).toBe(createHmac('sha256', 'secret').update('a=1&b=2').digest('hex'));
  });

  it('reports it cannot sign when no credentials are configured', () => {
    const signer = new Signer({});
    expect(signer.canSign()).toBe(false);
    expect(() => signer.sign('a=1')).toThrow('apiSecret is required for HMAC signing');
  });

  it('signs with Ed25519 when a private key is provided and defaults the algorithm', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const signer = new Signer({ privateKey: pem });
    expect(signer.algorithm).toBe('ED25519');
    expect(signer.canSign()).toBe(true);

    const payload = 'symbol=BTCUSDT&side=BUY&timestamp=1700000000000';
    const signature = signer.sign(payload);
    const isValid = cryptoVerify(null, Buffer.from(payload), publicKey, Buffer.from(signature, 'base64'));
    expect(isValid).toBe(true);
  });

  it('signs with RSA when explicitly requested', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const signer = new Signer({ algorithm: 'RSA', privateKey: pem });
    expect(signer.algorithm).toBe('RSA');

    const payload = 'symbol=ETHUSDT&side=SELL&timestamp=1700000000000';
    const signature = signer.sign(payload);
    const isValid = cryptoVerify('RSA-SHA256', Buffer.from(payload), publicKey, Buffer.from(signature, 'base64'));
    expect(isValid).toBe(true);
  });
});
