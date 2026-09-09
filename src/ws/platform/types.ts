/**
 * v3 WebSocket platform — shared types.
 *
 * Milestone 2 turns the per-class WS plumbing of v2 (each product namespace
 * building its own sockets, callers juggling raw EventEmitter surfaces) into
 * a platform: one place where connections are pooled, subscriptions are
 * refcounted objects, liveness/renewal are centrally scheduled, and the WS
 * API becomes a persistent promise-oriented client.
 */

/** Market-stream families the platform pools. Grows with product migration. */
export type WsFamily = 'usdm' | 'spot' | 'coinm';

/** Consumer-visible lifecycle of a {@link Subscription}. */
export type SubscriptionState = 'pending' | 'live' | 'closed';

/** Per-family Binance connection limits (documented server behavior). */
export interface WsFamilyLimits {
  /** Maximum streams one combined-stream connection may carry. */
  maxStreamsPerConnection: number;
  /** Default cap on pooled connections for the family. */
  defaultMaxConnections: number;
}

/** Documented Binance limits per market-stream family. */
export const WS_FAMILY_LIMITS: Record<WsFamily, WsFamilyLimits> = {
  // USDⓈ-M combined streams: 200 per connection (Binance futures docs).
  usdm: { maxStreamsPerConnection: 200, defaultMaxConnections: 10 },
  // Spot combined streams: 1024 per connection (Binance spot docs).
  spot: { maxStreamsPerConnection: 1024, defaultMaxConnections: 4 },
  // COIN-M combined streams: 200 per connection (Binance coin-m docs).
  coinm: { maxStreamsPerConnection: 200, defaultMaxConnections: 10 },
};

/**
 * Platform-wide defaults. Renewal rotates connections at 23h (one hour before
 * Binance's 24h kill) with jitter so a pool never rotates in a herd; the
 * heartbeat treats a connection as dead after 10 minutes of total silence
 * (the server pings every 3 minutes, so three missed pings means the network
 * path is gone).
 */
export const WS_PLATFORM_DEFAULTS = {
  /** Proactive renewal window (Binance kills stream connections at 24h). */
  rotationMs: 23 * 60 * 60 * 1000,
  /** Per-connection renewal jitter window, decorrelates pool rotations. */
  renewalJitterMs: 10 * 60 * 1000,
  /** Pool-level liveness: silence threshold that triggers a reconnect. */
  staleMs: 10 * 60 * 1000,
  /** Heartbeat sampling interval. */
  heartbeatIntervalMs: 30_000,
  /** Renewals that may overlap across the whole platform. */
  maxConcurrentRenewals: 1,
  /** Default confirm timeout for subscriptions and WS API requests. */
  requestTimeoutMs: 10_000,
  /** Default reconnect backoff bounds. */
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
} as const;

/** Reconnect backoff strategy — see {@link ReconnectPolicy}. */
export interface ReconnectPolicy {
  /** Delay in milliseconds before reconnect attempt `attempt` (0-based). */
  delayForMs(attempt: number): number;
}

/** Structural state snapshot of one pooled connection. */
export interface WsConnectionStats {
  /** Pool-assigned name, e.g. `usdmMarket[0]`. */
  name: string;
  family: WsFamily;
  /** Raw connection state machine value. */
  state: string;
  /** Streams the caller asked for on this connection. */
  desiredStreams: number;
  /** Streams the server confirmed on the current socket. */
  confirmedStreams: number;
  /** Current reconnect backoff attempt, 0 while healthy. */
  reconnectAttempt: number;
  /** Milliseconds since the last inbound frame (data, ping or pong). */
  msSinceLastActivity: number;
  /** Epoch-ms of the next scheduled renewal, when centrally managed. */
  nextRenewalAt: number | null;
}

/** Aggregate platform snapshot — cheap, no I/O. */
export interface WsPlatformStats {
  families: Partial<Record<WsFamily, { connections: WsConnectionStats[]; activeStreams: number }>>;
  wsApi: { name: string; state: string; pendingRequests: number }[];
}

/** Options for family-scoped subscription calls. */
export interface SubscribeOptions {
  /** How long to wait for the server to confirm the streams. Default 10s. */
  confirmTimeoutMs?: number;
}
