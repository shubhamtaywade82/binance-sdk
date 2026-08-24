import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import Bottleneck from 'bottleneck';
import { BinanceApiError, BinanceAuthError, NetworkError, RateLimitError } from '../errors/index.js';
import { RateLimitTracker, type RateLimitUsage } from './RateLimitTracker.js';
import { Signer, type SignatureAlgorithm } from './Signer.js';

export type AuthMode = 'public' | 'apiKey' | 'signed';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type { SignatureAlgorithm };

export interface HttpClientOptions {
  baseURL: string;
  apiKey?: string;
  apiSecret?: string;
  /** PEM-encoded Ed25519 or RSA private key. When set, requests are signed with it instead of HMAC. */
  privateKey?: string | Buffer;
  /** Defaults to 'ED25519' when privateKey is set, otherwise 'HMAC'. */
  signatureAlgorithm?: SignatureAlgorithm;
  recvWindow?: number;
  timeoutMs?: number;
  maxRetries?: number;
  minTimeMs?: number;
  /** @deprecated unused; superseded by header-based tracking (rateLimitWeightPerMinute/rateLimitSafetyMargin). */
  rateLimitTokensPerSecond?: number;
  /** @deprecated unused; superseded by header-based tracking (rateLimitWeightPerMinute/rateLimitSafetyMargin). */
  rateLimitMaxTokens?: number;
  /** Assumed per-minute IP weight ceiling used to preempt -1003 bans. Binance's default is 6000 for most REST hosts. */
  rateLimitWeightPerMinute?: number;
  /** Fraction of rateLimitWeightPerMinute at which requests are delayed until the next minute window. Set >=1 to disable. */
  rateLimitSafetyMargin?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryFactor?: number;
  /** Custom keep-alive/https agent, e.g. for corporate proxies or connection pooling. */
  httpsAgent?: AxiosRequestConfig['httpsAgent'];
  /** Axios proxy configuration. */
  proxy?: AxiosRequestConfig['proxy'];
}

interface BinanceErrorBody {
  code?: number;
  msg?: string;
}

const RETRYABLE_STATUS = new Set([429, 418, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers || typeof headers !== 'object') return result;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value !== undefined && value !== null) result[key.toLowerCase()] = String(value);
  }
  return result;
}

export class HttpClient {
  private readonly axios: AxiosInstance;
  private readonly limiter: Bottleneck;
  private readonly signer: Signer;
  private readonly rateLimitTracker: RateLimitTracker;
  private readonly apiKey?: string;
  private readonly recvWindow: number;
  private readonly timeoutMs: number;
  private maxRetries: number;
  private minTimeMs: number;
  private retryBaseDelayMs: number;
  private retryMaxDelayMs: number;
  private retryFactor: number;
  private pendingRequests = 0;
  private timeOffsetMs = 0;

  constructor(options: HttpClientOptions) {
    this.apiKey = options.apiKey;
    this.recvWindow = options.recvWindow ?? 5000;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.minTimeMs = options.minTimeMs ?? 50;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 30_000;
    this.retryFactor = options.retryFactor ?? 2;
    this.signer = new Signer({
      algorithm: options.signatureAlgorithm,
      apiSecret: options.apiSecret,
      privateKey: options.privateKey,
    });
    this.rateLimitTracker = new RateLimitTracker({
      weightLimitPerMinute: options.rateLimitWeightPerMinute,
      safetyMargin: options.rateLimitSafetyMargin,
    });
    this.axios = axios.create({
      baseURL: options.baseURL,
      timeout: this.timeoutMs,
      httpsAgent: options.httpsAgent,
      proxy: options.proxy,
    });
    this.limiter = new Bottleneck({ minTime: this.minTimeMs });
  }

  async get<T>(path: string, params?: Record<string, unknown>, mode: AuthMode = 'public'): Promise<T> {
    return this.request<T>('GET', path, params, mode);
  }

  async post<T>(path: string, params?: Record<string, unknown>, mode: AuthMode = 'public'): Promise<T> {
    return this.request<T>('POST', path, params, mode);
  }

  async put<T>(path: string, params?: Record<string, unknown>, mode: AuthMode = 'public'): Promise<T> {
    return this.request<T>('PUT', path, params, mode);
  }

  async delete<T>(path: string, params?: Record<string, unknown>, mode: AuthMode = 'public'): Promise<T> {
    return this.request<T>('DELETE', path, params, mode);
  }

  getRateLimiterStatus(): { minTimeMs: number; queueLength: number } {
    return { minTimeMs: this.minTimeMs, queueLength: this.pendingRequests };
  }

  /** Snapshot of the most recently observed `X-MBX-USED-WEIGHT-*` / `X-MBX-ORDER-COUNT-*` response headers. */
  getRateLimitUsage(): Readonly<RateLimitUsage> {
    return this.rateLimitTracker.getUsage();
  }

  configureRateLimiter(options: { minTimeMs?: number }): void {
    if (options.minTimeMs !== undefined) {
      this.minTimeMs = options.minTimeMs;
      this.limiter.updateSettings({ minTime: this.minTimeMs });
    }
  }

  getRetryConfig(): {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    factor: number;
  } {
    return {
      maxRetries: this.maxRetries,
      baseDelayMs: this.retryBaseDelayMs,
      maxDelayMs: this.retryMaxDelayMs,
      factor: this.retryFactor,
    };
  }

