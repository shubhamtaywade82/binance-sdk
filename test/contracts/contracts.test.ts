import { describe, expect, it } from 'vitest';
import {
  canonicalPath,
  contractFor,
  describeContract,
  findContract,
  getContract,
  ENDPOINT_REGISTRY,
} from '../../src/contracts/index.js';

describe('contracts layer', () => {
  describe('canonicalPath', () => {
    it('prefixes bare paths with the base URL path segment', () => {
      expect(canonicalPath('https://api.binance.com/api/v3', '/order')).toBe('/api/v3/order');
      expect(canonicalPath('https://fapi.binance.com/fapi/v1', '/order')).toBe('/fapi/v1/order');
      expect(canonicalPath('https://dapi.binance.com/dapi/v1', '/positionRisk')).toBe(
        '/dapi/v1/positionRisk',
      );
    });

    it('passes version-prefixed paths through unchanged', () => {
      expect(canonicalPath('https://fapi.binance.com', '/fapi/v1/order')).toBe('/fapi/v1/order');
      expect(canonicalPath('https://api.binance.com', '/sapi/v1/capital/config/getall')).toBe(
        '/sapi/v1/capital/config/getall',
      );
      expect(canonicalPath('https://b.com/api/v3', '/fapi/v1/time')).toBe('/fapi/v1/time');
    });

    it('handles host-root base URLs and empty bases', () => {
      expect(canonicalPath('https://fapi.binance.com', '/fapi/v1/time')).toBe('/fapi/v1/time');
      expect(canonicalPath('', '/order')).toBe('/order');
      expect(canonicalPath('not a url', '/order')).toBe('/order');
    });
  });

  describe('findContract', () => {
    it('resolves method + canonical path to a contract with normalized security', () => {
      const contract = findContract('/api/v3/order', 'POST');
      expect(contract).toBeDefined();
      expect(contract?.product).toBe('spot');
      expect(contract?.operation).toBe('trading.createOrder');
      expect(contract?.security).toBe('signature');
      expect(contract?.declaredWeight).toBeUndefined(); // POST weight not in static map
    });

    it('attaches declared weights where documented', () => {
      expect(findContract('/api/v3/exchangeInfo', 'GET')?.declaredWeight).toBe(20);
      expect(findContract('/fapi/v1/order', 'GET')?.declaredWeight).toBe(1);
      expect(findContract('/api/v3/account', 'GET')?.declaredWeight).toBe(20);
    });

    it('distinguishes same path across methods', () => {
      expect(findContract('/api/v3/order', 'GET')?.operation).toBe('trading.getOrder');
      expect(findContract('/api/v3/order', 'DELETE')?.operation).toBe('trading.cancelOrder');
      expect(findContract('/api/v3/order', 'POST')?.operation).toBe('trading.createOrder');
    });

    it('path-only lookup finds any verb', () => {
      expect(findContract('/api/v3/time')).toBeDefined();
      expect(findContract('/api/v3/time')?.operation).toBe('market.serverTime');
    });

    it('returns undefined for unknown paths', () => {
      expect(findContract('/api/v3/nope', 'GET')).toBeUndefined();
      expect(findContract('/nope')).toBeUndefined();
    });
  });

  describe('getContract', () => {
    it('looks up by product + operation', () => {
      const contract = getContract('usdm', 'trading.createOrder');
      expect(contract?.path).toBe('/fapi/v1/order');
      expect(contract?.authentication).toBe('signed');
      expect(contract?.security).toBe('signature');
    });

    it('apiKey endpoints map to the apiKey scheme', () => {
      const contract = getContract('spot', 'userStream.create');
      expect(contract?.security).toBe('apiKey');
    });

    it('public endpoints map to none', () => {
      expect(getContract('spot', 'market.ping')?.security).toBe('none');
    });

    it('returns undefined for unknown operations', () => {
      expect(getContract('spot', 'trading.nonexistent')).toBeUndefined();
    });
  });

  describe('contractFor (HttpClient view)', () => {
    it('resolves bare spot resource paths against the spot base URL', () => {
      const meta = contractFor('https://api.binance.com/api/v3', 'POST', '/order');
      expect(meta?.product).toBe('spot');
      expect(meta?.operation).toBe('trading.createOrder');
      expect(meta?.authentication).toBe('signed');
      expect(meta?.security).toBe('signature');
    });

    it('resolves bare fapi paths against the futures base URL', () => {
      const meta = contractFor('https://fapi.binance.com/fapi/v1', 'GET', '/order');
      expect(meta?.product).toBe('usdm');
      expect(meta?.operation).toBe('trading.getOrder');
      expect(meta?.declaredWeight).toBe(1);
    });

    it('resolves sapi paths on the root base', () => {
      const meta = contractFor('https://api.binance.com', 'GET', '/sapi/v1/capital/deposit/hisrec');
      expect(meta?.product).toBe('wallet');
      expect(meta?.operation).toBe('deposit.history');
    });

    it('returns undefined for unregistered hosts/paths', () => {
      expect(contractFor('https://example.com', 'GET', '/ping')).toBeUndefined();
    });
  });

  describe('describeContract', () => {
    it('renders a one-line description with implementer', () => {
      const contract = getContract('spot', 'trading.createOrder');
      expect(contract).toBeDefined();
      const line = describeContract(contract!);
      expect(line).toContain('POST /api/v3/order');
      expect(line).toContain('[spot.trading.createOrder]');
      expect(line).toContain('auth=signed');
    });
  });

  it('every registry entry round-trips through getContract', () => {
    const missing = ENDPOINT_REGISTRY.filter(
      (entry) => getContract(entry.product, entry.operation) === undefined,
    );
    expect(missing).toEqual([]);
  });
});
