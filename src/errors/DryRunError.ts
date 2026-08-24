import { BinanceError } from './BinanceError.js';

/**
 * Thrown instead of sending a mutating request when the client is in dry-run mode.
 *
 * Dry run deliberately throws rather than returning a synthetic success payload: a fabricated
 * orderId would lead an agent to believe an order exists and then try to manage or cancel it.
 * Failing loudly — while carrying the exact request that *would* have been sent — is the only
 * safe signal. Tool layers should catch this and surface `describe()` back to the model.
 */
export class DryRunError extends BinanceError {
  readonly method: string;
  readonly endpoint: string;
  readonly params: Record<string, unknown>;

  constructor(method: string, endpoint: string, params: Record<string, unknown> = {}) {
    super(`DRY RUN — request not sent: ${method} ${endpoint} ${JSON.stringify(params)}`);
    this.name = 'DryRunError';
    this.method = method;
    this.endpoint = endpoint;
    this.params = params;
  }

  /** Human/LLM-readable description of the suppressed request. */
  describe(): string {
    return `Would have sent ${this.method} ${this.endpoint} with ${JSON.stringify(this.params)}`;
  }
}
