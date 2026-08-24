import { createHmac } from 'node:crypto';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import Bottleneck from 'bottleneck';
import { BinanceApiError, BinanceAuthError, NetworkError, RateLimitError } from '../errors/index.js';

export type AuthMode = 'public' | 'apiKey' | 'signed';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface HttpClientOptions {
  baseURL: string;
  apiKey?: string;
  apiSecret?: string;
  recvWindow?: number;
  timeoutMs?: number;
  maxRetries?: number;
  minTimeMs?: number;
  rateLimitTokensPerSecond?: number;
  rateLimitMaxTokens?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryFactor?: number;
}

interface BinanceErrorBody {
  code?: number;
  msg?: string;
}

const RETRYABLE_STATUS = new Set([429, 418, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpClient {
  private readonly axios: AxiosInstance;
  private readonly limiter: Bottleneck;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly recvWindow: number;
  private readonly timeoutMs: number;
  private maxRetries: number;
  private minTimeMs: number;
  private retryBaseDelayMs: number;
  private retryMaxDelayMs: number;
  private retryFactor: number;
  private pendingRequests = 0;

  constructor(options: HttpClientOptions) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.recvWindow = options.recvWindow ?? 5000;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.minTimeMs = options.minTimeMs ?? 50;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 1000;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 30_000;
    this.retryFactor = options.retryFactor ?? 2;
    this.axios = axios.create({ baseURL: options.baseURL, timeout: this.timeoutMs });
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

  private async request<T>(
    method: HttpMethod,
    path: string,
    params: Record<string, unknown> | undefined,
    mode: AuthMode,
  ): Promise<T> {
    const url = this.buildUrl(path, params, mode);
    const config: AxiosRequestConfig = { method, url, headers: this.buildHeaders(mode) };
    return this.limiter.schedule(() => this.requestWithRetry<T>(config, 0));
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
    const requestData = { ...params, timestamp: Date.now(), recvWindow: this.recvWindow };
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
    if (!this.apiSecret) throw new BinanceAuthError('apiSecret');
    return createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  private requireApiKey(): string {
    if (!this.apiKey) throw new BinanceAuthError('apiKey');
    return this.apiKey;
  }

  private async requestWithRetry<T>(config: AxiosRequestConfig, attempt: number): Promise<T> {
    this.pendingRequests += 1;
    try {
      const res = await this.axios.request<T>(config);
      return res.data;
    } catch (err) {
      if (!axios.isAxiosError(err)) {
        throw new NetworkError('Unexpected error calling Binance API', err);
      }
      const status = err.response?.status;
      const body = err.response?.data as BinanceErrorBody | undefined;

      if (attempt < this.maxRetries && this.shouldRetry(err)) {
        await sleep(this.calculateDelay(attempt));
        return this.requestWithRetry<T>(config, attempt + 1);
      }

      if (status === 429 || status === 418) {
        throw new RateLimitError(body?.msg ?? 'Binance rate limit exceeded', body?.code ?? -1, status);
      }
      if (status && body) {
        throw new BinanceApiError(body.msg ?? 'Binance API error', body.code ?? -1, status);
      }
      throw new NetworkError(err.message, err);
    } finally {
      this.pendingRequests -= 1;
    }
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
