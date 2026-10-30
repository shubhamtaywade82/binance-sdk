import { describe, expect, it } from 'vitest';
import {
  USER_DATA_EVENTS,
  buildPrivateStreamUrl,
  fingerprintKey,
  isKnownUserDataEvent,
  redactPrivateUrl,
} from '../../src/ws/privateUrl.js';

describe('buildPrivateStreamUrl (USDⓈ-M /private routing)', () => {
  it('builds the migration-notice query form by default', () => {
    expect(
      buildPrivateStreamUrl({ baseUrl: 'wss://fstream.binance.com/private', listenKey: 'lk-123' }),
    ).toBe('wss://fstream.binance.com/private/ws?listenKey=lk-123');
  });

  it('joins multiple event names with the documented slash separator', () => {
    expect(
      buildPrivateStreamUrl({
        baseUrl: 'wss://fstream.binance.com/private',
        listenKey: 'lk',
        events: ['ORDER_TRADE_UPDATE', 'ACCOUNT_UPDATE'],
      }),
    ).toBe('wss://fstream.binance.com/private/ws?listenKey=lk&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE');
  });

  it('omits the events parameter when no event subscription is given (all events)', () => {
    const url = buildPrivateStreamUrl({
      baseUrl: 'wss://fstream.binance.com/private',
      listenKey: 'lk',
      events: [],
    });
    expect(url).not.toContain('events=');
  });

  it('percent-encodes the listen key', () => {
    const url = buildPrivateStreamUrl({
      baseUrl: 'wss://fstream.binance.com/private',
      listenKey: 'a b&c=d',
    });
    expect(url).toBe(
      `wss://fstream.binance.com/private/ws?listenKey=${encodeURIComponent('a b&c=d')}`,
    );
  });

  it('tolerates legacy bases that already end in /ws (no double /ws segment)', () => {
    expect(
      buildPrivateStreamUrl({ baseUrl: 'wss://fstream.binance.com/public/ws/', listenKey: 'lk' }),
    ).toBe('wss://fstream.binance.com/public/ws?listenKey=lk');
  });

  it('strips trailing slashes from the base', () => {
    expect(
      buildPrivateStreamUrl({ baseUrl: 'wss://fstream.binance.com/private/', listenKey: 'lk' }),
    ).toBe('wss://fstream.binance.com/private/ws?listenKey=lk');
  });

  it('supports the path-style escape hatch (user-data-streams page form)', () => {
    expect(
      buildPrivateStreamUrl({
        baseUrl: 'wss://fstream.binance.com/private',
        listenKey: 'lk 1',
        style: 'path',
      }),
    ).toBe(`wss://fstream.binance.com/private/ws/${encodeURIComponent('lk 1')}`);
  });

  it('returns null when there is no listen key (caller must not connect)', () => {
    expect(buildPrivateStreamUrl({ baseUrl: 'wss://x/private', listenKey: null })).toBeNull();
    expect(buildPrivateStreamUrl({ baseUrl: 'wss://x/private', listenKey: '' })).toBeNull();
    expect(buildPrivateStreamUrl({ baseUrl: 'wss://x/private', listenKey: undefined })).toBeNull();
  });

  it('rejects event names that are not plain protocol tokens', () => {
    expect(() =>
      buildPrivateStreamUrl({
        baseUrl: 'wss://x/private',
        listenKey: 'lk',
        events: ['ORDER_TRADE_UPDATE/ACCOUNT_UPDATE'],
      }),
    ).toThrow(/Invalid user-data event name/);
    expect(() =>
      buildPrivateStreamUrl({ baseUrl: 'wss://x/private', listenKey: 'lk', events: ['a b'] }),
    ).toThrow(/Invalid user-data event name/);
  });
});

describe('redactPrivateUrl (credential redaction for logs/events)', () => {
  it('redacts listen keys from query parameters', () => {
    expect(
      redactPrivateUrl('wss://fstream.binance.com/private/ws?listenKey=SECRETKEY&events=X'),
    ).toBe('wss://fstream.binance.com/private/ws?listenKey=<redacted>&events=X');
  });

  it('redacts listen keys from legacy path segments', () => {
    expect(redactPrivateUrl('wss://fstream.binance.com/public/ws/abcdefghij0123456789')).toBe(
      'wss://fstream.binance.com/public/ws/<redacted>',
    );
  });

  it('redacts signing material', () => {
    const url = 'wss://x/ws?apiKey=KEY&signature=SIG&listenKey=LK';
    expect(redactPrivateUrl(url)).toBe('wss://x/ws?apiKey=<redacted>&signature=<redacted>&listenKey=<redacted>');
  });
});

describe('user-data event helpers', () => {
  it('classifies the five natively modeled event types', () => {
    for (const name of USER_DATA_EVENTS) {
      expect(isKnownUserDataEvent(name)).toBe(true);
    }
    expect(isKnownUserDataEvent('TRADE_LITE')).toBe(false);
    expect(isKnownUserDataEvent('ALGO_UPDATE')).toBe(false);
    expect(isKnownUserDataEvent('')).toBe(false);
  });

  it('fingerprints keys without leaking them', () => {
    const fingerprint = fingerprintKey('aBcD1234efGh5678');
    expect(fingerprint).toContain('…');
    expect(fingerprint).not.toContain('efGh5678'.slice(0, -4));
    // Short keys are reduced to a length marker only.
    expect(fingerprintKey('key-1')).toBe('<5 chars>');
  });
});