  configureRetry(options: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number; factor?: number }): void {
    if (options.maxRetries !== undefined) this.maxRetries = options.maxRetries;
    if (options.baseDelayMs !== undefined) this.retryBaseDelayMs = options.baseDelayMs;
    if (options.maxDelayMs !== undefined) this.retryMaxDelayMs = options.maxDelayMs;
    if (options.factor !== undefined) this.retryFactor = options.factor;
  }

  /**
   * Fetches server time from `timePath` (e.g. '/time', '/fapi/v1/time', '/dapi/v1/time') and
   * stores the offset from local time, applied to every signed request's `timestamp` param.
   * Mitigates `-1021` (timestamp outside recvWindow) errors caused by local clock drift.
   */
  async syncTime(timePath = '/time'): Promise<number> {
    const res = await this.axios.request<{ serverTime: number }>({ method: 'GET', url: timePath });
    this.timeOffsetMs = res.data.serverTime - Date.now();
    return this.timeOffsetMs;
  }

  getTimeOffsetMs(): number {
    return this.timeOffsetMs;
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    params: Record<string, unknown> | undefined,
    mode: AuthMode,
  ): Promise<T> {
    const url = this.buildUrl(path, params, mode);
    const config: AxiosRequestConfig = { method, url, headers: this.buildHeaders(mode) };
    return this.limiter.schedule(async () => {
      const throttleMs = this.rateLimitTracker.getThrottleDelayMs();
      if (throttleMs > 0) await sleep(throttleMs);
      return this.requestWithRetry<T>(config, 0, method, path);
    });
  }

  private buildHeaders(mode: AuthMode): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'binance-sdk',
    };
    if (mode !== 'public') headers['X-MBX-APIKEY'] = this.requireApiKey();
    return headers;
  }

  private buildUrl(
    path: string,
    params: Record<string, unknown> | undefined,
    mode: AuthMode,
  ): string {
    if (mode !== 'signed') return this.appendQuery(path, params);
    const requestData = { ...params, timestamp: Date.now() + this.timeOffsetMs, recvWindow: this.recvWindow };
    const queryString = this.buildQueryString(requestData);
    const signature = this.sign(queryString);
    return `${path}?${queryString}&signature=${signature}`;
  }

  private appendQuery(path: string, params: Record<string, unknown> | undefined): string {
    const queryString = this.buildQueryString(params);
    return queryString ? `${path}?${queryString}` : path;
  }

  private buildQueryString(params: Record<string, unknown> | undefined): string {
    if (!params) return '';
    return Object.entries(params)
      .filter(([, val]) => val !== undefined && val !== null)
      .flatMap(([key, val]) =>
        Array.isArray(val)
          ? val.map((item) => `${key}=${encodeURIComponent(String(item))}`)
          : [`${key}=${encodeURIComponent(String(val))}`],
      )
      .join('&');
  }

  private sign(queryString: string): string {
    if (!this.signer.canSign()) {
      throw new BinanceAuthError(this.signer.algorithm === 'HMAC' ? 'apiSecret' : 'privateKey');
    }
    return this.signer.sign(queryString);
  }

  private requireApiKey(): string {
    if (!this.apiKey) throw new BinanceAuthError('apiKey');
    return this.apiKey;
  }

  private async requestWithRetry<T>(
    config: AxiosRequestConfig,
    attempt: number,
    method: HttpMethod,
    endpoint: string,
  ): Promise<T> {
    this.pendingRequests += 1;
    try {
      const res = await this.axios.request<T>(config);
      this.rateLimitTracker.update(normalizeHeaders(res.headers));
      return res.data;
    } catch (err) {
      if (!axios.isAxiosError(err)) {
        throw new NetworkError('Unexpected error calling Binance API', err);
      }
      const status = err.response?.status;
      const body = err.response?.data as BinanceErrorBody | undefined;
      const headers = normalizeHeaders(err.response?.headers);
      this.rateLimitTracker.update(headers);

      if (attempt < this.maxRetries && this.shouldRetry(err)) {
        await sleep(this.calculateDelay(attempt));
        return this.requestWithRetry<T>(config, attempt + 1, method, endpoint);
      }

      const context = { endpoint, method, headers };
      if (status === 429 || status === 418) {
        throw new RateLimitError(
          body?.msg ?? 'Binance rate limit exceeded',
          body?.code ?? -1,
          status,
          this.parseRetryAfterMs(headers),
          context,
        );
      }
      if (status && body) {
        throw new BinanceApiError(body.msg ?? 'Binance API error', body.code ?? -1, status, context);
      }
      throw new NetworkError(err.message, err);
    } finally {
      this.pendingRequests -= 1;
    }
  }

  private parseRetryAfterMs(headers: Record<string, string>): number | undefined {
    const raw = headers['retry-after'];
    if (!raw) return undefined;
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? seconds * 1000 : undefined;
  }

  private shouldRetry(err: { response?: { status?: number } }): boolean {
    if (err.response?.status !== undefined) return RETRYABLE_STATUS.has(err.response.status);
    return true;
  }

  private calculateDelay(attempt: number): number {
    const delay = Math.min(this.retryBaseDelayMs * this.retryFactor ** attempt, this.retryMaxDelayMs);
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }
}
