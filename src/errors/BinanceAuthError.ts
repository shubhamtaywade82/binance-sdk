import { BinanceError } from './BinanceError.js';

export class BinanceAuthError extends BinanceError {
  readonly missing: 'apiKey' | 'apiSecret' | 'privateKey';

  constructor(missing: 'apiKey' | 'apiSecret' | 'privateKey') {
    super(`API ${missing} required for authenticated requests`);
    this.name = 'BinanceAuthError';
    this.missing = missing;
  }
}
