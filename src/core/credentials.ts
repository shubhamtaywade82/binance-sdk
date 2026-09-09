import type { SignatureAlgorithm } from '../client/Signer.js';

/**
 * v3 credential abstraction.
 *
 * The v2 client scattered `apiKey`/`apiSecret`/`privateKey`/
 * `signatureAlgorithm` through options objects and into three separate
 * constructors (HttpClient, WsApi, SpotWsApi). v3 funnels all authentication
 * material through one object that answers the questions every subsystem
 * actually asks:
 *
 *  - *can we sign at all?* (`canSign`) — market-data-only clients,
 *    the paper backend and MCP read-only hosts run without keys;
 *  - *which algorithm?* — HMAC (default), RSA or Ed25519, resolved once
 *    instead of defaulting independently at each construction site;
 *  - *is this a public-only client?* — products decide whether to throw
 *    on signed calls or route them to the paper backend instead.
 *
 * This is a value object: it never performs I/O, never refreshes tokens
 * (Binance API keys do not expire), and is safe to share across every
 * product client constructed from the same {@link CoreContext}.
 */
export class Credentials {
  readonly apiKey?: string;
  readonly apiSecret?: string;
  readonly privateKey?: string | Buffer;
  readonly signatureAlgorithm: SignatureAlgorithm;

  constructor(init: {
    apiKey?: string;
    apiSecret?: string;
    privateKey?: string | Buffer;
    signatureAlgorithm?: SignatureAlgorithm;
  }) {
    this.apiKey = init.apiKey;
    this.apiSecret = init.apiSecret;
    this.privateKey = init.privateKey;
    // Same inference as HttpClient: an explicit algorithm wins; a private
    // key without one means Ed25519 (Binance's PEM convention); otherwise HMAC.
    this.signatureAlgorithm =
      init.signatureAlgorithm ?? (init.privateKey !== undefined ? 'ED25519' : 'HMAC');
  }

  /** True when the material needed to sign requests is present. */
  get canSign(): boolean {
    if (this.signatureAlgorithm === 'HMAC') {
      return Boolean(this.apiKey && this.apiSecret);
    }
    return Boolean(this.apiKey && this.privateKey);
  }

  /** True when at least an API key is present (TRADE/MARGIN endpoints). */
  get hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * The header/query credential payload, when present. Returns `undefined`
   * for fully public (market-data-only) clients so callers never send an
   * `X-MBX-APIKEY: undefined` header.
   */
  get apiKeyOrNull(): string | undefined {
    return this.apiKey;
  }

  /** Redacted description for logs and `execution_status`-style surfaces. */
  describe(): string {
    if (!this.hasApiKey) return 'public (no credentials)';
    return `${this.signatureAlgorithm.toLowerCase()} key ****${this.apiKey!.slice(-4)}${
      this.canSign ? '' : ' (unsigned)'
    }`;
  }

  static fromOptions(options: {
    apiKey?: string;
    apiSecret?: string;
    privateKey?: string | Buffer;
    signatureAlgorithm?: SignatureAlgorithm;
  }): Credentials {
    return new Credentials(options);
  }
}
