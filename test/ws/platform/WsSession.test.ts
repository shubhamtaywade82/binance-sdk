import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { WsSession, type WsSessionTransport } from '../../../src/ws/platform/WsSession.js';
import { BinanceError } from '../../../src/errors/BinanceError.js';

function ed25519Pem(): string {
  const { privateKey } = generateKeyPairSync('ed25519');
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

describe('WsSession', () => {
  it('rejects when apiKey is missing', () => {
    expect(() => new WsSession({ apiKey: '', privateKey: ed25519Pem() })).toThrow(BinanceError);
  });

  it('rejects when privateKey is missing', () => {
    expect(() => new WsSession({ apiKey: 'key', privateKey: '' })).toThrow(BinanceError);
  });

  it('rejects non-ed25519 methods (Binance only honours Ed25519 for session.logon)', () => {
    expect(
      () => new WsSession({ apiKey: 'k', privateKey: ed25519Pem(), method: 'ed25519' as never }),
    ).not.toThrow();
    // The runtime guard only triggers when method != 'ed25519' — verified below:
    expect(
      () =>
        new WsSession({
          apiKey: 'k',
          privateKey: ed25519Pem(),
          method: 'hmac' as never,
        }),
    ).toThrow(BinanceError);
  });

  it('signs payload deterministically with Ed25519 (sub-ms path, zero deps)', () => {
    const session = new WsSession({ apiKey: 'pk123', privateKey: ed25519Pem() });
    const sig1 = session.signPayload('apiKey=pk123&timestamp=1700000000000');
    const sig2 = session.signPayload('apiKey=pk123&timestamp=1700000000000');
    expect(sig1).toEqual(sig2);
    expect(sig1).toMatch(/^[A-Za-z0-9+/=]+$/);
    // base64 signature length for Ed25519 is 88 chars (64 raw bytes -> 88 base64).
    expect(sig1.length).toBe(88);
  });

  it('logon issues session.logon with Ed25519 signature over the canonical query string', async () => {
    const session = new WsSession({ apiKey: 'pk123', privateKey: ed25519Pem(), name: 'test' });
    expect(session.isAuthenticated).toBe(false);

    const transport: WsSessionTransport = {
      async sendRpc<T = unknown>(method: string, params: Record<string, unknown>) {
        expect(method).toBe('session.logon');
        expect(params.apiKey).toBe('pk123');
        expect(typeof params.timestamp).toBe('number');
        expect(typeof params.signature).toBe('string');
        expect((params.signature as string).length).toBe(88);
        return {
          id: 'req-1',
          status: 200,
          result: {
            apiKey: 'pk123',
            authorizedSince: 1_700_000_000_000,
            connectedSince: 1_700_000_000_000,
            returnRateLimits: false,
            serverTime: 1_700_000_000_000,
            userDataStream: false,
          },
        } as never;
      },
    };
    const result = await session.logon(transport);
    expect(result.apiKey).toBe('pk123');
    expect(session.isAuthenticated).toBe(true);
    expect(session.authorizedAt).toBe(1_700_000_000_000);
    expect(session.connectedAt).toBe(1_700_000_000_000);
  });

  it('logon surfaces a non-200 status as a BinanceError and clears authenticated state', async () => {
    const session = new WsSession({ apiKey: 'pk123', privateKey: ed25519Pem() });
    const transport: WsSessionTransport = {
      async sendRpc<T = unknown>(_method: string, _params: Record<string, unknown>) {
        return { id: 'r1', status: 400, result: {} as never, error: { code: -3006, msg: 'ed25519 required' } } as never;
      },
    };
    await expect(session.logon(transport)).rejects.toThrow(BinanceError);
    expect(session.isAuthenticated).toBe(false);
  });

  it('buildAuthenticatedFrame omits credentials when authenticated, signs when not', () => {
    const session = new WsSession({ apiKey: 'pk123', privateKey: ed25519Pem() });

    // Not authenticated -> per-call signing.
    const signedFrame = session.buildAuthenticatedFrame('order.place', {
      symbol: 'BTCUSDT',
      side: 'BUY',
    });
    expect(signedFrame.signed).toBe(true);
    expect(signedFrame.params.apiKey).toBe('pk123');
    expect(typeof signedFrame.params.timestamp).toBe('number');
    expect(typeof signedFrame.params.signature).toBe('string');

    // Mark authenticated via logon -> clean payload.
    (session as unknown as { authenticated: boolean }).authenticated = true;
    const cleanFrame = session.buildAuthenticatedFrame('order.place', {
      symbol: 'BTCUSDT',
      side: 'BUY',
    });
    expect(cleanFrame.signed).toBe(false);
    expect(cleanFrame.params.apiKey).toBeUndefined();
    expect(cleanFrame.params.signature).toBeUndefined();
    expect(cleanFrame.params.timestamp).toBeUndefined();
    expect(cleanFrame.params.symbol).toBe('BTCUSDT');
  });

  it('clearSession resets authenticated state (called by transport on dropped socket)', async () => {
    const session = new WsSession({ apiKey: 'pk', privateKey: ed25519Pem() });
    const transport: WsSessionTransport = {
      async sendRpc<T = unknown>(_method: string, _params: Record<string, unknown>) {
        return {
          id: 'r1',
          status: 200,
          result: {
            apiKey: 'pk',
            authorizedSince: 1,
            connectedSince: 1,
            returnRateLimits: false,
            serverTime: 1,
            userDataStream: false,
          },
        } as never;
      },
    };
    await session.logon(transport);
    expect(session.isAuthenticated).toBe(true);
    session.clearSession();
    expect(session.isAuthenticated).toBe(false);
    expect(session.authorizedAt).toBeNull();
    expect(session.connectedAt).toBeNull();
  });

  it('logout is a no-op when not authenticated, otherwise issues session.logout', async () => {
    const session = new WsSession({ apiKey: 'pk', privateKey: ed25519Pem() });
    const noopTransport: WsSessionTransport = {
      async sendRpc<T = unknown>(_method: string, _params: Record<string, unknown>) {
        return { id: '1', status: 200, result: {} as never } as never;
      },
    };
    expect(await session.logout(noopTransport)).toBeNull();

    // Authenticate then log out.
    const logonTransport: WsSessionTransport = {
      async sendRpc<T = unknown>(_method: string, _params: Record<string, unknown>) {
        return {
          id: '1',
          status: 200,
          result: {
            apiKey: 'pk',
            authorizedSince: 1,
            connectedSince: 1,
            returnRateLimits: false,
            serverTime: 1,
            userDataStream: false,
          },
        } as never;
      },
    };
    await session.logon(logonTransport);
    let called = false;
    const logoutTransport: WsSessionTransport = {
      async sendRpc<T = unknown>(method: string, _params: Record<string, unknown>) {
        called = true;
        expect(method).toBe('session.logout');
        return { id: '2', status: 200, result: { apiKey: 'pk', serverTime: 2 } as never } as never;
      },
    };
    const result = await session.logout(logoutTransport);
    expect(called).toBe(true);
    expect(result?.apiKey).toBe('pk');
    expect(session.isAuthenticated).toBe(false);
  });
});
