import { EventEmitter } from 'node:events';
import WebSocket, { type RawData } from 'ws';
import type { SdkLogger } from '../util/logger.js';
import { silentLogger } from '../util/logger.js';
import { WsState } from './BaseWS.js';

export { WsState };

export interface UserWSBaseOptions {
  baseUserUrl: string;
  /** The listenKey to connect with, re-read on every (re)connect. Null means "not ready". */
  getListenKey: () => string | null;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  /** Message shown when no listenKey is available. */
  missingListenKeyMessage?: string;
  logger?: SdkLogger;
}

/**
 * Shared lifecycle for listenKey user-data WebSocket connections (futures,
 * spot, COIN-M). Implements the same state machine guarantees as BaseWS:
 *
 * - exactly one authoritative socket at any time,
 * - superseded sockets are retired with their listeners detached, so a close
 *   event from an old connection can never schedule a duplicate reconnect,
 * - exponential backoff on unplanned drops, no reconnection after close(),
 * - the listenKey is re-read on every reconnect, so a rotated key (reissued
 *   via the REST keep-alive flow) is picked up automatically.
 *
 * Subclasses only supply the payload parser in `handlePayload`.
 */
export abstract class UserWSBase extends EventEmitter {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private state: WsState = WsState.IDLE;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly logger: SdkLogger;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly missingListenKeyMessage: string;

  protected constructor(private readonly options: UserWSBaseOptions) {
    super();
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.missingListenKeyMessage = options.missingListenKeyMessage ?? 'No listenKey available for user data stream';
    this.logger = options.logger ?? silentLogger;
  }

  /** Current lifecycle state of the connection. */
  getState(): WsState {
    return this.state;
  }

  /** Open the connection (no-op if already live/connecting). */
  connect(): void {
    if (
      this.state === WsState.CONNECTING ||
      this.state === WsState.OPEN ||
      this.state === WsState.RECONNECTING
    ) {
      return;
    }
    this.spawnSocket();
  }

  close(): void {
    if (this.state === WsState.CLOSED) return;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket) this.retireSocket(socket);
    this.transition(WsState.CLOSED);
    this.logger.info('closed-by-user');
  }

  /** Controlled restart: retire the current socket silently, reconnect immediately once. */
  reconnect(): void {
    if (this.state === WsState.CLOSED || this.state === WsState.CLOSING) return;
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;

    const socket = this.socket;
    this.socket = null;
    if (socket) this.retireSocket(socket); // close handler detached → no duplicate reconnect

    this.transition(WsState.RECONNECTING);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state === WsState.RECONNECTING) this.spawnSocket();
    }, 0);
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempt = 0;
  }

  /** Subclasses parse one raw JSON message into a typed user-data event and emit it. */
  protected abstract handlePayload(raw: string): void;

  private spawnSocket(): void {
    const listenKey = this.options.getListenKey();
    if (!listenKey) {
      this.emit('error', new Error(this.missingListenKeyMessage));
      return;
    }

    this.transition(WsState.CONNECTING);
    const socket = new WebSocket(`${this.options.baseUserUrl}/${listenKey}`);
    this.socket = socket;

    socket.on('open', () => {
      if (this.socket !== socket) {
        this.retireSocket(socket);
        return;
      }
      this.reconnectAttempt = 0;
      this.transition(WsState.OPEN);
      this.logger.info('connected');
      this.emit('open');
    });

    socket.on('message', (raw: RawData) => {
      if (this.socket !== socket) return;
      this.handlePayload(raw.toString());
    });

    socket.on('error', (err: Error) => {
      if (this.socket !== socket) return;
      this.emit('error', err);
      // 'close' always follows 'error' in ws — reconnect handled there.
    });

    socket.on('close', (code: number, reason: Buffer) => {
      if (this.socket !== socket) return; // stale socket — inert
      this.socket = null;
      this.emit('close', code, reason.toString());
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (this.state === WsState.CLOSED || this.state === WsState.CLOSING) return;
    this.transition(WsState.RECONNECTING);

    const delay = Math.min(this.reconnectDelayMs * 2 ** this.reconnectAttempt, this.maxReconnectDelayMs);
    this.reconnectAttempt += 1;
    this.logger.info('reconnect-scheduled', { delayMs: delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state === WsState.RECONNECTING) this.spawnSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private retireSocket(socket: WebSocket): void {
    socket.removeAllListeners();
    socket.on('error', () => undefined);
    try {
      socket.close();
    } catch {
      /* already closed or closing */
    }
  }

  private transition(state: WsState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('state', state);
  }
}
