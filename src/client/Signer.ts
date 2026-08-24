import { createHmac, createPrivateKey, createSign, sign as cryptoSign, type KeyObject } from 'node:crypto';

export type SignatureAlgorithm = 'HMAC' | 'ED25519' | 'RSA';

export interface SignerOptions {
  algorithm?: SignatureAlgorithm;
  /** HMAC secret string. Required when algorithm is 'HMAC' (the default). */
  apiSecret?: string;
  /** PEM-encoded private key (or raw Buffer). Required for 'ED25519' and 'RSA'. */
  privateKey?: string | Buffer;
}

/**
 * Signs Binance request payloads. HMAC-SHA256 (the classic API-secret flow) is the default;
 * Ed25519 and RSA keys — which Binance now recommends over HMAC — are signed via `privateKey`.
 */
export class Signer {
  readonly algorithm: SignatureAlgorithm;
  private readonly apiSecret?: string;
  private readonly privateKey?: KeyObject;

  constructor(options: SignerOptions) {
    this.algorithm = options.algorithm ?? (options.privateKey ? 'ED25519' : 'HMAC');
    this.apiSecret = options.apiSecret;
    if (options.privateKey) {
      this.privateKey = createPrivateKey(options.privateKey);
    }
  }

  canSign(): boolean {
    return this.algorithm === 'HMAC' ? Boolean(this.apiSecret) : Boolean(this.privateKey);
  }

  sign(payload: string): string {
    switch (this.algorithm) {
      case 'HMAC': {
        if (!this.apiSecret) throw new Error('apiSecret is required for HMAC signing');
        return createHmac('sha256', this.apiSecret).update(payload).digest('hex');
      }
      case 'ED25519': {
        if (!this.privateKey) throw new Error('privateKey is required for ED25519 signing');
        return cryptoSign(null, Buffer.from(payload), this.privateKey).toString('base64');
      }
      case 'RSA': {
        if (!this.privateKey) throw new Error('privateKey is required for RSA signing');
        return createSign('RSA-SHA256').update(payload).sign(this.privateKey, 'base64');
      }
      default: {
        const exhaustive: never = this.algorithm;
        throw new Error(`Unsupported signature algorithm: ${String(exhaustive)}`);
      }
    }
  }
}
